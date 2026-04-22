import Link from "next/link";
import { signOut } from "@/auth";
import { requireAdminAccess } from "@/lib/auth-helpers";

// superAdminOnly=true — hides the item from the `user` role.
// Our companies and user management are super_admin only.
const navItems: Array<{ href: string; label: string; superAdminOnly?: boolean }> = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/invoices", label: "Invoices" },
  { href: "/admin/receipts", label: "Receipts" },
  { href: "/admin/companies", label: "Our companies", superAdminOnly: true },
  { href: "/admin/counterparties", label: "Counterparties" },
  { href: "/admin/users", label: "Users", superAdminOnly: true },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdminAccess();
  const isSuperAdmin = session.user.role === "super_admin";
  const visibleNav = navItems.filter(
    (item) => !item.superAdminOnly || isSuperAdmin,
  );

  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr]">
      <aside className="border-r border-zinc-200 bg-zinc-50 p-5 flex flex-col gap-6">
        <div>
          <Link href="/admin" className="font-semibold text-lg">
            IBG Invoice
          </Link>
          <p className="text-xs text-zinc-500 mt-1">Admin</p>
        </div>

        <nav className="flex flex-col gap-1">
          {visibleNav.map((item) => (
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
              Log out →
            </button>
          </form>
        </div>
      </aside>

      <main className="p-8 max-w-[1200px]">{children}</main>
    </div>
  );
}
