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
      title: "Our companies",
      value: companiesCount,
      href: "/admin/companies",
      hint: "Active",
    },
    {
      title: "Counterparties",
      value: counterpartiesCount,
      href: "/admin/counterparties",
      hint: "Active",
    },
    {
      title: "Invoices total",
      value: invoicesCount,
      href: "/admin/invoices",
      hint: "Including draft/issued/paid/cancelled",
    },
    {
      title: "Drafts",
      value: draftCount,
      href: "/admin/invoices?status=draft",
      hint: "With status draft",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Overview of directories and invoices.
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
        <h2 className="font-medium mb-2">Next steps</h2>
        <ul className="text-sm text-zinc-700 list-disc pl-5 space-y-1">
          <li>
            Edit{" "}
            <Link href="/admin/companies" className="underline">
              our 9 companies
            </Link>{" "}
            — upload logos (by URL), refine details.
          </li>
          <li>
            Add{" "}
            <Link href="/admin/counterparties" className="underline">
              counterparties
            </Link>{" "}
            — can be done gradually, from the old spreadsheet.
          </li>
          <li>Stage 2 — invoice creation (in progress).</li>
        </ul>
      </div>
    </div>
  );
}
