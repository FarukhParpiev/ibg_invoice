"use server";

// Self-service profile actions. Available to any authenticated user
// (super_admin or user) and only touch the caller's own row — there is no
// `userId` parameter, we always use session.user.id.
//
// Sensitive changes (email, password) require re-entering the current password.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";

const BCRYPT_ROUNDS = 10;

type Result = { ok: true } | { ok: false; error: string };

const nameSchema = z.object({
  name: z.string().trim().max(200),
});

const emailSchema = z.object({
  email: z.string().email("Invalid email").max(200),
  currentPassword: z.string().min(1, "Current password is required"),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters")
      .max(200),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

async function loadMe(userId: string) {
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me || !me.isActive) {
    return null;
  }
  return me;
}

export async function updateOwnName(rawValues: unknown): Promise<Result> {
  const session = await requireAuth();
  const parsed = nameSchema.safeParse(rawValues);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Validation error",
    };
  }

  const me = await loadMe(session.user.id);
  if (!me) return { ok: false, error: "User not found" };

  const newName = parsed.data.name || null;
  await prisma.user.update({
    where: { id: me.id },
    data: { name: newName },
  });

  await writeAudit({
    userId: me.id,
    entity: "user",
    entityId: me.id,
    action: "update",
    diff: { self: true, after: { name: newName } },
  });

  revalidatePath("/admin/profile");
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function updateOwnEmail(rawValues: unknown): Promise<Result> {
  const session = await requireAuth();
  const parsed = emailSchema.safeParse(rawValues);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Validation error",
    };
  }
  const { email, currentPassword } = parsed.data;

  const me = await loadMe(session.user.id);
  if (!me) return { ok: false, error: "User not found" };

  if (!me.passwordHash) {
    return { ok: false, error: "No password set on this account" };
  }
  const ok = await bcrypt.compare(currentPassword, me.passwordHash);
  if (!ok) {
    return { ok: false, error: "Current password is incorrect" };
  }

  const emailLower = email.trim().toLowerCase();
  if (emailLower === me.email) {
    return { ok: false, error: "This is already your email" };
  }

  const collision = await prisma.user.findUnique({
    where: { email: emailLower },
  });
  if (collision && collision.id !== me.id) {
    return { ok: false, error: "This email is already in use" };
  }

  await prisma.user.update({
    where: { id: me.id },
    data: { email: emailLower },
  });

  await writeAudit({
    userId: me.id,
    entity: "user",
    entityId: me.id,
    action: "update",
    diff: { self: true, after: { email: emailLower } },
  });

  revalidatePath("/admin/profile");
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function updateOwnPassword(rawValues: unknown): Promise<Result> {
  const session = await requireAuth();
  const parsed = passwordSchema.safeParse(rawValues);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Validation error",
    };
  }
  const { currentPassword, newPassword } = parsed.data;

  const me = await loadMe(session.user.id);
  if (!me) return { ok: false, error: "User not found" };

  if (!me.passwordHash) {
    return { ok: false, error: "No password set on this account" };
  }
  const ok = await bcrypt.compare(currentPassword, me.passwordHash);
  if (!ok) {
    return { ok: false, error: "Current password is incorrect" };
  }

  if (currentPassword === newPassword) {
    return {
      ok: false,
      error: "New password must differ from the current one",
    };
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.user.update({
    where: { id: me.id },
    data: { passwordHash },
  });

  await writeAudit({
    userId: me.id,
    entity: "user",
    entityId: me.id,
    action: "update",
    diff: { self: true, after: { passwordChanged: true } },
  });

  return { ok: true };
}
