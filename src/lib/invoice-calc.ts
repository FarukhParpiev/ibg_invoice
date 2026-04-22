// Вычисления по позициям и итогам инвойса.
// Всё — в primary currency. USD-эквивалент считается отдельно,
// только если showUsdEquivalent = true и задан exchangeRate (THB за 1 USD).

import { Prisma } from "@prisma/client";

export type ItemInput =
  | {
      itemType: "commission";
      sellingPrice: number;
      sellingPriceCorrection: number;
      commissionPercent: number; // 1.0 = 1%
      commissionCorrection: number;
    }
  | {
      itemType: "bonus";
      bonusAmount: number;
    };

export function calcItemAmount(it: ItemInput): number {
  if (it.itemType === "commission") {
    const sp = (it.sellingPrice ?? 0) + (it.sellingPriceCorrection ?? 0);
    const base = sp * ((it.commissionPercent ?? 0) / 100);
    return round2(base + (it.commissionCorrection ?? 0));
  }
  return round2(it.bonusAmount ?? 0);
}

export type TotalsInput = {
  items: ItemInput[];
  vatApplied: boolean;
  whtApplied: boolean;
  exchangeRate?: number | null;
  showUsdEquivalent?: boolean;
};

export type Totals = {
  subtotal: number;
  vatAmount: number;
  whtAmount: number;
  total: number;
  subtotalUsd: number | null;
  totalUsd: number | null;
};

export function calcTotals(input: TotalsInput): Totals {
  const subtotal = input.items.reduce((s, it) => s + calcItemAmount(it), 0);
  const vatAmount = input.vatApplied ? round2(subtotal * 0.07) : 0;
  const whtAmount = input.whtApplied ? round2(subtotal * 0.03) : 0;
  const total = round2(subtotal + vatAmount - whtAmount);

  let subtotalUsd: number | null = null;
  let totalUsd: number | null = null;
  if (
    input.showUsdEquivalent &&
    input.exchangeRate &&
    Number(input.exchangeRate) > 0
  ) {
    const rate = Number(input.exchangeRate);
    subtotalUsd = round2(subtotal / rate);
    totalUsd = round2(total / rate);
  }

  return {
    subtotal: round2(subtotal),
    vatAmount,
    whtAmount,
    total,
    subtotalUsd,
    totalUsd,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function toDecimal(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

export function toDecimalOrNull(n: number | null | undefined): Prisma.Decimal | null {
  return n == null ? null : new Prisma.Decimal(n);
}

export function decToNum(d: Prisma.Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}
