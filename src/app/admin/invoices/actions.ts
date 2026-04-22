"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import {
  calcTotals,
  calcItemAmount,
  calcItemAmountUsd,
  toDecimal,
  toDecimalOrNull,
  type ItemInput,
} from "@/lib/invoice-calc";
import {
  allocateNextSerial,
  buildInvoiceNumber,
  buildReceiptNumber,
} from "@/lib/invoice-number";
import { writeAudit } from "@/lib/audit";
import { regenerateInvoicePdf } from "@/lib/pdf/pipeline";

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

// Из input type=number + valueAsNumber пустое поле приходит как NaN,
// из обычного TSV/формы — как "". Приводим то и другое к 0, чтобы
// Zod не падал с "expected number, received NaN".
const numericField = (min?: number, max?: number) =>
  z.preprocess(
    (v) => {
      if (v === "" || v == null) return 0;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isNaN(n) ? 0 : n;
    },
    max !== undefined
      ? z.number().min(min ?? Number.NEGATIVE_INFINITY).max(max)
      : min !== undefined
        ? z.number().min(min)
        : z.number(),
  );

const itemSchema = z.discriminatedUnion("itemType", [
  z.object({
    itemType: z.literal("commission"),
    projectName: z.string().max(200).optional().or(z.literal("")),
    unitCode: z.string().max(100).optional().or(z.literal("")),
    sellingPrice: numericField(0),
    sellingPriceCorrection: numericField(),
    commissionPercent: numericField(0, 100),
    commissionCorrection: numericField(),
    note: z.string().max(2000).optional().or(z.literal("")),
  }),
  z.object({
    itemType: z.literal("bonus"),
    projectName: z.string().max(200).optional().or(z.literal("")),
    unitCode: z.string().max(100).optional().or(z.literal("")),
    bonusAmount: numericField(),
    note: z.string().max(2000).optional().or(z.literal("")),
  }),
]);

