import Link from "next/link";
import { CounterpartyForm } from "../CounterpartyForm";

export default function NewCounterpartyPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link
          href="/admin/counterparties"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← К списку
        </Link>
        <h1 className="text-2xl font-semibold mt-2">Новый контрагент</h1>
      </div>

      <CounterpartyForm mode={{ kind: "create" }} />
    </div>
  );
}
