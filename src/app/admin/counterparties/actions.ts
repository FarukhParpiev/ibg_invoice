"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth-helpers";

const counterpartySchema = z.object({
  name: z.string().min(1, "Required").max(200),
  address: z.string().max(1000).optional().or(z.literal("")),
  taxId: z.string().max(100).optional().or(z.literal("")),
  phone: z.string().max(100).optional().or(z.literal("")),
  email: z.string().email("Invalid e-mail").or(z.literal("")),
  preferredLanguage: z.enum(["en", "th", "ru"]),
  notes: z.string().max(5000).optional().or(z.literal("")),
  isActive: z.boolean(),
});

export type CounterpartyFormValues = z.infer<typeof counterpartySchema>;

type Result = { ok: true; id: string } | { ok: false; error: string };

export async function createCounterparty(rawValues: unknown): Promise<Result> {
  await requireSuperAdmin();
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
  await requireSuperAdmin();
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
  await requireSuperAdmin();
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