// Курс: пустое поле / NaN / undefined → null (необязательный).
const exchangeRateField = z.preprocess(
  (v) => {
    if (v === "" || v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isNaN(n) ? null : n;
  },
  z.number().positive().nullable(),
).optional();

const invoiceSchema = z.object({
  template: z.enum(templates),
  ourCompanyId: z.string().min(1, "Выберите компанию"),
  ourBankAccountId: z.string().min(1, "Выберите счёт"),
  counterpartyId: z.string().min(1, "Выберите контрагента"),
  paymentTermsId: z.string().optional().or(z.literal("")),

  primaryCurrency: z.enum(currencies),
  showUsdEquivalent: z.boolean(),
  exchangeRate: exchangeRateField,

  issueDate: z.string().min(1, "Дата обязательна"),
  dueDate: z.string().optional().or(z.literal("")),
  otherDate: z.string().optional().or(z.literal("")),

  vatApplied: z.boolean(),
  vatIncluded: z.boolean().optional().default(false),
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

function isUsdConversionTemplate(tpl: InvoiceFormValues["template"]): boolean {
  return tpl === "ib_group_usd";
}

// Собирает payload для nested create позиций. Для шаблона ib_group_usd
// amount считается в USD (делится на rate); исходные THB-поля сохраняются
// в том же виде, в каком ввёл пользователь — их всегда можно пересчитать.
function buildItemsCreate(
  items: InvoiceItemFormValues[],
  opts: { convertThbToUsd: boolean; rate: number },
) {
  return items.map((it, idx) => {
    const input: ItemInput =
      it.itemType === "commission"
        ? {
            itemType: "commission",
            sellingPrice: it.sellingPrice,
            sellingPriceCorrection: it.sellingPriceCorrection,
            commissionPercent: it.commissionPercent,
            commissionCorrection: it.commissionCorrection,
          }
        : { itemType: "bonus", bonusAmount: it.bonusAmount };
    const amount = opts.convertThbToUsd
      ? calcItemAmountUsd(input, opts.rate)
      : calcItemAmount(input);
    return {
      positionNo: idx + 1,
      itemType: it.itemType,
      projectName: it.projectName || null,
      unitCode: it.unitCode || null,
      sellingPrice:
        it.itemType === "commission" ? toDecimalOrNull(it.sellingPrice) : null,
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
      amount: toDecimal(amount),
      note: it.note || null,
    };
  });
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

  const convertThbToUsd = isUsdConversionTemplate(v.template);
  const rate = v.exchangeRate ? Number(v.exchangeRate) : 0;

  if (convertThbToUsd && rate <= 0) {
    return {
      ok: false,
      error: "Для шаблона IB Group USD укажите курс THB → USD",
    };
  }

  // Для ib_group_usd primary всегда USD, курс обязательный.
  const primaryCurrency = convertThbToUsd ? "USD" : v.primaryCurrency;
  const showUsdEquivalent = convertThbToUsd ? false : v.showUsdEquivalent;

  const totals = calcTotals({
    items: itemsToTotalsInput(v.items),
    vatApplied: v.vatApplied,
    vatIncluded: v.vatIncluded,
    whtApplied: v.whtApplied,
    exchangeRate: v.exchangeRate ?? null,
    showUsdEquivalent,
    convertThbToUsd,
  });

  const created = await prisma.invoice.create({
    data: {
      type: "invoice",
      status: "draft",
      template: v.template,

      primaryCurrency,
      showUsdEquivalent,
      exchangeRate: toDecimalOrNull(v.exchangeRate ?? null),
      exchangeRateSource: v.exchangeRate ? "manual" : null,
      exchangeRateAt: v.exchangeRate ? new Date() : null,

      issueDate,
      dueDate: parseDateOrNull(v.dueDate),
      otherDate: parseDateOrNull(v.otherDate),

      vatApplied: v.vatApplied,
      vatIncluded: v.vatIncluded,
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
        create: buildItemsCreate(v.items, { convertThbToUsd, rate }),
      },
    },
  });

  await writeAudit({
    userId: session.user.id,
    entity: "invoice",
    entityId: created.id,
    action: "create",
    diff: { after: { template: v.template, total: totals.total } },
  });

  revalidatePath("/admin/invoices");
  return { ok: true, id: created.id };
}

export async function updateDraftInvoice(
  id: string,
  rawValues: unknown,
): Promise<Result> {
  const session = await requireSuperAdmin();
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

  const convertThbToUsd = isUsdConversionTemplate(v.template);
  const rate = v.exchangeRate ? Number(v.exchangeRate) : 0;

  if (convertThbToUsd && rate <= 0) {
    return {
      ok: false,
      error: "Для шаблона IB Group USD укажите курс THB → USD",
    };
  }

  const primaryCurrency = convertThbToUsd ? "USD" : v.primaryCurrency;
  const showUsdEquivalent = convertThbToUsd ? false : v.showUsdEquivalent;

  const totals = calcTotals({
    items: itemsToTotalsInput(v.items),
    vatApplied: v.vatApplied,
    vatIncluded: v.vatIncluded,
    whtApplied: v.whtApplied,
    exchangeRate: v.exchangeRate ?? null,
    showUsdEquivalent,
    convertThbToUsd,
  });

  await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    await tx.invoice.update({
      where: { id },
      data: {
        template: v.template,
        primaryCurrency,
        showUsdEquivalent,
        exchangeRate: toDecimalOrNull(v.exchangeRate ?? null),
        exchangeRateSource: v.exchangeRate ? "manual" : null,
        exchangeRateAt: v.exchangeRate ? new Date() : null,

        issueDate,
        dueDate: parseDateOrNull(v.dueDate),
        otherDate: parseDateOrNull(v.otherDate),

        vatApplied: v.vatApplied,
        vatIncluded: v.vatIncluded,
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
          create: buildItemsCreate(v.items, { convertThbToUsd, rate }),
        },
      },
    });
  });

  await writeAudit({
    userId: session.user.id,
    entity: "invoice",
    entityId: id,
    action: "update",
    diff: { after: { template: v.template, total: totals.total } },
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

      await writeAudit({
        userId: session.user.id,
        entity: "invoice",
        entityId: result.id,
        action: "issue",
        diff: { after: { number: result.number, serialNumber: result.serialNumber } },
      });

      // Автоматически генерируем PDF после issue. Ошибки логируем,
      // но сам статус уже изменён — пользователь сможет нажать «Перегенерировать».
      try {
        await regenerateInvoicePdf(result.id, session.user.id);
      } catch (err) {
        console.error("[issueInvoice] PDF regenerate failed", err);
      }

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
            vatIncluded: inv.vatIncluded,
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

      await writeAudit({
        userId: session.user.id,
        entity: "invoice",
        entityId: id,
        action: "pay",
        diff: { after: { paidAt: paidAt.toISOString(), receiptId } },
      });

      // Регенерим оба PDF — родительский (теперь paid) и свежий receipt.
      try {
        await regenerateInvoicePdf(id, session.user.id);
      } catch (err) {
        console.error("[payInvoice] parent PDF regen failed", err);
      }
      try {
        await regenerateInvoicePdf(receiptId, session.user.id);
      } catch (err) {
        console.error("[payInvoice] receipt PDF generate failed", err);
      }

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

  await writeAudit({
    userId: session.user.id,
    entity: "invoice",
    entityId: id,
    action: "cancel",
    diff: { after: { reason: reason.trim() || null } },
  });

  // Перерисуем PDF с красным баннером CANCELLED, если у инвойса уже был PDF.
  if (inv.pdfUrl) {
    try {
      await regenerateInvoicePdf(id, session.user.id);
    } catch (err) {
      console.error("[cancelInvoice] PDF regen failed", err);
    }
  }

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${id}`);
  return { ok: true, id };
}

export async function deleteDraftInvoice(id: string) {
  const session = await requireSuperAdmin();
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) return;
  if (inv.status !== "draft") {
    redirect(`/admin/invoices/${id}?error=notDraft`);
  }
  await prisma.invoice.delete({ where: { id } });
  await writeAudit({
    userId: session.user.id,
    entity: "invoice",
    entityId: id,
    action: "delete",
  });
  revalidatePath("/admin/invoices");
  redirect("/admin/invoices?deleted=1");
}

// ────────────────────────────── Duplicate ──────────────────────────────

export async function duplicateInvoice(id: string): Promise<Result> {
  const session = await requireSuperAdmin();
  const src = await prisma.invoice.findUnique({
    where: { id },
    include: { items: { orderBy: { positionNo: "asc" } } },
  });
  if (!src) return { ok: false, error: "Инвойс не найден" };
  if (src.type === "receipt") {
    return { ok: false, error: "Receipt нельзя дублировать" };
  }

  const created = await prisma.invoice.create({
    data: {
      type: "invoice",
      status: "draft",
      template: src.template,

      primaryCurrency: src.primaryCurrency,
      showUsdEquivalent: src.showUsdEquivalent,
      // Курс в копии НЕ копируем — draft не фиксирует курс
      exchangeRate: null,
      exchangeRateSource: null,
      exchangeRateAt: null,

      issueDate: new Date(),
      dueDate: null,
      otherDate: null,

      vatApplied: src.vatApplied,
      vatIncluded: src.vatIncluded,
      whtApplied: src.whtApplied,

      subtotal: src.subtotal,
      vatAmount: src.vatAmount,
      whtAmount: src.whtAmount,
      total: src.total,
      subtotalUsd: null,
      totalUsd: null,

      notesText: src.notesText,

      ourCompanyId: src.ourCompanyId,
      ourBankAccountId: src.ourBankAccountId,
      counterpartyId: src.counterpartyId,
      paymentTermsId: src.paymentTermsId,

      createdById: session.user.id,

      items: {
        create: src.items.map((it) => ({
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

  await writeAudit({
    userId: session.user.id,
    entity: "invoice",
    entityId: created.id,
    action: "create",
    diff: { after: { duplicatedFrom: id } },
  });

  revalidatePath("/admin/invoices");
  return { ok: true, id: created.id };
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
