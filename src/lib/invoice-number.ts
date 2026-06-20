// Invoice number generation in the format <PREFIX>DD/MM/YYYY-NNNN.
// NNNN — per-location running counter (Invoice.serialNumber, unique within a
// location). Each location carries an airport-code prefix so numbers never
// collide across locations and the location is readable straight off the
// number: Phuket = "HKT-", Pattaya = "PTY-".
// NOTE: Phuket invoices issued *before* the prefix was introduced keep their
// original bare DD/MM/YYYY-NNNN numbers — issued numbers are immutable, we
// never retro-renumber. Only newly issued invoices get the prefix.
// For receipts, number = parent.number + "-R" (the parent already carries any
// location prefix, so the receipt inherits it for free).
//
// Runs inside a Prisma transaction: read max(serialNumber) for the location,
// + 1, create a record with that value. The unique index on
// (location, serialNumber) guards against races: on conflict — retry.

import type { Location, Prisma } from "@prisma/client";

// Prefix prepended to the number for each location.
const LOCATION_NUMBER_PREFIX: Record<Location, string> = {
  phuket: "HKT-",
  pattaya: "PTY-",
};

/**
 * Date format DD/MM/YYYY.
 */
export function formatIssueDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function buildInvoiceNumber(
  issueDate: Date,
  serial: number,
  location: Location,
): string {
  const nnnn = String(serial).padStart(4, "0");
  return `${LOCATION_NUMBER_PREFIX[location]}${formatIssueDate(issueDate)}-${nnnn}`;
}

export function buildReceiptNumber(parentNumber: string): string {
  return `${parentNumber}-R`;
}

/**
 * Reserves the next serialNumber for a location.
 * Must be called inside a transaction.
 */
export async function allocateNextSerial(
  tx: Prisma.TransactionClient,
  location: Location,
): Promise<number> {
  const agg = await tx.invoice.aggregate({
    where: { location },
    _max: { serialNumber: true },
  });
  const next = (agg._max.serialNumber ?? 0) + 1;
  return next;
}
