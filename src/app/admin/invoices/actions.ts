"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminAccess } from "@/lib/auth-helpers";
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

// "others_thai" is deprecated — dropped from the UI in favour of the "blank"
// manual template. The Prisma enum still accepts it so old records load, but
// new invoices can't select it.
const templates = [
  "ibg_thb",
  "ib_group_thb",
  "ib_group_usd",
  "wise_thb",
  "crypto",
  "ibg_kas",
  "blank",
] as const;

const currencies = ["THB", "USD", "EUR", "RUB"] as const;

// An <input type="number"> + valueAsNumber returns NaN for an empty field;
// a regular TSV/form sends "". Coerce both to 0 so that Zod does not fail
// with "expected number, received NaN".
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
  z.object({
    itemType: z.literal("other"),
    // For "other": projectName = "Name" (what the payment is for), note = "Comment".
    projectName: z.string().max(200).optional().or(z.literal("")),
    unitCode: z.string().max(100).optional().or(z.literal("")),
    otherAmount: numericField(),
    note: z.string().max(2000).optional().or(z.literal("")),
  }),
]);

// Exchange rate: empty / NaN / undefined → null (optional).
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
  ourCompanyId: z.string().min(1, "Select a company"),
  ourBankAccountId: z.string().min(1, "Select a bank account"),
  counterpartyId: z.string().min(1, "Select a counterparty"),
  paymentTermsId: z.string().optional().or(z.literal("")),

  primaryCurrency: z.enum(currencies),
  showUsdEquivalent: z.boolean(),
  exchangeRate: exchangeRateField,

  issueDate: z.string().min(1, "Issue date is required"),
  dueDate: z.string().optional().or(z.literal("")),
  otherDate: z.string().optional().or(z.literal("")),

  vatApplied: z.boolean(),
  vatIncluded: z.boolean().optional().default(false),
  whtApplied: z.boolean(),

  notesText: z.string().max(10000).optional().or(z.literal("")),

  // Optional manual override for the full invoice number when issuing.
  // Accepts any string — e.g. "23/04/2026-0001" or an external-system format
  // when migrating legacy invoices. Leave blank to use the default
  // DD/MM/YYYY-NNNN generator.
  numberOverride: z
    .preprocess(
      (v) => {
        if (v === "" || v == null) return null;
        return typeof v === "string" ? v.trim() || null : String(v).trim() || null;
      },
      z.string().max(100).nullable(),
    )
    .optional(),

  items: z.array(itemSchema).min(1, "Add at least one line item"),
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
  return items.map((it) => {
    if (it.itemType === "commission") {
      return {
        itemType: "commission" as const,
        sellingPrice: it.sellingPrice,
        sellingPriceCorrection: it.sellingPriceCorrection,
        commissionPercent: it.commissionPercent,
        commissionCorrection: it.commissionCorrection,
      };
    }
    if (it.itemType === "bonus") {
      return { itemType: "bonus" as const, bonusAmount: it.bonusAmount };
    }
    return { itemType: "other" as const, otherAmount: it.otherAmount };
  });
}

function isUsdConversionTemplate(tpl: InvoiceFormValues["template"]): boolean {
  return tpl === "ib_group_usd";
}

// Builds the nested create payload for line items. For the ib_group_usd
// template, amount is computed in USD (divided by rate); the source THB
// fields are stored as the user entered them — they can always be
// recomputed.
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
        : it.itemType === "bonus"
          ? { itemType: "bonus", bonusAmount: it.bonusAmount }
          : { itemType: "other", otherAmount: it.otherAmount };
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
      otherAmount:
        it.itemType === "other" ? toDecimalOrNull(it.otherAmount) : null,
      amount: toDecimal(amount),
      note: it.note || null,
    };
  });
}

// ────────────────────────────── Create/Edit ──────────────────────────────

