import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { InvoiceStatus, InvoiceType } from "@prisma/client";
import { BulkInvoiceTable, type BulkInvoiceRow } from "./BulkInvoiceTable";

export default async function InvoicesListPage(
  props: PageProps<"/admin/invoices">,
) {
  const sp = await props.searchParams;
  const statusFilter =
    typeof sp.status === "string" &&
    ["draft", "issued", "paid", "cancelled"].includes(sp.status)
      ? (sp.status as InvoiceStatus)
      : null;
  const typeFilter: InvoiceType | null =
    sp.type === "receipt" ? "receipt" : sp.type === "invoice" ? "invoice" : null;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const where = {
    // Hide archived rows from the default list — they live in /admin/invoices/archive.
    archivedAt: null,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(typeFilter ? { type: typeFilter } : { type: "invoice" as const }),
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
            {
              items: {
                some: {
                  unitCode: { contains: q, mode: "insensitive" as const },
                },
              },
            },
          ],
        }
      : {}),
  };

  const [invoices, counts, archivedCount] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        ourCompany: { select: { name: true } },
        counterparty: { select: { name: true } },
        receipts: { select: { id: true, number: true } },
        // First line item gives us the "{project} {unit}" title shown in
        // the Title column and used as the PDF filename.
        items: {
          orderBy: { positionNo: "asc" },
          take: 1,
          select: { projectName: true, unitCode: true },
        },
      },
    }),
    prisma.invoice.groupBy({
      by: ["status"],
      where: { type: "invoice", archivedAt: null },
      _count: true,
    }),
    prisma.invoice.count({ where: { archivedAt: { not: null } } }),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));

  const flashDeleted = sp.deleted === "1";

  // Pre-shape rows for the client component — moves all formatting work to
  // the server, keeping the client bundle small and serialisation simple.
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="text-sm text-zinc-500 mt-1">
            All invoices + auto-generated receipts.
          </p>
        </div>
        <Link
          href="/admin/invoices/new"
          className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-zinc-800"
        >
          + New invoice
        </Link>
      </div>

      {flashDeleted && (
        <div className="text-sm rounded bg-zinc-100 px-3 py-2">
          Draft deleted.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <FilterChip
          href="/admin/invoices"
          active={statusFilter === null && typeFilter === null}
          label={`All · ${Object.values(countMap).reduce((s, n) => s + n, 0)}`}
        />
        {(["draft", "issued", "paid", "cancelled"] as InvoiceStatus[]).map(
          (s) => (
            <FilterChip
              key={s}
              href={`/admin/invoices?status=${s}`}
              active={statusFilter === s && typeFilter === null}
              label={`${labelOf(s)} · ${countMap[s] ?? 0}`}
            />
          ),
        )}
        <FilterChip
          href="/admin/invoices?type=receipt"
          active={typeFilter === "receipt"}
          label="Receipts"
        />
        <span className="flex-1" />
        <Link
          href="/admin/invoices/archive"
          className="text-sm text-zinc-600 hover:text-black border rounded-full px-3 py-1 hover:bg-zinc-50"
          title="Archived invoices are hidden from this list"
        >
          🗄 Archive · {archivedCount}
        </Link>
      </div>

      <form className="flex gap-2" action="/admin/invoices">
        {/* Preserve active status/type filter when submitting a new search so
            the user stays in the same view (e.g. searching within drafts). */}
        {statusFilter && (
          <input type="hidden" name="status" value={statusFilter} />
        )}
        {typeFilter && <input type="hidden" name="type" value={typeFilter} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by number, company, counterparty, project or unit…"
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
            href={
              statusFilter
                ? `/admin/invoices?status=${statusFilter}`
                : typeFilter
                  ? `/admin/invoices?type=${typeFilter}`
                  : "/admin/invoices"
            }
            className="text-sm text-zinc-500 hover:text-zinc-900 py-2"
          >
            Reset
          </Link>
        )}
      </form>

      <BulkInvoiceTable
        rows={rows}
        view="default"
        emptyMessage={q ? "Nothing found." : "No invoices."}
      />

      {invoices.length === 100 && (
        <p className="text-xs text-zinc-500">
          Showing first 100. Pagination to be added later.
        </p>
      )}
    </div>
  );
}

function labelOf(s: InvoiceStatus): string {
  switch (s) {
    case "draft":
      return "Draft";
    case "issued":
      return "Issued";
    case "paid":
      return "Paid";
    case "cancelled":
      return "Cancelled";
  }
}

function FilterChip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`px-3 py-1 rounded-full border transition ${
        active
          ? "bg-black text-white border-black"
          : "bg-white text-zinc-700 border-zinc-300 hover:border-zinc-500"
      }`}
    >
      {label}
    </Link>
  );
}
