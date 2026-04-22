import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { notFound } from "next/navigation";
import { ProfileForms } from "./ProfileForms";

export default async function ProfilePage() {
  const session = await requireAuth();
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });
  if (!me) notFound();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">My profile</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Update your name, email, and password. You stay signed in after any
          change — email and password updates are applied immediately.
        </p>
      </div>

      <div className="border rounded-lg p-5 bg-white flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#1e3a5f] to-[#2c5282] text-white flex items-center justify-center text-lg font-semibold shadow-sm">
          {initials(me.name, me.email)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-zinc-900 truncate">
            {me.name || me.email.split("@")[0]}
          </div>
          <div className="text-sm text-zinc-500 truncate">{me.email}</div>
        </div>
        <div className="text-[11px] uppercase tracking-wider text-zinc-500 bg-zinc-100 rounded px-2 py-1">
          {me.role === "super_admin" ? "Super admin" : "User"}
        </div>
      </div>

      <ProfileForms
        defaults={{
          name: me.name ?? "",
          email: me.email,
        }}
      />

      <div className="text-xs text-zinc-400 pt-2">
        Account created{" "}
        {me.createdAt.toISOString().slice(0, 10)}
      </div>
    </div>
  );
}

function initials(name: string | null, email: string): string {
  const base = (name && name.trim()) || email;
  const parts = base.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return letters || base[0]?.toUpperCase() || "?";
}
