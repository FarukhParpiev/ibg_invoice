import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { BulkInvoiceTable, type BulkInvoiceRow } from "../BulkInvoiceTable";

// Archived invoices live here — same table layout as /admin/invoices but the
// bulk action bar swaps "Delete drafts / Archive" for "Restore / Delete
// permanently". Drafts cannot reach this page (they're deleted directly).
export default async function ArchivedInvoicesPage(
  props: PageProps<"/admin/invoices/archive">,
) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const where = {
    archivedAt: { not: null },
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" as const } },
            {
              counterparty: {
                name: { contains: q, mode: "insensitive" as const },
              },
            },
            {
              ourCompany: {
                name: { contains: q, mode: "insensitive" as const },
              },
            },
            {
              items: {
                some: {
                  projectName: { contains: q, mode: "insensitive" as const },
                },
              },
            },
          ],
        }
      : {}),
  };

  const [invoices, totalArchived] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: [{ archivedAt: "desc" }],
      take: 200,
      include: {
        ourCompany: { select: { name: true } },
        counterparty: { select: { name: true } },
        receipts: { select: { id: true, number: true } },
        items: {
          orderBy: { positionNo: "asc" },
          take: 1,
          select: { projectName: true, unitCode: true },
        },
      },
    }),
    prisma.invoice.count({ where: { archivedAt: { not: null } } }),
  ]);

  const rows: BulkInvoiceRow[] = invoices.map((inv) => {
    const first = inv.items[0];
    const title = [first?.projectName, first?.unitCode]
      .map((s) => s?.trim())
      .filter((s): s is string => !!s)
      .join(" ");
    return {
      id: inv.id,
      number: inv.number,
      status: inv.status,
      type: inv.type,
      issueDate: inv.issueDate.toISOString().slice(0, 10),
      title,
      companyName: inv.ourCompany.name,
      counterpartyName: inv.counterparty.name,
      total: Number(inv.total).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      primaryCurrency: inv.primaryCurrency,
      hasReceipt: inv.receipts.length > 0,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/invoices"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← Back to invoices
        </Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <h1 className="text-2xl font-semibold">Archive</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {totalArchived} archived invoice{totalArchived === 1 ? "" : "s"}.
              Restore to bring back to the main list, or delete permanently
              (irreversible).
            </p>
          </div>
        </div>
      </div>

      <form className="flex gap-2" action="/admin/invoices/archive">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by number, company, counterparty or project…"
          className="border rounded px-3 py-2 text-sm w-96"
        />
        <button
          type="submit"
          className="border rounded px-4 py-2 text-sm hover:bg-zinc-50"
        >
          Search
        </button>
        {q && (
          <Link
            href="/admin/invoices/archive"
            className="text-sm text-zinc-500 hover:text-zinc-900 py-2"
          >
            Reset
          </Link>
        )}
      </form>

      <BulkInvoiceTable
        rows={rows}
        view="archive"
        emptyMessage={
          q
            ? "Nothing found in archive."
            : "Archive is empty. Use the «Archive» action on the invoices list to move issued/paid/cancelled invoices here."
        }
      />

      {invoices.length === 200 && (
        <p className="text-xs text-zinc-500">
          Showing first 200 archived invoices. Refine your search to see more.
        </p>
      )}
    </div>
  );
}
