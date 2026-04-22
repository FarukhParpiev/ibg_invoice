// Invoice number generation in the format DD/MM/YYYY-NNNN.
// NNNN — global running counter (Invoice.serialNumber).
// For receipts, number = parent.number + "-R".
//
// Runs inside a Prisma transaction: read max(serialNumber) + 1,
// create a record with that value. The unique index on serialNumber
// guards against races: on conflict — retry the transaction.

import type { Prisma } from "@prisma/client";

/**
 * Date format DD/MM/YYYY.
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
 * Reserves the next global serialNumber.
 * Must be called inside a transaction.
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
