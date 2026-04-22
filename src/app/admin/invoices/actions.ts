"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import {
  calcTotals,
  calcItemAmount,
  toDecimal,
  toDecimalOrNull,
  type ItemInput,
} from "@/lib/invoice-calc";
import {
  allocateNextSerial,
  buildInvoiceNumber,
  buildReceiptNumber,
} from "@/lib/invoice-number";

// ────────────────────────────── Schemas ──────────────────────────────

const templates = [
  "ibg_thb",
  "ib_group_thb",
  "ib_group_usd",
  "wise_thb",
  "crypto",
  "ibg_kas",
  "others_thai",
] as const;

const currencies = ["THB", "USD", "EUR", "RUB"] as const;

const itemSchema = z.discriminatedUnion("itemType", [
  z.object({
    itemType: z.literal("commission"),
    projectName: z.string().max(200).optional().or(z.literal("")),
    unitCode: z.string().max(100).optional().or(z.literal("")),
    sellingPrice: z.coerce.number().min(0),
    sellingPriceCorrection: z.coerce.number(),
    commissionPercent: z.coerce.number().min(0).max(100),
    commissionCorrection: z.coerce.number(),
    note: z.string().max(2000).optional().or(z.literal("")),
  }),
  z.object({
    itemType: z.literal("bonus"),
    projectName: z.string().max(200).optional().or(z.literal("")),
    unitCode: z.string().max(100).optional().or(z.literal("")),
    bonusAmount: z.coerce.number(),
    note: z.string().max(2000).optional().or(z.literal("")),
  }),
]);

const invoiceSchema = z.object({
  template: z.enum(templates),
  ourCompanyId: z.string().min(1, "Выберите компанию"),
  ourBankAccountId: z.string().min(1, "Выберите счёт"),
  counterpartyId: z.string().min(1, "Выберите контрагента"),
  paymentTermsId: z.string().optional().or(z.literal("")),

  primaryCurrency: z.enum(currencies),
  showUsdEquivalent: z.boolean(),
  exchangeRate: z.coerce.number().optional().nullable(),

  issueDate: z.string().min(1, "Дата обязательна"),
  dueDate: z.string().optional().or(z.literal("")),
  otherDate: z.string().optional().or(z.literal("")),

  vatApplied: z.boolean(),
  whtApplied: z.boolean(),

  notesText: z.string().max(10000).optional().or(z.literal("")),

  items: z.array(itemSchema).min(1, "Добавьте хотя бы одну позицию"),
});

export type InvoiceFormValues = z.infer<typeof invoiceSchema>;
export type InvoiceItemFormValues = z.infer<typeof itemSchema>;

type Result = { ok: true; id: string } | { ok: false; error: string };

// ────────────────────────────── Helpers ──────────────────────────────

