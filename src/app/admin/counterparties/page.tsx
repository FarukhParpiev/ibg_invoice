import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SearchInput } from "./SearchInput";

export default async function CounterpartiesListPage(
  props: PageProps<"/admin/counterparties">,
) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const showArchived = sp.archived === "1" || sp.all === "1";

  const where = {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { taxId: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(showArchived ? {} : { isActive: true }),
  };

  const [counterparties, totalActive, totalAll] = await Promise.all([
    prisma.counterparty.findMany({
      where,
      orderBy: { name: "asc" },
      take: 100,
      include: { _count: { select: { invoices: true } } },
    }),
    prisma.counterparty.count({ where: { isActive: true } }),
    prisma.counterparty.count(),
  ]);

  const flashDeleted = sp.deleted === "1";
  const flashArchived = sp.archived === "1";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Контрагенты</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {totalActive} активных из {totalAll} всего.
          </p>
        </div>
        <Link
          href="/admin/counterparties/new"
          className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-zinc-800"
        >
          + Новый контрагент
        </Link>
      </div>

      {flashDeleted && (
        <div className="text-sm rounded bg-zinc-100 px-3 py-2">
          Контрагент удалён.
        </div>
      )}
      {flashArchived && (
        <div className="text-sm rounded bg-yellow-50 text-yellow-800 px-3 py-2">
          У контрагента есть инвойсы, поэтому он был скрыт (soft-delete), а не удалён.
        </div>
      )}

      <div className="flex items-center gap-3">
        <SearchInput defaultValue={q} />
        <Link
          href={
            showArchived
              ? "/admin/counterparties"
              : "/admin/counterparties?all=1"
          }
          className="text-sm text-zinc-600 hover:text-black whitespace-nowrap"
        >
          {showArchived ? "Только активные" : "Показать все"}
        </Link>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Название</th>
              <th className="text-left px-4 py-3 font-medium">Язык</th>
              <th className="text-left px-4 py-3 font-medium">E-mail</th>
              <th className="text-left px-4 py-3 font-medium">Инвойсов</th>
              <th className="text-left px-4 py-3 font-medium">Статус</th>
              <th className="text-right px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {counterparties.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  {q
                    ? "Ничего не найдено."
                    : "Пока нет контрагентов. Создайте первого."}
                </td>
              </tr>
            ) : (
              counterparties.map((c) => (
                <tr key={c.id} className="border-t hover:bg-zinc-50/50">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 uppercase text-xs text-zinc-500">
                    {c.preferredLanguage}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{c.email ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-600">
                    {c._count.invoices}
                  </td>
                  <td className="px-4 py-3">
                    {c.isActive ? (
                      <span className="text-green-700 text-xs">● активен</span>
                    ) : (
                      <span className="text-zinc-400 text-xs">○ скрыт</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/counterparties/${c.id}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Редактировать →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {counterparties.length === 100 && (
        <p className="text-xs text-zinc-500">
          Показаны первые 100 результатов. Уточните поиск.
        </p>
      )}
    </div>
  );
}
