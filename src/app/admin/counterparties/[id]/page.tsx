import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CounterpartyForm } from "../CounterpartyForm";

export default async function EditCounterpartyPage(
  props: PageProps<"/admin/counterparties/[id]">,
) {
  const { id } = await props.params;

  const cp = await prisma.counterparty.findUnique({
    where: { id },
    include: { _count: { select: { invoices: true } } },
  });
  if (!cp) notFound();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link
          href="/admin/counterparties"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← Back to list
        </Link>
        <div className="flex items-baseline gap-4 mt-2">
          <h1 className="text-2xl font-semibold">{cp.name}</h1>
          <span className="text-sm text-zinc-500">
            {cp._count.invoices} invoice(s)
          </span>
        </div>
      </div>

      <CounterpartyForm
        mode={{ kind: "edit", id: cp.id }}
        defaults={{
          name: cp.name,
          address: cp.address ?? "",
          taxId: cp.taxId ?? "",
          phone: cp.phone ?? "",
          email: cp.email ?? "",
          preferredLanguage: cp.preferredLanguage,
          notes: cp.notes ?? "",
          isActive: cp.isActive,
        }}
      />
    </div>
  );
}