export async function createDraftInvoice(rawValues: unknown): Promise<Result> {
  const session = await requireAdminAccess();
  const parsed = invoiceSchema.safeParse(rawValues);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Validation error",
    };
  }
  const v = parsed.data;

  // Check that the selected bank account belongs to the selected company
  const bank = await prisma.bankAccount.findUnique({
    where: { id: v.ourBankAccountId },
  });
  if (!bank || bank.companyId !== v.ourCompanyId) {
    return { ok: false, error: "Bank account does not belong to the selected company" };
  }

  const issueDate = parseDateOrNull(v.issueDate);
  if (!issueDate) return { ok: false, error: "Invalid issue date" };

  const convertThbToUsd = isUsdConversionTemplate(v.template);
  const rate = v.exchangeRate ? Number(v.exchangeRate) : 0;

  if (convertThbToUsd && rate <= 0) {
    return {
      ok: false,
      error: "For the IB Group USD template, specify the THB → USD rate",
    };
  }

  // For ib_group_usd primary is always USD, rate is mandatory.
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
      numberOverride: v.numberOverride ?? null,

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
  const session = await requireAdminAccess();
  const parsed = invoiceSchema.safeParse(rawValues);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Validation error",
    };
  }
  const v = parsed.data;

  const existing = await prisma.invoice.findUnique({
    where: { id },
    include: { receipts: { select: { id: true } } },
  });
  if (!existing) return { ok: false, error: "Invoice not found" };
  // Receipts are derived from a paid invoice — they can never be edited
  // directly, only re-generated when the parent changes.
  if (existing.type === "receipt") {
    return { ok: false, error: "A receipt cannot be edited directly" };
  }
  // Drafts edit freely. Issued/paid/cancelled invoices are also editable now,
  // but the changes are post-publication: PDF is regenerated, audit is
  // appended, and (if the invoice was paid) the linked receipt is also
  // regenerated to reflect the new totals.
  const isDraft = existing.status === "draft";

  const bank = await prisma.bankAccount.findUnique({
    where: { id: v.ourBankAccountId },
  });
  if (!bank || bank.companyId !== v.ourCompanyId) {
    return { ok: false, error: "Bank account does not belong to the selected company" };
  }

  const issueDate = parseDateOrNull(v.issueDate);
  if (!issueDate) return { ok: false, error: "Invalid issue date" };

  const convertThbToUsd = isUsdConversionTemplate(v.template);
  const rate = v.exchangeRate ? Number(v.exchangeRate) : 0;

  if (convertThbToUsd && rate <= 0) {
    return {
      ok: false,
      error: "For the IB Group USD template, specify the THB → USD rate",
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

  // Number handling differs by status:
  //  · drafts: the field on the form is "numberOverride" — a *future* number
  //    that issueInvoice() will pick up. The real `number` is still null.
  //  · non-drafts: the invoice already has a `number`. The same form field is
  //    re-purposed to display/edit that real number directly. We treat an
  //    empty string as "leave alone" to avoid accidentally wiping it.
  const trimmedOverride = v.numberOverride?.trim() ?? "";
  const numberFieldUpdate = isDraft
    ? { numberOverride: trimmedOverride || null }
    : trimmedOverride && trimmedOverride !== existing.number
      ? { number: trimmedOverride }
      : {};

  await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    await tx.invoice.update({
      where: { id },
      data: {
        template: v.template,
        ...numberFieldUpdate,
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
    diff: {
      after: {
        template: v.template,
        total: totals.total,
        editedAfterIssue: !isDraft,
      },
    },
  });

  // Post-publication edits regenerate the rendered PDFs so the file the
  // user shares always reflects current data. Best-effort: failures are
  // logged but don't block the save.
  if (!isDraft && existing.pdfUrl) {
    try {
      await regenerateInvoicePdf(id, session.user.id);
    } catch (err) {
      console.error("[updateDraftInvoice] PDF regen failed", err);
    }
    // A paid invoice has at least one receipt — re-render those too so the
    // amounts on the receipt PDF stay in sync with the parent.
    if (existing.status === "paid" && existing.receipts.length > 0) {
      for (const r of existing.receipts) {
        try {
          await regenerateInvoicePdf(r.id, session.user.id);
        } catch (err) {
          console.error("[updateDraftInvoice] receipt PDF regen failed", err);
        }
        revalidatePath(`/admin/invoices/${r.id}`);
      }
    }
  }

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${id}`);
  return { ok: true, id };
}

// ────────────────────────────── Transitions ──────────────────────────────

export async function issueInvoice(id: string): Promise<Result> {
  const session = await requireAdminAccess();

  // Up to 3 attempts in case of a race on unique(serialNumber)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const inv = await tx.invoice.findUnique({ where: { id } });
        if (!inv) throw new Error("Invoice not found");
        if (inv.status !== "draft") {
          throw new Error("Only a draft can be issued");
        }
        if (inv.type !== "invoice") {
          throw new Error("A receipt cannot be issued directly");
        }

        // Always allocate a fresh serial for sequencing; the unique index on
        // serialNumber protects against races (the outer retry kicks in if
        // we collide with a concurrent issuance).
        const serial = await allocateNextSerial(tx);
        // If the user pinned a custom full number on the draft (e.g. to
        // match a legacy external format), use it verbatim. Otherwise fall
        // back to the default DD/MM/YYYY-NNNN generator. The override is
        // cleared after issuance so any subsequent regen/re-issue doesn't
        // pick it up again.
        const number =
          inv.numberOverride && inv.numberOverride.trim().length > 0
            ? inv.numberOverride.trim()
            : buildInvoiceNumber(inv.issueDate, serial);

        return tx.invoice.update({
          where: { id },
          data: {
            status: "issued",
            number,
            serialNumber: serial,
            numberOverride: null,
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

      // Automatically generate the PDF after issue. Log errors, but the
      // status has already changed — the user can hit "Regenerate".
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
        error: err instanceof Error ? err.message : "Issue failed",
      };
    }
  }
  return { ok: false, error: "Could not issue the invoice (serial number race)" };
}

export async function payInvoice(
  id: string,
  paidAtIso: string,
): Promise<Result> {
  const session = await requireAdminAccess();

  const paidAt = parseDateOrNull(paidAtIso);
  if (!paidAt) return { ok: false, error: "Invalid payment date" };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const receiptId = await prisma.$transaction(async (tx) => {
        const inv = await tx.invoice.findUnique({
          where: { id },
          include: { items: true },
        });
        if (!inv) throw new Error("Invoice not found");
        if (inv.status !== "issued") {
          throw new Error("Only an issued invoice can be paid");
        }
        if (inv.type !== "invoice") {
          throw new Error("A receipt cannot be paid");
        }
        if (!inv.number) {
          throw new Error("Invoice has no number — issue it first");
        }

        await tx.invoice.update({
          where: { id },
          data: {
            status: "paid",
            paidAt,
            paidBy: session.user.id,
          },
        });

        // Create a receipt — a copy of the source invoice with status paid and number <parent>-R
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
                otherAmount: it.otherAmount,
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

      // Regenerate both PDFs — the parent (now paid) and the fresh receipt.
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
        error: err instanceof Error ? err.message : "Payment failed",
      };
    }
  }
  return { ok: false, error: "Could not mark invoice as paid" };
}

export async function cancelInvoice(
  id: string,
  reason: string,
): Promise<Result> {
  const session = await requireAdminAccess();
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) return { ok: false, error: "Invoice not found" };
  if (inv.status === "cancelled") {
    return { ok: false, error: "Already cancelled" };
  }
  if (inv.status === "paid") {
    return { ok: false, error: "A paid invoice cannot be cancelled" };
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

  // Redraw the PDF with the red CANCELLED banner if the invoice already had a PDF.
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
  const session = await requireAdminAccess();
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

// ─────────────────────── Bulk archive / delete ───────────────────────

// Bulk-результат: показывается в UI как «Archived 4, skipped 1» и т.п.
type BulkResult = {
  ok: boolean;
  affected: number;
  skipped: number;
  errors?: string[];
};

// Удалить набор драфтов одним вызовом. Не-драфты молча пропускаются — UI
// уже фильтрует список так, что пользователь должен видеть только драфты,
// но защита остаётся на случай гонок (издали в другой вкладке).
export async function bulkDeleteDrafts(ids: string[]): Promise<BulkResult> {
  const session = await requireAdminAccess();
  if (ids.length === 0) return { ok: true, affected: 0, skipped: 0 };

  const targets = await prisma.invoice.findMany({
    where: { id: { in: ids }, status: "draft", type: "invoice" },
    select: { id: true },
  });
  const allowed = new Set(targets.map((t) => t.id));

  let affected = 0;
  for (const id of ids) {
    if (!allowed.has(id)) continue;
    try {
      await prisma.invoice.delete({ where: { id } });
      await writeAudit({
        userId: session.user.id,
        entity: "invoice",
        entityId: id,
        action: "delete",
        diff: { after: { bulk: true } },
      });
      affected++;
    } catch (err) {
      // Skip rows that vanished mid-batch; report counts at the end.
      console.error("[bulkDeleteDrafts]", id, err);
    }
  }

  revalidatePath("/admin/invoices");
  return { ok: true, affected, skipped: ids.length - affected };
}

// Положить выпущенные/оплаченные/отменённые инвойсы в архив. Драфты
// архивации не подлежат — их следует удалять напрямую через bulkDeleteDrafts.
export async function bulkArchiveInvoices(ids: string[]): Promise<BulkResult> {
  const session = await requireAdminAccess();
  if (ids.length === 0) return { ok: true, affected: 0, skipped: 0 };

  // Берём только не-драфты и не-уже-архивированные.
  const targets = await prisma.invoice.findMany({
    where: {
      id: { in: ids },
      status: { in: ["issued", "paid", "cancelled"] },
      archivedAt: null,
    },
    select: { id: true },
  });
  if (targets.length === 0) {
    return { ok: true, affected: 0, skipped: ids.length };
  }

  const now = new Date();
  const result = await prisma.invoice.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { archivedAt: now, archivedById: session.user.id },
  });

  // Один общий audit-лог на батч — иначе при больших пачках лог вспухнет.
  await writeAudit({
    userId: session.user.id,
    entity: "invoice",
    entityId: null,
    action: "update",
    diff: { after: { archived: targets.map((t) => t.id) } },
  });

  revalidatePath("/admin/invoices");
  revalidatePath("/admin/invoices/archive");
  return {
    ok: true,
    affected: result.count,
    skipped: ids.length - result.count,
  };
}

// Восстановить из архива (снимает archivedAt). Поведение идемпотентное:
// уже не архивные пропускаются.
export async function bulkRestoreInvoices(ids: string[]): Promise<BulkResult> {
  const session = await requireAdminAccess();
  if (ids.length === 0) return { ok: true, affected: 0, skipped: 0 };

  const result = await prisma.invoice.updateMany({
    where: { id: { in: ids }, archivedAt: { not: null } },
    data: { archivedAt: null, archivedById: null },
  });

  await writeAudit({
    userId: session.user.id,
    entity: "invoice",
    entityId: null,
    action: "update",
    diff: { after: { restored: ids.slice(0, result.count) } },
  });

  revalidatePath("/admin/invoices");
  revalidatePath("/admin/invoices/archive");
  return {
    ok: true,
    affected: result.count,
    skipped: ids.length - result.count,
  };
}

// Окончательное удаление архивных инвойсов. Вызывается ТОЛЬКО из архива,
// клиент должен показать `confirm()` перед вызовом. Удаляет позиции и сам
// инвойс. Если у инвойса есть связанные receipt'ы — пропускаем (нужно
// отдельно удалить их сначала).
export async function bulkPermanentlyDeleteInvoices(
  ids: string[],
): Promise<BulkResult> {
  const session = await requireAdminAccess();
  if (ids.length === 0) return { ok: true, affected: 0, skipped: 0 };

  // Берём только архивные. Драфты сюда попасть не должны (у них archivedAt
  // всегда null), но фильтр всё равно оставляем — устраняет случай, когда
  // драфт пытаются удалить через "permanent" путь.
  const targets = await prisma.invoice.findMany({
    where: { id: { in: ids }, archivedAt: { not: null } },
    select: {
      id: true,
      number: true,
      receipts: { select: { id: true } },
      parentInvoiceId: true,
    },
  });

  let affected = 0;
  const errors: string[] = [];
  for (const t of targets) {
    if (t.receipts.length > 0) {
      errors.push(
        `${t.number ?? t.id}: has ${t.receipts.length} linked receipt(s) — delete those first`,
      );
      continue;
    }
    try {
      await prisma.$transaction([
        prisma.invoiceItem.deleteMany({ where: { invoiceId: t.id } }),
        prisma.invoice.delete({ where: { id: t.id } }),
      ]);
      await writeAudit({
        userId: session.user.id,
        entity: "invoice",
        entityId: t.id,
        action: "delete",
        diff: { after: { permanent: true, number: t.number } },
      });
      affected++;
    } catch (err) {
      errors.push(`${t.number ?? t.id}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  revalidatePath("/admin/invoices");
  revalidatePath("/admin/invoices/archive");
  return {
    ok: true,
    affected,
    skipped: ids.length - affected,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// ────────────────────────────── Duplicate ──────────────────────────────

export async function duplicateInvoice(id: string): Promise<Result> {
  const session = await requireAdminAccess();
  const src = await prisma.invoice.findUnique({
    where: { id },
    include: { items: { orderBy: { positionNo: "asc" } } },
  });
  if (!src) return { ok: false, error: "Invoice not found" };
  if (src.type === "receipt") {
    return { ok: false, error: "A receipt cannot be duplicated" };
  }

  const created = await prisma.invoice.create({
    data: {
      type: "invoice",
      status: "draft",
      template: src.template,

      primaryCurrency: src.primaryCurrency,
      showUsdEquivalent: src.showUsdEquivalent,
      // Do NOT copy the rate into the duplicate — draft does not lock a rate
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
          otherAmount: it.otherAmount,
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
