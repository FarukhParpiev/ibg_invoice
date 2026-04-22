import Link from "next/link";
import { prisma } from "@/lib/prisma";

// Список receipts — отдельный раздел для удобного поиска «чеков» без
// перемешивания с инвойсами. Receipt создаётся автоматически при оплате
// (см. payInvoice в src/app/admin/invoices/actions.ts), статус всегда paid.

export default async function ReceiptsListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const receipts = await prisma.invoice.findMany({
    where: {
      type: "receipt",
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: "insensitive" } },
              { counterparty: { name: { contains: q, mode: "insensitive" } } },
              { ourCompany: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: [{ paidAt: "desc" }, { issueDate: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      ourCompany: { select: { name: true } },
      counterparty: { select: { name: true } },
      parentInvoice: { select: { id: true, number: true } },
    },
  });

  const totalCount = await prisma.invoice.count({ where: { type: "receipt" } });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Receipts</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Автосозданные квитанции об оплате. Всего: {totalCount}.
          </p>
        </div>
      </div>

      <form className="flex gap-2" action="/admin/receipts">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Поиск по номеру, компании или контрагенту…"
          className="border rounded px-3 py-2 text-sm w-96"
        />
        <button
          type="submit"
          className="border rounded px-4 py-2 text-sm hover:bg-zinc-50"
        >
          Найти
        </button>
        {q && (
          <Link
            href="/admin/receipts"
            className="text-sm text-zinc-500 hover:text-zinc-900 py-2"
          >
            Сброс
          </Link>
        )}
      </form>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium">№ Receipt</th>
              <th className="text-left px-4 py-3 font-medium">Дата оплаты</th>
              <th className="text-left px-4 py-3 font-medium">Компания</th>
              <th className="text-left px-4 py-3 font-medium">Контрагент</th>
              <th className="text-right px-4 py-3 font-medium">Сумма</th>
              <th className="text-left px-4 py-3 font-medium">Родительский инвойс</th>
            </tr>
          </thead>
          <tbody>
            {receipts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                  {q ? "Ничего не нашлось." : "Receipts пока нет."}
                </td>
              </tr>
            ) : (
              receipts.map((r) => (
                <tr key={r.id} className="border-t hover:bg-zinc-50/50">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link
                      href={`/admin/invoices/${r.id}`}
                      className="hover:underline"
                    >
                      {r.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {(r.paidAt ?? r.issueDate).toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {r.ourCompany.name}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {r.counterparty.name}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(r.total).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    <span className="text-zinc-400 text-xs">
                      {r.primaryCurrency}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {r.parentInvoice ? (
                      <Link
                        href={`/admin/invoices/${r.parentInvoice.id}`}
                        className="text-zinc-600 hover:underline"
                      >
                        {r.parentInvoice.number}
                      </Link>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {receipts.length === 100 && (
        <p className="text-xs text-zinc-500">
          Показаны первые 100. Добавим пагинацию позже.
        </p>
      )}
    </div>
  );
}
