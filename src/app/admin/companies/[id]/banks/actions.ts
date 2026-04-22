"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth-helpers";

const bankAccountSchema = z.object({
  bankName: z.string().min(1, "Обязательное поле").max(200),
  accountName: z.string().min(1, "Обязательное поле").max(200),
  accountNumber: z.string().min(1, "Обязательное поле").max(100),
  swift: z.string().max(50).optional().or(z.literal("")),
  branch: z.string().max(200).optional().or(z.literal("")),
  bankAddress: z.string().max(1000).optional().or(z.literal("")),
  currency: z.enum(["THB", "USD", "EUR", "RUB"]),
  isDefault: z.boolean(),
});

export type BankAccountFormValues = z.infer<typeof bankAccountSchema>;

type Result = { ok: true; id: string } | { ok: false; error: string };

export async function createBankAccount(
  companyId: string,
  rawValues: unknown,
): Promise<Result> {
  await requireSuperAdmin();
  const parsed = bankAccountSchema.safeParse(rawValues);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ошибка валидации" };
  }
  const v = parsed.data;

  const created = await prisma.$transaction(async (tx) => {
    // Если новый счёт = default, снимаем флаг со всех остальных той же валюты в этой компании
    if (v.isDefault) {
      await tx.bankAccount.updateMany({
        where: { companyId, currency: v.currency, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.bankAccount.create({
      data: {
        companyId,
        bankName: v.bankName,
        accountName: v.accountName,
        accountNumber: v.accountNumber,
        swift: v.swift || null,
        branch: v.branch || null,
        bankAddress: v.bankAddress || null,
        currency: v.currency,
        isDefault: v.isDefault,
      },
    });
  });

  revalidatePath(`/admin/companies/${companyId}`);
  return { ok: true, id: created.id };
}

export async function updateBankAccount(
  companyId: string,
  bankId: string,
  rawValues: unknown,
): Promise<Result> {
  await requireSuperAdmin();
  const parsed = bankAccountSchema.safeParse(rawValues);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ошибка валидации" };
  }
  const v = parsed.data;

  await prisma.$transaction(async (tx) => {
    if (v.isDefault) {
      await tx.bankAccount.updateMany({
        where: {
          companyId,
          currency: v.currency,
          isDefault: true,
          NOT: { id: bankId },
        },
        data: { isDefault: false },
      });
    }
    await tx.bankAccount.update({
      where: { id: bankId },
      data: {
        bankName: v.bankName,
        accountName: v.accountName,
        accountNumber: v.accountNumber,
        swift: v.swift || null,
        branch: v.branch || null,
        bankAddress: v.bankAddress || null,
        currency: v.currency,
        isDefault: v.isDefault,
      },
    });
  });

  revalidatePath(`/admin/companies/${companyId}`);
  revalidatePath(`/admin/companies/${companyId}/banks/${bankId}`);
  return { ok: true, id: bankId };
}

export async function deleteBankAccount(companyId: string, bankId: string) {
  await requireSuperAdmin();

  const used = await prisma.invoice.count({ where: { ourBankAccountId: bankId } });
  if (used > 0) {
    revalidatePath(`/admin/companies/${companyId}`);
    redirect(`/admin/companies/${companyId}?bankInUse=1`);
  }

  await prisma.bankAccount.delete({ where: { id: bankId } });
  revalidatePath(`/admin/companies/${companyId}`);
  redirect(`/admin/companies/${companyId}?bankDeleted=1`);
}
