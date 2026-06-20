import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { InvoiceForm, type InvoiceFormContext } from "../InvoiceForm";

export default async function NewInvoicePage() {
  const [companies, counterparties, paymentTerms] = await Promise.all([
    prisma.company.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
        bankAccounts: {
          orderBy: [{ isDefault: "desc" }, { currency: "asc" }],
        },
      },
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

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link
          href="/admin/invoices"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← Back to list
        </Link>
        <h1 className="text-2xl font-semibold mt-2">New invoice</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Will be created with status{" "}
          <code className="text-xs bg-zinc-100 px-1.5 rounded">draft</code>. The
          number is assigned when issued.
        </p>
      </div>

      <InvoiceForm mode={{ kind: "create" }} ctx={ctx} />
    </div>
  );
}
