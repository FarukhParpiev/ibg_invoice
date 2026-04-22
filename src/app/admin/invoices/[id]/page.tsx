import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { InvoiceActions } from "./InvoiceActions";
import { PdfActions } from "./PdfActions";
import { DuplicateButton } from "./DuplicateButton";
import type { InvoiceStatus } from "@prisma/client";

const statusLabels: Record<InvoiceStatus, { text: string; cls: string }> = {
  draft: { text: "Draft", cls: "bg-zinc-100 text-zinc-700" },
  issued: { text: "Issued", cls: "bg-blue-50 text-blue-700" },
  paid: { text: "Paid", cls: "bg-green-50 text-green-700" },
  cancelled: { text: "Cancelled", cls: "bg-red-50 text-red-700" },
};

const templateLabels: Record<string, string> = {
  ibg_thb: "IBG THB",
  ib_group_thb: "IB Group THB",
  ib_group_usd: "IB Group USD",
  wise_thb: "Wise THB",
  crypto: "Crypto",
  ibg_kas: "IBG Kas",
  others_thai: "Others Thai",
};

function fmt(n: number | import("@prisma/client").Prisma.Decimal | null | undefined) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default async function InvoiceDetailPage(
  props: PageProps<"/admin/invoices/[id]">,
) {
  const { id } = await props.params;
  const sp = await props.searchParams;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      items: { orderBy: { positionNo: "asc" } },
      ourCompany: true,
      ourBankAccount: true,
      counterparty: true,
      paymentTerms: true,
      parentInvoice: true,
      receipts: true,
      createdBy: { select: { email: true, name: true } },
      issuedBy: { select: { email: true, name: true } },
      paidByUser: { select: { email: true, name: true } },
      cancelledByUser: { select: { email: true, name: true } },
    },
  });

  if (!invoice) notFound();

  const flashError = sp.error === "notDraft";

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link
          href="/admin/invoices"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← Back to list
        </Link>
        <div className="flex items-baseline gap-3 mt-2 flex-wrap">
          <h1 className="text-2xl font-semibold">
            {invoice.number ?? (
              <span className="text-zinc-400">
                Draft #{invoice.id.slice(0, 8)}
              </span>
            )}
          </h1>
          <span
            className={`text-xs px-2 py-1 rounded ${statusLabels[invoice.status].cls}`}
          >
            {statusLabels[invoice.status].text}
          </span>
          {invoice.type === "receipt" && (
            <span className="text-xs px-2 py-1 rounded bg-amber-50 text-amber-800">
              receipt
            </span>
          )}
          <span className="text-xs px-2 py-1 rounded bg-zinc-100 text-zinc-700">
            {templateLabels[invoice.template]}
          </span>
        </div>
      </div>

      {flashError && (
        <div className="text-sm rounded bg-red-50 text-red-700 px-3 py-2">
          Editing is only available for draft status.
        </div>
      )}

      {invoice.parentInvoice && (
        <div className="text-sm rounded bg-zinc-50 px-3 py-2">
          Receipt for invoice{" "}
          <Link
            href={`/admin/invoices/${invoice.parentInvoice.id}`}
            className="underline font-mono"
          >
            {invoice.parentInvoice.number}
          </Link>
        </div>
      )}

      {invoice.receipts.length > 0 && (
        <div className="text-sm rounded bg-green-50 px-3 py-2">
          Receipt:{" "}
          {invoice.receipts.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ", "}
              <Link
                href={`/admin/invoices/${r.id}`}
                className="underline font-mono"
              >
                {r.number}
              </Link>
            </span>
          ))}
        </div>
      )}

      <InvoiceActions
        id={invoice.id}
        status={invoice.status}
        type={invoice.type}
      />

      <div className="border rounded-lg p-4 bg-white space-y-3">
        <div className="text-xs uppercase tracking-wide text-zinc-500">PDF</div>
        <PdfActions invoiceId={invoice.id} pdfUrl={invoice.pdfUrl} />
        {invoice.type === "invoice" && (
          <div className="pt-2 border-t">
            <DuplicateButton invoiceId={invoice.id} />
          </div>
        )}
      </div>

      <section className="grid grid-cols-2 gap-4">
        <Card title="Our company">
          <div className="font-medium">{invoice.ourCompany.name}</div>
          {invoice.ourCompany.address && (
            <div className="text-zinc-600 whitespace-pre-line">
              {invoice.ourCompany.address}
            </div>
          )}
          {invoice.ourCompany.taxId && (
            <div className="text-zinc-600">Tax ID: {invoice.ourCompany.taxId}</div>
          )}
        </Card>

        <Card title="Counterparty">
          <div className="font-medium">{invoice.counterparty.name}</div>
          {invoice.counterparty.address && (
            <div className="text-zinc-600 whitespace-pre-line">
              {invoice.counterparty.address}
            </div>
          )}
          {invoice.counterparty.taxId && (
            <div className="text-zinc-600">
              Tax ID: {invoice.counterparty.taxId}
            </div>
          )}
        </Card>

        <Card title="Bank account">
          <div className="font-medium">{invoice.ourBankAccount.bankName}</div>
          <div className="text-zinc-600">
            {invoice.ourBankAccount.accountName} —{" "}
            {invoice.ourBankAccount.accountNumber}
          </div>
          <div className="text-zinc-600">
            {invoice.ourBankAccount.currency}
            {invoice.ourBankAccount.swift &&
              ` · SWIFT ${invoice.ourBankAccount.swift}`}
          </div>
        </Card>

        <Card title="Dates & terms">
          <Row label="Issue date" value={invoice.issueDate.toISOString().slice(0, 10)} />
          {invoice.dueDate && (
            <Row label="Due date" value={invoice.dueDate.toISOString().slice(0, 10)} />
          )}
          {invoice.otherDate && (
            <Row
              label="Other date"
              value={invoice.otherDate.toISOString().slice(0, 10)}
            />
          )}
          {invoice.paymentTerms && (
            <Row label="Payment terms" value={invoice.paymentTerms.label} />
          )}
          {invoice.paidAt && (
            <Row
              label="Paid at"
              value={invoice.paidAt.toISOString().slice(0, 10)}
            />
          )}
          {invoice.cancelledAt && (
            <>
              <Row
                label="Cancelled at"
                value={invoice.cancelledAt.toISOString().slice(0, 10)}
              />
              {invoice.cancelledReason && (
                <Row label="Reason" value={invoice.cancelledReason} />
              )}
            </>
          )}
        </Card>
      </section>

      <section className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium">#</th>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-left px-4 py-3 font-medium">Project/Unit</th>
              <th className="text-left px-4 py-3 font-medium">Details</th>
              <th className="text-right px-4 py-3 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((it) => (
              <tr key={it.id} className="border-t">
                <td className="px-4 py-3 text-zinc-500">{it.positionNo}</td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      it.itemType === "commission"
                        ? "bg-blue-50 text-blue-700"
                        : it.itemType === "bonus"
                          ? "bg-purple-50 text-purple-700"
                          : "bg-orange-50 text-orange-700"
                    }`}
                  >
                    {it.itemType}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  {it.projectName ?? "—"}
                  {it.unitCode && (
                    <span className="text-zinc-500"> · {it.unitCode}</span>
                  )}
                  {it.note && (
                    <div className="text-xs text-zinc-500 mt-0.5">{it.note}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-zinc-600 tabular-nums">
                  {it.itemType === "commission" ? (
                    <>
                      SP: {fmt(it.sellingPrice)}
                      {Number(it.sellingPriceCorrection) !== 0 &&
                        ` (${fmt(it.sellingPriceCorrection)})`}{" "}
                      · {fmt(it.commissionPercent)}%
                      {Number(it.commissionCorrection) !== 0 &&
                        ` (+${fmt(it.commissionCorrection)})`}
                    </>
                  ) : it.itemType === "bonus" ? (
                    <>Bonus: {fmt(it.bonusAmount)}</>
                  ) : (
                    <>Other: {fmt(it.otherAmount)}</>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">
                  {fmt(it.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="border rounded-lg p-5 bg-zinc-50 max-w-md ml-auto text-sm tabular-nums">
        <Row label="Subtotal" value={`${fmt(invoice.subtotal)} ${invoice.primaryCurrency}`} />
        {invoice.vatApplied && (
          <Row
            label={invoice.vatIncluded ? "VAT 7% (included in amount)" : "VAT 7%"}
            value={`${fmt(invoice.vatAmount)} ${invoice.primaryCurrency}`}
          />
        )}
        {invoice.whtApplied && (
          <Row
            label="WHT 3%"
            value={`− ${fmt(invoice.whtAmount)} ${invoice.primaryCurrency}`}
          />
        )}
        <div className="border-t pt-2 mt-2 font-semibold text-base">
          <Row
            label="Total"
            value={`${fmt(invoice.total)} ${invoice.primaryCurrency}`}
          />
        </div>
        {invoice.showUsdEquivalent && invoice.totalUsd && (
          <div className="mt-2 pt-2 border-t text-zinc-600">
            <Row label="Total USD" value={`${fmt(invoice.totalUsd)} USD`} />
            {invoice.exchangeRate && (
              <div className="text-xs text-zinc-400 text-right mt-1">
                rate {fmt(invoice.exchangeRate)} ·{" "}
                {invoice.exchangeRateSource ?? "—"}
              </div>
            )}
          </div>
        )}
      </section>

      {invoice.notesText && (
        <section className="border rounded-lg p-5 bg-white">
          <h2 className="font-medium mb-2">Notes</h2>
          <p className="text-sm text-zinc-700 whitespace-pre-line">
            {invoice.notesText}
          </p>
        </section>
      )}

      <section className="text-xs text-zinc-500 border-t pt-4 space-y-1">
        <div>
          Created: {invoice.createdAt.toISOString().slice(0, 16).replace("T", " ")}{" "}
          · {invoice.createdBy.email}
        </div>
        {invoice.issuedBy && (
          <div>Issued by: {invoice.issuedBy.email}</div>
        )}
        {invoice.paidByUser && <div>Marked paid by: {invoice.paidByUser.email}</div>}
        {invoice.cancelledByUser && (
          <div>Cancelled by: {invoice.cancelledByUser.email}</div>
        )}
      </section>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
        {title}
      </div>
      <div className="text-sm space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
