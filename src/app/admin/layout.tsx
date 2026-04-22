import Link from "next/link";
import Image from "next/image";
import { signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireAdminAccess } from "@/lib/auth-helpers";
import { AdminNav, type NavGroup } from "./AdminNav";

function initialsOf(name: string | null | undefined, email: string): string {
  const base = (name && name.trim()) || email;
  const parts = base.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return letters || base[0]?.toUpperCase() || "?";
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdminAccess();
  const isSuperAdmin = session.user.role === "super_admin";

  // Pull fresh name/email from the DB — session is JWT, so it would show stale
  // values until re-login after a profile edit. This keeps the sidebar honest.
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, name: true, role: true },
  });
  const email = me?.email ?? session.user.email ?? "";
  const name = me?.name ?? null;
  const role = me?.role ?? session.user.role;

  const groups: NavGroup[] = [
    {
      items: [
        { href: "/admin", label: "Dashboard", icon: "◆" },
        { href: "/admin/invoices", label: "Invoices", icon: "▤" },
        { href: "/admin/receipts", label: "Receipts", icon: "✓" },
        { href: "/admin/counterparties", label: "Counterparties", icon: "♁" },
      ],
    },
  ];

  if (isSuperAdmin) {
    groups.push({
      heading: "Administration",
      items: [
        { href: "/admin/companies", label: "Our companies", icon: "⌂" },
        { href: "/admin/users", label: "Users", icon: "◉" },
      ],
    });
  }

  return (
    <div className="min-h-screen grid grid-cols-[260px_1fr] bg-zinc-50">
      <aside className="border-r border-zinc-200 bg-white flex flex-col">
        <div className="px-5 pt-5 pb-4 border-b border-zinc-100">
          <Link href="/admin" className="flex items-center gap-3 group">
            <span className="w-10 h-10 rounded-lg bg-[#1e3a5f] flex items-center justify-center shadow-sm">
              <Image
                src="/logos/ibg.png"
                alt="IBG"
                width={28}
                height={16}
                className="brightness-0 invert"
                priority
              />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-semibold text-[15px] text-zinc-900 group-hover:text-black">
                IBG Invoice
              </span>
              <span className="text-[11px] uppercase tracking-wider text-zinc-400">
                Admin panel
              </span>
            </span>
          </Link>
        </div>

        <div className="flex-1 px-3 py-5 overflow-y-auto">
          <AdminNav groups={groups} />
        </div>

        <div className="border-t border-zinc-100 p-3">
          <Link
            href="/admin/profile"
            className="flex items-center gap-3 p-2 rounded-md hover:bg-zinc-100 transition-colors group"
          >
            <span className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1e3a5f] to-[#2c5282] text-white flex items-center justify-center text-xs font-semibold shadow-sm">
              {initialsOf(name, email)}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-zinc-900 truncate">
                {name || email.split("@")[0]}
              </span>
              <span className="block text-[11px] text-zinc-500 truncate">
                {email}
              </span>
            </span>
            <span className="text-zinc-400 group-hover:text-zinc-700 text-sm">
              ⚙
            </span>
          </Link>

          <div className="flex items-center justify-between px-2 pt-2">
            <span className="text-[10px] uppercase tracking-wider text-zinc-400">
              {role === "super_admin" ? "Super admin" : "User"}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="text-[11px] text-zinc-500 hover:text-red-600"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="min-h-screen">
        <div className="p-8 max-w-[1200px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
