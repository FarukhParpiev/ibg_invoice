import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { CompanyForm } from "../CompanyForm";

export default async function CompanyEditPage(props: PageProps<"/admin/companies/[id]">) {
  await requireSuperAdmin();
  const { id } = await props.params;
  const sp = await props.searchParams;

  const company = await prisma.company.findUnique({
    where: { id },
    include: { bankAccounts: { orderBy: [{ currency: "asc" }, { isDefault: "desc" }] } },
  });

  if (!company) notFound();

  const flashBankDeleted = sp.bankDeleted === "1";
  const flashBankInUse = sp.bankInUse === "1";

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link
          href="/admin/companies"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← Back to companies
        </Link>
        <h1 className="text-2xl font-semibold mt-2">{company.name}</h1>
      </div>

      <CompanyForm
        mode={{ kind: "edit", id: company.id }}
        defaults={{
          name: company.name,
          legalType: company.legalType,
          address: company.address ?? "",
          taxId: company.taxId ?? "",
          registrationNo: company.registrationNo ?? "",
          phone: company.phone ?? "",
          email: company.email ?? "",
          defaultCurrency: company.defaultCurrency,
          isActive: company.isActive,
        }}
      />

      <section className="border rounded-lg p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-medium">Bank accounts</h2>
            <p className="text-xs text-zinc-500 mt-1">
              One account can be marked "default" per currency.
            </p>
          </div>
          <Link
            href={`/admin/companies/${company.id}/banks/new`}
            className="text-sm bg-black text-white rounded px-3 py-1.5 hover:bg-zinc-800"
          >
            + Add
          </Link>
        </div>

        {flashBankDeleted && (
          <div className="text-sm rounded bg-zinc-100 px-3 py-2">
            Account deleted.
          </div>
        )}
        {flashBankInUse && (
          <div className="text-sm rounded bg-red-50 text-red-700 px-3 py-2">
            This account is used by one or more invoices and cannot be deleted.
          </div>
        )}

        {company.bankAccounts.length === 0 ? (
          <p className="text-sm text-zinc-500">No accounts yet.</p>
        ) : (
          <ul className="space-y-2">
            {company.bankAccounts.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/admin/companies/${company.id}/banks/${b.id}`}
                  className="block border rounded p-3 hover:border-zinc-400 transition"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="text-sm">
                      <div className="font-medium">
                        {b.bankName}{" "}
                        <span className="text-zinc-500 font-normal">
                          · {b.currency}
                        </span>
                        {b.isDefault && (
                          <span className="ml-2 text-xs text-green-700">
                            default
                          </span>
                        )}
                      </div>
                      <div className="text-zinc-600 mt-0.5">
                        {b.accountName} — {b.accountNumber}
                        {b.swift && ` · SWIFT ${b.swift}`}
                      </div>
                    </div>
                    <span className="text-xs text-zinc-400 whitespace-nowrap">
                      Edit →
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
