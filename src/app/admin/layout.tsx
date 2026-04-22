import Link from "next/link";
import { signOut } from "@/auth";
import { requireSuperAdmin } from "@/lib/auth-helpers";

const navItems = [
  { href: "/admin", label: "Дашборд" },
  { href: "/admin/invoices", label: "Инвойсы" },
  { href: "/admin/receipts", label: "Receipts" },
  { href: "/admin/companies", label: "Наши компании" },
  { href: "/admin/counterparties", label: "Контрагенты" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSuperAdmin();

  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr]">
      <aside className="border-r border-zinc-200 bg-zinc-50 p-5 flex flex-col gap-6">
        <div>
          <Link href="/admin" className="font-semibold text-lg">
            IBG Invoice
          </Link>
          <p className="text-xs text-zinc-500 mt-1">Админка</p>
        </div>

        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-2 rounded text-sm hover:bg-zinc-200/60"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-2 text-xs text-zinc-600">
          <div>
            <div className="font-medium text-zinc-800 truncate">
              {session.user.email}
            </div>
            <div className="uppercase text-[10px] text-zinc-500">
              {session.user.role}
            </div>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="w-full text-left text-zinc-700 hover:text-black"
            >
              Выйти →
            </button>
          </form>
        </div>
      </aside>

      <main className="p-8 max-w-[1200px]">{children}</main>
    </div>
  );
}
