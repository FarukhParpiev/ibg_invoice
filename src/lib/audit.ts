// Лёгкая обёртка над prisma.auditLog.create для записи действий пользователя.
// Ошибки внутри логирования не ломают основное действие — глотаем и идём дальше.

import { prisma } from "@/lib/prisma";
import type { AuditAction, Prisma } from "@prisma/client";

export type AuditEntry = {
  userId: string | null;
  entity: string;
  entityId?: string | null;
  action: AuditAction;
  diff?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
};

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        action: entry.action,
        diff: entry.diff,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write log", err);
  }
}
