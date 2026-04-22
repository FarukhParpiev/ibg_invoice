import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { NewUserForm } from "./NewUserForm";

export default async function NewUserPage() {
  await requireSuperAdmin();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link
          href="/admin/users"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← К юзерам
        </Link>
        <h1 className="text-2xl font-semibold mt-2">Новый юзер</h1>
      </div>
      <NewUserForm />
    </div>
  );
}
