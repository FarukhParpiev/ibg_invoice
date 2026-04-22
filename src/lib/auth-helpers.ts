import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Session } from "next-auth";

/**
 * Requires an active session. If none — redirect to /login with return URL.
 */
export async function requireAuth(redirectTo = "/login"): Promise<Session> {
  const session = await auth();
  if (!session?.user) redirect(redirectTo);
  return session;
}

/**
 * Requires super_admin role. Otherwise — /login or 403.
 * Used for mutations available only to system owners:
 * editing our companies, user management.
 */
export async function requireSuperAdmin(): Promise<Session> {
  const session = await requireAuth();
  if (session.user.role !== "super_admin") {
    redirect("/?error=forbidden");
  }
  return session;
}

/**
 * Requires any active session (super_admin or user).
 * This is the "working" role: create/edit invoices, counterparties, receipts.
 * We grant it everything except our companies and user management.
 */
export async function requireAdminAccess(): Promise<Session> {
  const session = await requireAuth();
  const role = session.user.role;
  if (role !== "super_admin" && role !== "user") {
    redirect("/?error=forbidden");
  }
  return session;
}
