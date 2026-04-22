import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth-helpers";

export default async function CompaniesListPage() {
  // Our companies are edited only by us — the regular `user` role cannot visit this page.
  await requireSuperAdmin();

  const companies = await prisma.company.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { bankAccounts: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Our companies</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Registry of payer companies. Used when creating invoices.
        </p>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-left px-4 py-3 font-medium">Currency</th>
              <th className="text-left px-4 py-3 font-medium">Bank accounts</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
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
                    <span className="text-green-700 text-xs">● active</span>
                  ) : (
                    <span className="text-zinc-400 text-xs">○ hidden</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/companies/${c.id}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Edit →
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
