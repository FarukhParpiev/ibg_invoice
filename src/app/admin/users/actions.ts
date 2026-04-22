"use server";

// Управление пользователями — только super_admin.
// Обычная роль `user` не может ни открывать страницу, ни звать эти actions
// (все гарды внутри). Действия: создание, редактирование, смена пароля,
// деактивация. Удалять записи физически нельзя — только isActive=false,
// чтобы не рвать foreign keys на созданные юзером инвойсы.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";

const roleEnum = z.enum(["super_admin", "user"]);

const createSchema = z.object({
  email: z.string().email("Некорректный email").max(200),
  name: z.string().max(200).optional().or(z.literal("")),
  role: roleEnum,
  password: z.string().min(8, "Пароль минимум 8 символов").max(200),
});

const updateSchema = z.object({
  name: z.string().max(200).optional().or(z.literal("")),
  role: roleEnum,
  isActive: z.boolean(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8, "Пароль минимум 8 символов").max(200),
});

type Result = { ok: true; id: string } | { ok: false; error: string };

const BCRYPT_ROUNDS = 10;

export async function createUser(rawValues: unknown): Promise<Result> {
  const session = await requireSuperAdmin();
  const parsed = createSchema.safeParse(rawValues);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Ошибка валидации",
    };
  }
  const v = parsed.data;

  const emailLower = v.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: emailLower } });
  if (existing) {
    return { ok: false, error: "Пользователь с таким email уже существует" };
  }

  const passwordHash = await bcrypt.hash(v.password, BCRYPT_ROUNDS);

  const created = await prisma.user.create({
    data: {
      email: emailLower,
      name: v.name?.trim() || null,
      role: v.role,
      passwordHash,
      isActive: true,
    },
  });

  await writeAudit({
    userId: session.user.id,
    entity: "user",
    entityId: created.id,
    action: "create",
    diff: { after: { email: created.email, role: created.role } },
  });

  revalidatePath("/admin/users");
  return { ok: true, id: created.id };
}

export async function updateUser(
  id: string,
  rawValues: unknown,
): Promise<Result> {
  const session = await requireSuperAdmin();
  const parsed = updateSchema.safeParse(rawValues);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Ошибка валидации",
    };
  }
  const v = parsed.data;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { ok: false, error: "Пользователь не найден" };

  // Защита: нельзя понизить/отключить самого себя — иначе можно потерять
  // доступ к единственному super_admin и закрыться снаружи.
  if (target.id === session.user.id) {
    if (v.role !== "super_admin") {
      return { ok: false, error: "Нельзя понизить собственную роль" };
    }
    if (!v.isActive) {
      return { ok: false, error: "Нельзя деактивировать самого себя" };
    }
  }

  // Защита от удаления последнего super_admin
  if (target.role === "super_admin" && v.role !== "super_admin") {
    const otherAdmins = await prisma.user.count({
      where: { role: "super_admin", isActive: true, id: { not: id } },
    });
    if (otherAdmins === 0) {
      return {
        ok: false,
        error: "Нельзя понизить последнего super_admin",
      };
    }
  }

  await prisma.user.update({
    where: { id },
    data: {
      name: v.name?.trim() || null,
      role: v.role,
      isActive: v.isActive,
    },
  });

  await writeAudit({
    userId: session.user.id,
    entity: "user",
    entityId: id,
    action: "update",
    diff: { after: { role: v.role, isActive: v.isActive } },
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}`);
  return { ok: true, id };
}

export async function resetUserPassword(
  id: string,
  rawValues: unknown,
): Promise<Result> {
  const session = await requireSuperAdmin();
  const parsed = resetPasswordSchema.safeParse(rawValues);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Ошибка валидации",
    };
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { ok: false, error: "Пользователь не найден" };

  const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id }, data: { passwordHash } });

  await writeAudit({
    userId: session.user.id,
    entity: "user",
    entityId: id,
    action: "update",
    diff: { after: { passwordReset: true } },
  });

  return { ok: true, id };
}

export async function redirectToUsers() {
  await requireSuperAdmin();
  redirect("/admin/users");
}
