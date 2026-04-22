"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth-helpers";

const companySchema = z.object({
  name: z.string().min(1, "Обязательное поле").max(200),
  legalType: z.enum(["resident", "offshore"]),
  address: z.string().max(1000).optional().or(z.literal("")),
  taxId: z.string().max(100).optional().or(z.literal("")),
  registrationNo: z.string().max(100).optional().or(z.literal("")),
  phone: z.string().max(100).optional().or(z.literal("")),
  email: z.string().email("Некорректный e-mail").or(z.literal("")),
  logoUrl: z.string().url("Нужен URL").or(z.literal("")),
  defaultCurrency: z.enum(["THB", "USD", "EUR", "RUB"]),
  isActive: z.boolean(),
});

export type CompanyFormValues = z.infer<typeof companySchema>;

export type UpdateCompanyResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateCompany(
  id: string,
  rawValues: unknown,
): Promise<UpdateCompanyResult> {
  await requireSuperAdmin();

  const parsed = companySchema.safeParse(rawValues);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Некорректные данные" };
  }

  const v = parsed.data;

  await prisma.company.update({
    where: { id },
    data: {
      name: v.name,
      legalType: v.legalType,
      address: v.address || null,
      taxId: v.taxId || null,
      registrationNo: v.registrationNo || null,
      phone: v.phone || null,
      email: v.email || null,
      logoUrl: v.logoUrl || null,
      defaultCurrency: v.defaultCurrency,
      isActive: v.isActive,
    },
  });

  revalidatePath("/admin/companies");
  revalidatePath(`/admin/companies/${id}`);
  return { ok: true };
}
