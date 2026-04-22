"use client";

// Client-side nav for the admin sidebar. Renders links and highlights the
// one that matches the current pathname. Kept as a separate component so
// the layout itself can stay a server component.

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
};

export type NavGroup = {
  heading?: string;
  items: NavItem[];
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-5">
      {groups.map((group, gi) => (
        <div key={gi} className="flex flex-col gap-1">
          {group.heading && (
            <div className="px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              {group.heading}
            </div>
          )}
          {group.items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-zinc-900 text-white shadow-sm"
                    : "text-zinc-700 hover:bg-zinc-200/70 hover:text-zinc-900",
                ].join(" ")}
              >
                <span className="w-4 text-center leading-none text-[14px]">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
