import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CompanyEditForm } from "./CompanyEditForm";

export default async function CompanyEditPage(props: PageProps<"/admin/companies/[id]">) {
  const { id } = await props.params;

  const company = await prisma.company.findUnique({
    where: { id },
    include: { bankAccounts: { orderBy: { currency: "asc" } } },
  });

  if (!company) notFound();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link
          href="/admin/companies"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← К списку компаний
        </Link>
        <h1 className="text-2xl font-semibold mt-2">{company.name}</h1>
      </div>

      <CompanyEditForm
        id={company.id}
        defaults={{
          name: company.name,
          legalType: company.legalType,
          address: company.address ?? "",
          taxId: company.taxId ?? "",
          registrationNo: company.registrationNo ?? "",
          phone: company.phone ?? "",
          email: company.email ?? "",
          logoUrl: company.logoUrl ?? "",
          defaultCurrency: company.defaultCurrency,
          isActive: company.isActive,
        }}
      />

      <section className="border rounded-lg p-5">
        <h2 className="font-medium mb-3">Банковские счета</h2>
        {company.bankAccounts.length === 0 ? (
          <p className="text-sm text-zinc-500">Пока нет счетов.</p>
        ) : (
          <ul className="space-y-3">
            {company.bankAccounts.map((b) => (
              <li key={b.id} className="text-sm">
                <div className="font-medium">
                  {b.bankName} · {b.currency}
                  {b.isDefault && (
                    <span className="ml-2 text-xs text-green-700">
                      по умолчанию
                    </span>
                  )}
                </div>
                <div className="text-zinc-600">
                  {b.accountName} — {b.accountNumber}
                  {b.swift && ` · SWIFT ${b.swift}`}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-zinc-400 mt-4">
          Редактирование банковских счетов — в следующем этапе.
        </p>
      </section>
    </div>
  );
}