function parseDateOrNull(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function itemsToTotalsInput(items: InvoiceItemFormValues[]): ItemInput[] {
  return items.map((it) =>
    it.itemType === "commission"
      ? {
          itemType: "commission" as const,
          sellingPrice: it.sellingPrice,
          sellingPriceCorrection: it.sellingPriceCorrection,
          commissionPercent: it.commissionPercent,
          commissionCorrection: it.commissionCorrection,
        }
      : { itemType: "bonus" as const, bonusAmount: it.bonusAmount },
  );
}

// ────────────────────────────── Create/Edit ──────────────────────────────

export async function createDraftInvoice(rawValues: unknown): Promise<Result> {
  const session = await requireSuperAdmin();
  const parsed = invoiceSchema.safeParse(rawValues);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Ошибка валидации",
    };
  }
  const v = parsed.data;

  // Проверка, что выбранный счёт принадлежит выбранной компании
  const bank = await prisma.bankAccount.findUnique({
    where: { id: v.ourBankAccountId },
  });
  if (!bank || bank.companyId !== v.ourCompanyId) {
    return { ok: false, error: "Банковский счёт не принадлежит выбранной компании" };
  }

  const issueDate = parseDateOrNull(v.issueDate);
  if (!issueDate) return { ok: false, error: "Некорректная дата выпуска" };

  const totals = calcTotals({
    items: itemsToTotalsInput(v.items),
    vatApplied: v.vatApplied,
    whtApplied: v.whtApplied,
    exchangeRate: v.exchangeRate ?? null,
    showUsdEquivalent: v.showUsdEquivalent,
  });

  const created = await prisma.invoice.create({
    data: {
      type: "invoice",
      status: "draft",
      template: v.template,

      primaryCurrency: v.primaryCurrency,
      showUsdEquivalent: v.showUsdEquivalent,
      exchangeRate: toDecimalOrNull(v.exchangeRate ?? null),
      exchangeRateSource: v.exchangeRate ? "manual" : null,
      exchangeRateAt: v.exchangeRate ? new Date() : null,

      issueDate,
      dueDate: parseDateOrNull(v.dueDate),
      otherDate: parseDateOrNull(v.otherDate),

      vatApplied: v.vatApplied,
      whtApplied: v.whtApplied,

      subtotal: toDecimal(totals.subtotal),
      vatAmount: toDecimal(totals.vatAmount),
      whtAmount: toDecimal(totals.whtAmount),
      total: toDecimal(totals.total),
      subtotalUsd: toDecimalOrNull(totals.subtotalUsd),
      totalUsd: toDecimalOrNull(totals.totalUsd),

      notesText: v.notesText || null,

      ourCompanyId: v.ourCompanyId,
      ourBankAccountId: v.ourBankAccountId,
      counterpartyId: v.counterpartyId,
      paymentTermsId: v.paymentTermsId || null,

      createdById: session.user.id,

      items: {
        create: v.items.map((it, idx) => ({
          positionNo: idx + 1,
          itemType: it.itemType,
          projectName: it.projectName || null,
          unitCode: it.unitCode || null,
          sellingPrice:
            it.itemType === "commission"
              ? toDecimalOrNull(it.sellingPrice)
              : null,
          sellingPriceCorrection:
            it.itemType === "commission"
              ? toDecimalOrNull(it.sellingPriceCorrection)
              : null,
          commissionPercent:
            it.itemType === "commission"
              ? toDecimalOrNull(it.commissionPercent)
              : null,
          commissionCorrection:
            it.itemType === "commission"
              ? toDecimalOrNull(it.commissionCorrection)
              : null,
          bonusAmount:
            it.itemType === "bonus" ? toDecimalOrNull(it.bonusAmount) : null,
          amount: toDecimal(
            calcItemAmount(
              it.itemType === "commission"
                ? {
                    itemType: "commission",
                    sellingPrice: it.sellingPrice,
                    sellingPriceCorrection: it.sellingPriceCorrection,
                    commissionPercent: it.commissionPercent,
                    commissionCorrection: it.commissionCorrection,
                  }
                : { itemType: "bonus", bonusAmount: it.bonusAmount },
            ),
          ),
          note: it.note || null,
        })),
      },
    },
  });

  revalidatePath("/admin/invoices");
  return { ok: true, id: created.id };
}

