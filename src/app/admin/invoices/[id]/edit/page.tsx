import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { InvoiceForm, type InvoiceFormContext } from "../../InvoiceForm";
import type { InvoiceFormValues } from "../../actions";

export default async function EditInvoicePage(
  props: PageProps<"/admin/invoices/[id]/edit">,
) {
  const { id } = await props.params;

  const [invoice, companies, counterparties, paymentTerms] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id },
      include: { items: { orderBy: { positionNo: "asc" } } },
    }),
    prisma.company.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: { bankAccounts: { orderBy: [{ isDefault: "desc" }, { currency: "asc" }] } },
    }),
    prisma.counterparty.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, isActive: true },
    }),
    prisma.paymentTerms.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, label: true },
    }),
  ]);

  if (!invoice) notFound();
  if (invoice.status !== "draft") {
    redirect(`/admin/invoices/${id}?error=notDraft`);
  }

  const ctx: InvoiceFormContext = {
    companies: companies.map((c) => ({
      id: c.id,
      name: c.name,
      defaultCurrency: c.defaultCurrency,
      bankAccounts: c.bankAccounts.map((b) => ({
        id: b.id,
        bankName: b.bankName,
        currency: b.currency,
        accountNumber: b.accountNumber,
        isDefault: b.isDefault,
      })),
    })),
    counterparties,
    paymentTerms,
  };

  const defaults: InvoiceFormValues = {
    template: invoice.template,
    ourCompanyId: invoice.ourCompanyId,
    ourBankAccountId: invoice.ourBankAccountId,
    counterpartyId: invoice.counterpartyId,
    paymentTermsId: invoice.paymentTermsId ?? "",
    primaryCurrency: invoice.primaryCurrency,
    showUsdEquivalent: invoice.showUsdEquivalent,
    exchangeRate: invoice.exchangeRate ? Number(invoice.exchangeRate) : null,
    issueDate: invoice.issueDate.toISOString().slice(0, 10),
    dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : "",
    otherDate: invoice.otherDate
      ? invoice.otherDate.toISOString().slice(0, 10)
      : "",
    vatApplied: invoice.vatApplied,
    vatIncluded: invoice.vatIncluded,
    whtApplied: invoice.whtApplied,
    notesText: invoice.notesText ?? "",
    items: invoice.items.map((it) => {
      if (it.itemType === "commission") {
        return {
          itemType: "commission" as const,
          projectName: it.projectName ?? "",
          unitCode: it.unitCode ?? "",
          sellingPrice: Number(it.sellingPrice ?? 0),
          sellingPriceCorrection: Number(it.sellingPriceCorrection ?? 0),
          commissionPercent: Number(it.commissionPercent ?? 0),
          commissionCorrection: Number(it.commissionCorrection ?? 0),
          note: it.note ?? "",
        };
      }
      if (it.itemType === "bonus") {
        return {
          itemType: "bonus" as const,
          projectName: it.projectName ?? "",
          unitCode: it.unitCode ?? "",
          bonusAmount: Number(it.bonusAmount ?? 0),
          note: it.note ?? "",
        };
      }
      return {
        itemType: "other" as const,
        projectName: it.projectName ?? "",
        unitCode: it.unitCode ?? "",
        otherAmount: Number(it.otherAmount ?? 0),
        note: it.note ?? "",
      };
    }),
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link
          href={`/admin/invoices/${id}`}
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← Back to invoice
        </Link>
        <h1 className="text-2xl font-semibold mt-2">Edit draft</h1>
      </div>

      <InvoiceForm
        mode={{ kind: "edit", id: invoice.id }}
        defaults={defaults}
        ctx={ctx}
      />
    </div>
  );
}
