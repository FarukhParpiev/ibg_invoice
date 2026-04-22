// Генерация номера инвойса в формате ДД/ММ/ГГГГ-NNNN.
// NNNN — глобальный сквозной счётчик (Invoice.serialNumber).
// Для receipt'ов номер = parent.number + "-R".
//
// Работает внутри prisma-транзакции: получаем max(serialNumber) + 1,
// создаём запись с этим значением. Уникальный индекс на serialNumber
// защищает от гонок: в случае конфликта — повторяем transaction (retry).

import type { Prisma } from "@prisma/client";

/**
 * Формат даты ДД/ММ/ГГГГ.
 */
export function formatIssueDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function buildInvoiceNumber(issueDate: Date, serial: number): string {
  const nnnn = String(serial).padStart(4, "0");
  return `${formatIssueDate(issueDate)}-${nnnn}`;
}

export function buildReceiptNumber(parentNumber: string): string {
  return `${parentNumber}-R`;
}

/**
 * Резервирует следующий глобальный serialNumber.
 * Должен вызываться внутри транзакции.
 */
export async function allocateNextSerial(
  tx: Prisma.TransactionClient,
): Promise<number> {
  const agg = await tx.invoice.aggregate({
    _max: { serialNumber: true },
  });
  const next = (agg._max.serialNumber ?? 0) + 1;
  return next;
}
