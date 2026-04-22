import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Session } from "next-auth";

/**
 * Требует активную сессию. Если нет — редирект на /login с возвратом.
 */
export async function requireAuth(redirectTo = "/login"): Promise<Session> {
  const session = await auth();
  if (!session?.user) redirect(redirectTo);
  return session;
}

/**
 * Требует роль super_admin. Иначе — /login или 403.
 * Используется для мутаций, которые доступны только владельцам
 * системы: редактирование наших компаний, управление юзерами.
 */
export async function requireSuperAdmin(): Promise<Session> {
  const session = await requireAuth();
  if (session.user.role !== "super_admin") {
    redirect("/?error=forbidden");
  }
  return session;
}

/**
 * Требует любую активную сессию (super_admin или user).
 * Это «рабочая» роль: создавать/править инвойсы, контрагентов, receipts.
 * Мы даём ей всё, кроме наших компаний и управления юзерами.
 */
export async function requireAdminAccess(): Promise<Session> {
  const session = await requireAuth();
  const role = session.user.role;
  if (role !== "super_admin" && role !== "user") {
    redirect("/?error=forbidden");
  }
  return session;
}
