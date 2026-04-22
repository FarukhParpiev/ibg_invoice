import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { InvoiceStatus, InvoiceType } from "@prisma/client";

const statusLabels: Record<InvoiceStatus, { text: string; cls: string }> = {
  draft: { text: "Draft", cls: "bg-zinc-100 text-zinc-700" },
  issued: { text: "Issued", cls: "bg-blue-50 text-blue-700" },
  paid: { text: "Paid", cls: "bg-green-50 text-green-700" },
  cancelled: { text: "Cancelled", cls: "bg-red-50 text-red-700" },
};

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

  const where = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(typeFilter ? { type: typeFilter } : { type: "invoice" as const }),
  };

  const [invoices, counts] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        ourCompany: { select: { name: true } },
        counterparty: { select: { name: true } },
        receipts: { select: { id: true, number: true } },
      },
    }),
    prisma.invoice.groupBy({
      by: ["status"],
      where: { type: "invoice" },
      _count: true,
    }),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));

  const flashDeleted = sp.deleted === "1";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Инвойсы</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Все инвойсы + автосозданные receipt'ы.
          </p>
        </div>
        <Link
          href="/admin/invoices/new"
          className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-zinc-800"
        >
          + Новый инвойс
        </Link>
      </div>

      {flashDeleted && (
        <div className="text-sm rounded bg-zinc-100 px-3 py-2">
          Draft удалён.
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-sm">
        <FilterChip
          href="/admin/invoices"
          active={statusFilter === null && typeFilter === null}
          label={`Все · ${Object.values(countMap).reduce((s, n) => s + n, 0)}`}
        />
        {(["draft", "issued", "paid", "cancelled"] as InvoiceStatus[]).map(
          (s) => (
            <FilterChip
              key={s}
              href={`/admin/invoices?status=${s}`}
              active={statusFilter === s && typeFilter === null}
              label={`${statusLabels[s].text} · ${countMap[s] ?? 0}`}
            />
          ),
        )}
        <FilterChip
          href="/admin/invoices?type=receipt"
          active={typeFilter === "receipt"}
          label="Receipts"
        />
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium">№</th>
              <th className="text-left px-4 py-3 font-medium">Дата</th>
              <th className="text-left px-4 py-3 font-medium">Компания</th>
              <th className="text-left px-4 py-3 font-medium">Контрагент</th>
              <th className="text-right px-4 py-3 font-medium">Сумма</th>
              <th className="text-left px-4 py-3 font-medium">Статус</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                  Нет инвойсов.
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id} className="border-t hover:bg-zinc-50/50">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link
                      href={`/admin/invoices/${inv.id}`}
                      className="hover:underline"
                    >
                      {inv.number ?? (
                        <span className="text-zinc-400">
                          draft/{inv.id.slice(0, 8)}
                        </span>
                      )}
                    </Link>
                    {inv.type === "receipt" && (
                      <span className="ml-2 text-[10px] bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded">
                        receipt
                      </span>
                    )}
                    {inv.receipts.length > 0 && (
                      <span className="ml-2 text-[10px] bg-green-50 text-green-800 px-1.5 py-0.5 rounded">
                        +R
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {inv.issueDate.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {inv.ourCompany.name}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {inv.counterparty.name}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(inv.total).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    <span className="text-zinc-400 text-xs">
                      {inv.primaryCurrency}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${statusLabels[inv.status].cls}`}
                    >
                      {statusLabels[inv.status].text}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {invoices.length === 100 && (
        <p className="text-xs text-zinc-500">
          Показаны первые 100. Добавим пагинацию позже.
        </p>
      )}
    </div>
  );
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
