import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { BankAccountForm } from "../BankAccountForm";

export default async function NewBankAccountPage(
  props: PageProps<"/admin/companies/[id]/banks/new">,
) {
  await requireSuperAdmin();
  const { id } = await props.params;
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) notFound();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link
          href={`/admin/companies/${company.id}`}
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← Back to {company.name}
        </Link>
        <h1 className="text-2xl font-semibold mt-2">New bank account</h1>
      </div>

      <BankAccountForm mode={{ kind: "create", companyId: company.id }} />
    </div>
  );
}
