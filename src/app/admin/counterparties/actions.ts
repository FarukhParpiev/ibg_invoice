"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminAccess } from "@/lib/auth-helpers";

const counterpartySchema = z.object({
  name: z.string().min(1, "Required").max(200),
  address: z.string().max(1000).optional().or(z.literal("")),
  taxId: z.string().max(100).optional().or(z.literal("")),
  phone: z.string().max(100).optional().or(z.literal("")),
  email: z.string().email("Invalid e-mail").or(z.literal("")),
  preferredLanguage: z.enum(["en", "th"]),
  notes: z.string().max(5000).optional().or(z.literal("")),
  isActive: z.boolean(),
});

export type CounterpartyFormValues = z.infer<typeof counterpartySchema>;

type Result = { ok: true; id: string } | { ok: false; error: string };

// Quick-add from the invoice form. We return name too so the combobox can
// show the selection label without a roundtrip.
type QuickAddResult =
  | { ok: true; id: string; name: string }
  | { ok: false; error: string };

// Quick-add captures the three fields that actually show up on the PDF —
// name, tax ID, address. Everything else (phone/email/notes) can be filled
// in later on the edit page.
const quickAddSchema = z.object({
  name: z.string().min(1, "Name required").max(200),
  taxId: z.string().max(100).optional().or(z.literal("")),
  address: z.string().max(1000).optional().or(z.literal("")),
  preferredLanguage: z.enum(["en", "th"]).default("en"),
});

// Full quick-add: adds a regular counterparty (shows up in /admin/counterparties
// next time). Use when the user forgot to create the counterparty up front but
// this is a real, reusable one.
export async function createCounterpartyQuick(
  rawValues: unknown,
): Promise<QuickAddResult> {
  await requireAdminAccess();
  const parsed = quickAddSchema.safeParse(rawValues);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation error" };
  }
  const created = await prisma.counterparty.create({
    data: {
      name: parsed.data.name,
      taxId: parsed.data.taxId || null,
      address: parsed.data.address || null,
      preferredLanguage: parsed.data.preferredLanguage,
      isActive: true,
      isAdHoc: false,
    },
    select: { id: true, name: true },
  });
  revalidatePath("/admin/counterparties");
  return { ok: true, id: created.id, name: created.name };
}

// Ad-hoc: one-off counterparties (e.g. "Miss Larisa — deposit") that should
// NOT clutter the main directory. Excluded from /admin/counterparties; still
// reachable via the usual counterpartyId FK.
export async function createCounterpartyAdHoc(
  rawValues: unknown,
): Promise<QuickAddResult> {
  await requireAdminAccess();
  const parsed = quickAddSchema.safeParse(rawValues);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation error" };
  }
  const created = await prisma.counterparty.create({
    data: {
      name: parsed.data.name,
      taxId: parsed.data.taxId || null,
      address: parsed.data.address || null,
      preferredLanguage: parsed.data.preferredLanguage,
      isActive: true,
      isAdHoc: true,
    },
    select: { id: true, name: true },
  });
  // No revalidation of /admin/counterparties — ad-hoc entries don't appear there.
  return { ok: true, id: created.id, name: created.name };
}

export async function createCounterparty(rawValues: unknown): Promise<Result> {
  await requireAdminAccess();
  const parsed = counterpartySchema.safeParse(rawValues);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation error" };
  }
  const v = parsed.data;
  const created = await prisma.counterparty.create({
    data: {
      name: v.name,
      address: v.address || null,
      taxId: v.taxId || null,
      phone: v.phone || null,
      email: v.email || null,
      preferredLanguage: v.preferredLanguage,
      notes: v.notes || null,
      isActive: v.isActive,
    },
  });
  revalidatePath("/admin/counterparties");
  return { ok: true, id: created.id };
}

export async function updateCounterparty(
  id: string,
  rawValues: unknown,
): Promise<Result> {
  await requireAdminAccess();
  const parsed = counterpartySchema.safeParse(rawValues);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation error" };
  }
  const v = parsed.data;
  await prisma.counterparty.update({
    where: { id },
    data: {
      name: v.name,
      address: v.address || null,
      taxId: v.taxId || null,
      phone: v.phone || null,
      email: v.email || null,
      preferredLanguage: v.preferredLanguage,
      notes: v.notes || null,
      isActive: v.isActive,
    },
  });
  revalidatePath("/admin/counterparties");
  revalidatePath(`/admin/counterparties/${id}`);
  return { ok: true, id };
}

export async function deleteCounterparty(id: string) {
  await requireAdminAccess();
  const hasInvoices = await prisma.invoice.count({ where: { counterpartyId: id } });
  if (hasInvoices > 0) {
    // Soft delete — set isActive=false if there are linked invoices
    await prisma.counterparty.update({
      where: { id },
      data: { isActive: false },
    });
    revalidatePath("/admin/counterparties");
    redirect("/admin/counterparties?archived=1");
  }
  await prisma.counterparty.delete({ where: { id } });
  revalidatePath("/admin/counterparties");
  redirect("/admin/counterparties?deleted=1");
}