export async function updateDraftInvoice(
  id: string,
  rawValues: unknown,
): Promise<Result> {
  await requireSuperAdmin();
  const parsed = invoiceSchema.safeParse(rawValues);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Ошибка валидации",
    };
  }
  const v = parsed.data;

  const existing = await prisma.invoice.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Инвойс не найден" };
  if (existing.status !== "draft") {
    return { ok: false, error: "Редактировать можно только инвойсы в статусе draft" };
  }

  const bank = await prisma.bankAccount.findUnique({
    where: { id: v.ourBankAccountId },
  });
  if (!bank || bank.companyId !== v.ourCompanyId) {
    return { ok: false, error: "Банковский счёт не принадлежит выбранной компании" };
  }

  const issueDate = parseDateOrNull(v.issueDate);
  if (!issueDate) return { ok: false, error: "Некорректная дата выпуска" };

  const totals = calcTotals({
    items: itemsToTotalsInput(v.items),
    vatApplied: v.vatApplied,
    whtApplied: v.whtApplied,
    exchangeRate: v.exchangeRate ?? null,
    showUsdEquivalent: v.showUsdEquivalent,
  });

  await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    await tx.invoice.update({
      where: { id },
      data: {
        template: v.template,
        primaryCurrency: v.primaryCurrency,
        showUsdEquivalent: v.showUsdEquivalent,
        exchangeRate: toDecimalOrNull(v.exchangeRate ?? null),
        exchangeRateSource: v.exchangeRate ? "manual" : null,
        exchangeRateAt: v.exchangeRate ? new Date() : null,

        issueDate,
        dueDate: parseDateOrNull(v.dueDate),
        otherDate: parseDateOrNull(v.otherDate),

        vatApplied: v.vatApplied,
        whtApplied: v.whtApplied,

        subtotal: toDecimal(totals.subtotal),
        vatAmount: toDecimal(totals.vatAmount),
        whtAmount: toDecimal(totals.whtAmount),
        total: toDecimal(totals.total),
        subtotalUsd: toDecimalOrNull(totals.subtotalUsd),
        totalUsd: toDecimalOrNull(totals.totalUsd),

        notesText: v.notesText || null,

        ourCompanyId: v.ourCompanyId,
        ourBankAccountId: v.ourBankAccountId,
        counterpartyId: v.counterpartyId,
        paymentTermsId: v.paymentTermsId || null,

        items: {
          create: v.items.map((it, idx) => ({
            positionNo: idx + 1,
            itemType: it.itemType,
            projectName: it.projectName || null,
            unitCode: it.unitCode || null,
            sellingPrice:
              it.itemType === "commission"
                ? toDecimalOrNull(it.sellingPrice)
                : null,
            sellingPriceCorrection:
              it.itemType === "commission"
                ? toDecimalOrNull(it.sellingPriceCorrection)
                : null,
            commissionPercent:
              it.itemType === "commission"
                ? toDecimalOrNull(it.commissionPercent)
                : null,
            commissionCorrection:
              it.itemType === "commission"
                ? toDecimalOrNull(it.commissionCorrection)
                : null,
            bonusAmount:
              it.itemType === "bonus" ? toDecimalOrNull(it.bonusAmount) : null,
            amount: toDecimal(
              calcItemAmount(
                it.itemType === "commission"
                  ? {
                      itemType: "commission",
                      sellingPrice: it.sellingPrice,
                      sellingPriceCorrection: it.sellingPriceCorrection,
                      commissionPercent: it.commissionPercent,
                      commissionCorrection: it.commissionCorrection,
                    }
                  : { itemType: "bonus", bonusAmount: it.bonusAmount },
              ),
            ),
            note: it.note || null,
          })),
        },
      },
    });
  });

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${id}`);
  return { ok: true, id };
}

// ────────────────────────────── Transitions ──────────────────────────────

export async function issueInvoice(id: string): Promise<Result> {
  const session = await requireSuperAdmin();

  // До 3 попыток на случай гонки по unique(serialNumber)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const inv = await tx.invoice.findUnique({ where: { id } });
        if (!inv) throw new Error("Инвойс не найден");
        if (inv.status !== "draft") {
          throw new Error("Только draft можно выпустить");
        }
        if (inv.type !== "invoice") {
          throw new Error("Receipt нельзя выпустить напрямую");
        }

        const serial = await allocateNextSerial(tx);
        const number = buildInvoiceNumber(inv.issueDate, serial);

        return tx.invoice.update({
          where: { id },
          data: {
            status: "issued",
            number,
            serialNumber: serial,
            issuedById: session.user.id,
          },
        });
      });

      revalidatePath("/admin/invoices");
      revalidatePath(`/admin/invoices/${id}`);
      return { ok: true, id: result.id };
    } catch (err) {
      if (isUniqueViolation(err) && attempt < 2) continue;
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Ошибка выпуска",
      };
    }
  }
  return { ok: false, error: "Не удалось выпустить инвойс (гонка номеров)" };
}

export async function payInvoice(
  id: string,
  paidAtIso: string,
): Promise<Result> {
  const session = await requireSuperAdmin();

  const paidAt = parseDateOrNull(paidAtIso);
  if (!paidAt) return { ok: false, error: "Некорректная дата оплаты" };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const receiptId = await prisma.$transaction(async (tx) => {
        const inv = await tx.invoice.findUnique({
          where: { id },
          include: { items: true },
        });
        if (!inv) throw new Error("Инвойс не найден");
        if (inv.status !== "issued") {
          throw new Error("Оплатить можно только issued-инвойс");
        }
        if (inv.type !== "invoice") {
          throw new Error("Нельзя оплатить receipt");
        }
        if (!inv.number) {
          throw new Error("У инвойса нет номера — сначала выпустите");
        }

        await tx.invoice.update({
          where: { id },
          data: {
            status: "paid",
            paidAt,
            paidBy: session.user.id,
          },
        });

        // Создаём receipt — копия исходного инвойса со статусом paid и номером <parent>-R
        const receiptNumber = buildReceiptNumber(inv.number);
        const receipt = await tx.invoice.create({
          data: {
            type: "receipt",
            status: "paid",
            number: receiptNumber,
            parentInvoiceId: inv.id,

            template: inv.template,

            primaryCurrency: inv.primaryCurrency,
            showUsdEquivalent: inv.showUsdEquivalent,
            exchangeRate: inv.exchangeRate,
            exchangeRateSource: inv.exchangeRateSource,
            exchangeRateAt: inv.exchangeRateAt,

            issueDate: paidAt,
            dueDate: null,
            otherDate: inv.otherDate,

            paidAt,
            paidBy: session.user.id,

            vatApplied: inv.vatApplied,
            whtApplied: inv.whtApplied,

            subtotal: inv.subtotal,
            vatAmount: inv.vatAmount,
            whtAmount: inv.whtAmount,
            total: inv.total,
            subtotalUsd: inv.subtotalUsd,
            totalUsd: inv.totalUsd,

            notesText: inv.notesText,

            ourCompanyId: inv.ourCompanyId,
            ourBankAccountId: inv.ourBankAccountId,
            counterpartyId: inv.counterpartyId,
            paymentTermsId: inv.paymentTermsId,

            createdById: session.user.id,
            issuedById: session.user.id,

            items: {
              create: inv.items.map((it) => ({
                positionNo: it.positionNo,
                itemType: it.itemType,
                projectName: it.projectName,
                unitCode: it.unitCode,
                sellingPrice: it.sellingPrice,
                sellingPriceCorrection: it.sellingPriceCorrection,
                commissionPercent: it.commissionPercent,
                commissionCorrection: it.commissionCorrection,
                bonusAmount: it.bonusAmount,
                amount: it.amount,
                note: it.note,
              })),
            },
          },
        });

        return receipt.id;
      });

      revalidatePath("/admin/invoices");
      revalidatePath(`/admin/invoices/${id}`);
      revalidatePath(`/admin/invoices/${receiptId}`);
      return { ok: true, id: receiptId };
    } catch (err) {
      if (isUniqueViolation(err) && attempt < 2) continue;
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Ошибка оплаты",
      };
    }
  }
  return { ok: false, error: "Не удалось оплатить инвойс" };
}

export async function cancelInvoice(
  id: string,
  reason: string,
): Promise<Result> {
  const session = await requireSuperAdmin();
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) return { ok: false, error: "Инвойс не найден" };
  if (inv.status === "cancelled") {
    return { ok: false, error: "Уже отменён" };
  }
  if (inv.status === "paid") {
    return { ok: false, error: "Оплаченный инвойс нельзя отменить" };
  }

  await prisma.invoice.update({
    where: { id },
    data: {
      status: "cancelled",
      cancelledAt: new Date(),
      cancelledBy: session.user.id,
      cancelledReason: reason.trim() || null,
    },
  });

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${id}`);
  return { ok: true, id };
}

export async function deleteDraftInvoice(id: string) {
  await requireSuperAdmin();
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) return;
  if (inv.status !== "draft") {
    redirect(`/admin/invoices/${id}?error=notDraft`);
  }
  await prisma.invoice.delete({ where: { id } });
  revalidatePath("/admin/invoices");
  redirect("/admin/invoices?deleted=1");
}

// ────────────────────────────── utils ──────────────────────────────

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}
