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
 */
export async function requireSuperAdmin(): Promise<Session> {
  const session = await requireAuth();
  if (session.user.role !== "super_admin") {
    redirect("/?error=forbidden");
  }
  return session;
}
