"use server";

// Server actions for the Instructions section. Read access goes through
// requireAdminAccess (any logged-in user); writes are gated to super_admin.
//
// Slug is generated on create from the title (lowercase, hyphenated). If a
// collision happens we append a short random suffix rather than failing the
// save — admins shouldn't have to think about URL slugs.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";

const upsertSchema = z.object({
  title: z.string().min(1, "Title required").max(200),
  bodyMd: z.string().max(100_000).default(""),
  position: z
    .preprocess((v) => {
      if (v === "" || v == null) return 0;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isNaN(n) ? 0 : n;
    }, z.number().int().min(0).max(10_000))
    .optional(),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    // Drop accents/marks while keeping the underlying letter.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "instruction";
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  // Up to 5 attempts with a short random suffix on collision. The first
  // attempt uses the bare slug — clean URLs in the common case.
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate =
      attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const existing = await prisma.instruction.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) return candidate;
  }
  // Last resort: timestamp suffix. Should never happen in practice.
  return `${base}-${Date.now().toString(36)}`;
}

export async function createInstruction(formData: FormData) {
  const session = await requireSuperAdmin();
  const parsed = upsertSchema.safeParse({
    title: formData.get("title"),
    bodyMd: formData.get("bodyMd"),
    position: formData.get("position"),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false as const, error: first?.message ?? "Invalid input" };
  }

  const slug = await uniqueSlug(slugify(parsed.data.title));
  const created = await prisma.instruction.create({
    data: {
      slug,
      title: parsed.data.title,
      bodyMd: parsed.data.bodyMd,
      position: parsed.data.position ?? 0,
      authorId: session.user.id,
    },
  });

  await writeAudit({
    userId: session.user.id,
    entity: "instruction",
    entityId: created.id,
    action: "create",
    diff: { after: { slug, title: parsed.data.title } },
  });

  revalidatePath("/admin/instructions");
  redirect(`/admin/instructions#${slug}`);
}

export async function updateInstruction(id: string, formData: FormData) {
  const session = await requireSuperAdmin();
  const existing = await prisma.instruction.findUnique({ where: { id } });
  if (!existing) return { ok: false as const, error: "Not found" };

  const parsed = upsertSchema.safeParse({
    title: formData.get("title"),
    bodyMd: formData.get("bodyMd"),
    position: formData.get("position"),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false as const, error: first?.message ?? "Invalid input" };
  }

  // Re-slug only if the title changed — keeps existing deep links intact.
  const newSlug =
    existing.title === parsed.data.title
      ? existing.slug
      : await uniqueSlug(slugify(parsed.data.title), id);

  await prisma.instruction.update({
    where: { id },
    data: {
      slug: newSlug,
      title: parsed.data.title,
      bodyMd: parsed.data.bodyMd,
      position: parsed.data.position ?? existing.position,
      authorId: session.user.id,
    },
  });

  await writeAudit({
    userId: session.user.id,
    entity: "instruction",
    entityId: id,
    action: "update",
    diff: {
      before: { title: existing.title, slug: existing.slug },
      after: { title: parsed.data.title, slug: newSlug },
    },
  });

  revalidatePath("/admin/instructions");
  redirect(`/admin/instructions#${newSlug}`);
}

export async function deleteInstruction(id: string) {
  const session = await requireSuperAdmin();
  const existing = await prisma.instruction.findUnique({ where: { id } });
  if (!existing) return;
  await prisma.instruction.delete({ where: { id } });
  await writeAudit({
    userId: session.user.id,
    entity: "instruction",
    entityId: id,
    action: "delete",
    diff: { before: { slug: existing.slug, title: existing.title } },
  });
  revalidatePath("/admin/instructions");
  redirect("/admin/instructions?deleted=1");
}
