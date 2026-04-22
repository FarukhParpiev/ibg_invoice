import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { EditUserForm } from "./EditUserForm";
import { ResetPasswordForm } from "./ResetPasswordForm";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSuperAdmin();
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!user) notFound();

  const isSelf = session.user.id === user.id;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link
          href="/admin/users"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← К юзерам
        </Link>
        <h1 className="text-2xl font-semibold mt-2">{user.email}</h1>
        <p className="text-xs text-zinc-500 mt-1">
          Создан {user.createdAt.toISOString().slice(0, 10)}
          {isSelf && " · это вы"}
        </p>
      </div>

      <EditUserForm
        id={user.id}
        defaults={{
          name: user.name ?? "",
          role: user.role,
          isActive: user.isActive,
        }}
        isSelf={isSelf}
      />

      <section className="border rounded-lg p-5 bg-white space-y-3">
        <h2 className="font-medium">Сбросить пароль</h2>
        <p className="text-xs text-zinc-500">
          Задайте новый пароль для юзера. После сохранения старый пароль перестанет работать.
        </p>
        <ResetPasswordForm id={user.id} />
      </section>
    </div>
  );
}
