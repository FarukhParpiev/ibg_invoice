import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdminAccess } from "@/lib/auth-helpers";
import { MigratePdfsButton } from "./MigratePdfsButton";

type Card = {
  title: string;
  value: number;
  href: string;
  hint: string;
};

export default async function AdminDashboardPage() {
  const session = await requireAdminAccess();
  const isSuperAdmin = session.user.role === "super_admin";

  const [companiesCount, counterpartiesCount, invoicesCount, draftCount] =
    await Promise.all([
      prisma.company.count({ where: { isActive: true } }),
      prisma.counterparty.count({ where: { isActive: true } }),
      prisma.invoice.count(),
      prisma.invoice.count({ where: { status: "draft" } }),
    ]);

  const cards: Card[] = [];

  // "Our companies" is super-admin territory — don't show a dead link to
  // regular users (they'd get /?error=forbidden on click).
  if (isSuperAdmin) {
    cards.push({
      title: "Our companies",
      value: companiesCount,
      href: "/admin/companies",
      hint: "Active",
    });
  }

  cards.push(
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
  );

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
        <h2 className="font-medium mb-2">Quick actions</h2>
        <ul className="text-sm text-zinc-700 list-disc pl-5 space-y-1">
          <li>
            Create a new{" "}
            <Link href="/admin/invoices/new" className="underline">
              invoice
            </Link>
            .
          </li>
          <li>
            Add a{" "}
            <Link href="/admin/counterparties/new" className="underline">
              counterparty
            </Link>
            .
          </li>
          <li>
            Review recent{" "}
            <Link href="/admin/receipts" className="underline">
              receipts
            </Link>
            .
          </li>
        </ul>
      </div>

      {isSuperAdmin && (
        <div className="border rounded-lg p-6">
          <h2 className="font-medium mb-1">Maintenance</h2>
          <p className="text-sm text-zinc-500 mb-3">
            Migrate invoices whose PDF still lives on the old private Blob store
            to the new public store. Safe to re-run — already-public PDFs are
            skipped.
          </p>
          <MigratePdfsButton />
        </div>
      )}
    </div>
  );
}
