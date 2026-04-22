import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth-helpers";

export default async function CompaniesListPage() {
  // Наши компании редактируем только мы — обычная роль `user` сюда не ходит.
  await requireSuperAdmin();

  const companies = await prisma.company.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { bankAccounts: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Наши компании</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Реестр компаний-плательщиков. Используются при создании инвойсов.
        </p>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Название</th>
              <th className="text-left px-4 py-3 font-medium">Тип</th>
              <th className="text-left px-4 py-3 font-medium">Валюта</th>
              <th className="text-left px-4 py-3 font-medium">Банк. счетов</th>
              <th className="text-left px-4 py-3 font-medium">Статус</th>
              <th className="text-right px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-t hover:bg-zinc-50/50">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs uppercase px-2 py-0.5 rounded ${
                      c.legalType === "resident"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-purple-50 text-purple-700"
                    }`}
                  >
                    {c.legalType}
                  </span>
                </td>
                <td className="px-4 py-3">{c.defaultCurrency}</td>
                <td className="px-4 py-3 text-zinc-600">
                  {c._count.bankAccounts}
                </td>
                <td className="px-4 py-3">
                  {c.isActive ? (
                    <span className="text-green-700 text-xs">● активна</span>
                  ) : (
                    <span className="text-zinc-400 text-xs">○ скрыта</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/companies/${c.id}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Редактировать →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
