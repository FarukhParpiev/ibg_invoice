import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { BankAccountForm } from "../BankAccountForm";

export default async function EditBankAccountPage(
  props: PageProps<"/admin/companies/[id]/banks/[bankId]">,
) {
  await requireSuperAdmin();
  const { id, bankId } = await props.params;

  const bank = await prisma.bankAccount.findUnique({
    where: { id: bankId },
    include: { company: true },
  });

  if (!bank || bank.companyId !== id) notFound();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link
          href={`/admin/companies/${id}`}
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← К {bank.company.name}
        </Link>
        <div className="flex items-baseline gap-3 mt-2">
          <h1 className="text-2xl font-semibold">{bank.bankName}</h1>
          <span className="text-sm text-zinc-500">{bank.currency}</span>
        </div>
      </div>

      <BankAccountForm
        mode={{ kind: "edit", companyId: id, bankId: bank.id }}
        defaults={{
          bankName: bank.bankName,
          accountName: bank.accountName,
          accountNumber: bank.accountNumber,
          swift: bank.swift ?? "",
          branch: bank.branch ?? "",
          bankAddress: bank.bankAddress ?? "",
          currency: bank.currency,
          isDefault: bank.isDefault,
        }}
      />
    </div>
  );
}
