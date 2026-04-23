import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { CompanyForm } from "../CompanyForm";

export default async function NewCompanyPage() {
  await requireSuperAdmin();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link
          href="/admin/companies"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← Back to companies
        </Link>
        <h1 className="text-2xl font-semibold mt-2">New company</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Add bank accounts after saving — the form for accounts is on the
          company page.
        </p>
      </div>

      <CompanyForm mode={{ kind: "create" }} />
    </div>
  );
}
