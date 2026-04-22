import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdminDashboardPage() {
  const [companiesCount, counterpartiesCount, invoicesCount, draftCount] =
    await Promise.all([
      prisma.company.count({ where: { isActive: true } }),
      prisma.counterparty.count({ where: { isActive: true } }),
      prisma.invoice.count(),
      prisma.invoice.count({ where: { status: "draft" } }),
    ]);

  const cards = [
    {
      title: "Наши компании",
      value: companiesCount,
      href: "/admin/companies",
      hint: "Активных",
    },
    {
      title: "Контрагенты",
      value: counterpartiesCount,
      href: "/admin/counterparties",
      hint: "Активных",
    },
    {
      title: "Инвойсов всего",
      value: invoicesCount,
      href: "#",
      hint: "Включая draft/issued/paid/cancelled",
    },
    {
      title: "Черновики",
      value: draftCount,
      href: "#",
      hint: "Со статусом draft",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Дашборд</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Обзор справочников и инвойсов.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Link
            key={c.title}
            href={c.href}
            className="border rounded-lg p-5 hover:border-zinc-400 transition"
          >
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              {c.title}
            </div>
            <div className="text-3xl font-semibold mt-2">{c.value}</div>
            <div className="text-xs text-zinc-500 mt-1">{c.hint}</div>
          </Link>
        ))}
      </div>

      <div className="border rounded-lg p-6 bg-zinc-50">
        <h2 className="font-medium mb-2">Следующие шаги</h2>
        <ul className="text-sm text-zinc-700 list-disc pl-5 space-y-1">
          <li>
            Отредактируйте{" "}
            <Link href="/admin/companies" className="underline">
              наши 9 компаний
            </Link>{" "}
            — загрузите логотипы (по URL), уточните реквизиты.
          </li>
          <li>
            Добавьте{" "}
            <Link href="/admin/counterparties" className="underline">
              контрагентов
            </Link>{" "}
            — можно постепенно, из старой таблицы.
          </li>
          <li>Этап 2 — создание инвойсов (в разработке).</li>
        </ul>
      </div>
    </div>
  );
}
