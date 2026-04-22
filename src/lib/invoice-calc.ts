// Line-item and totals calculations for invoices.
// Two modes:
//  • Normal: everything is computed in the primary currency. Optionally show
//    a USD equivalent (divide total by rate) when showUsdEquivalent=true.
//  • convertThbToUsd (ib_group_usd template): all inputs in THB → commission
//    in THB, then Commission(USD) = Commission(THB) / rate. primary=USD,
//    line amount is stored in USD; THB breakdown returned separately.

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
    }
  | {
      itemType: "other";
      otherAmount: number;
    };

// Line amount in the "native" input currency (THB for ib_group_usd, otherwise primary).
export function calcItemAmount(it: ItemInput): number {
  if (it.itemType === "commission") {
    const sp = (it.sellingPrice ?? 0) + (it.sellingPriceCorrection ?? 0);
    const base = sp * ((it.commissionPercent ?? 0) / 100);
    return round2(base + (it.commissionCorrection ?? 0));
  }
  if (it.itemType === "bonus") {
    return round2(it.bonusAmount ?? 0);
  }
  return round2(it.otherAmount ?? 0);
}

// Final line amount in USD for the ib_group_usd template.
export function calcItemAmountUsd(it: ItemInput, rate: number): number {
  if (!rate || rate <= 0) return 0;
  return round2(calcItemAmount(it) / rate);
}

export type TotalsInput = {
  items: ItemInput[];
  vatApplied: boolean;
  // true  → VAT is already embedded in line amounts: extract it as 7/107,
  //         total = subtotal − wht (subtotal unchanged).
  // false → VAT is added on top: vat = subtotal × 0.07, total = subtotal + vat − wht.
  // WHT is always computed off the pre-VAT base (net), so 3% matches in both modes.
  vatIncluded?: boolean;
  whtApplied: boolean;
  exchangeRate?: number | null;
  showUsdEquivalent?: boolean;
  // Enables THB→USD calculation: inputs treated as THB, amount = THB/rate,
  // totals subtotal/total in USD; subtotalThb/totalThb are also returned.
  convertThbToUsd?: boolean;
};

export type Totals = {
  subtotal: number;
  vatAmount: number;
  whtAmount: number;
  total: number;
  // In normal mode: USD equivalent when showUsdEquivalent=true.
  // In convertThbToUsd mode: null (totals are already in USD).
  subtotalUsd: number | null;
  totalUsd: number | null;
  // Only in convertThbToUsd: THB slice over items before dividing by rate.
  subtotalThb: number | null;
  totalThb: number | null;
};

// Returns {vatAmount, whtAmount, total} from a subtotal under the chosen VAT mode.
// Key point: WHT is always off the pre-VAT base so the WHT amount matches
// between "VAT on top" and "VAT included" modes (Thai practice).
function applyTaxes(
  subtotal: number,
  vatApplied: boolean,
  vatIncluded: boolean,
  whtApplied: boolean,
): { vatAmount: number; whtAmount: number; total: number } {
  if (!vatApplied) {
    const wht = whtApplied ? round2(subtotal * 0.03) : 0;
    return { vatAmount: 0, whtAmount: wht, total: round2(subtotal - wht) };
  }

  if (vatIncluded) {
    // VAT already in the subtotal: extract 7/107, WHT off the net base (subtotal − vat).
    const vat = round2(subtotal * (7 / 107));
    const net = subtotal - vat;
    const wht = whtApplied ? round2(net * 0.03) : 0;
    // Total does not add VAT — it is already inside the subtotal; only WHT is subtracted.
    return { vatAmount: vat, whtAmount: wht, total: round2(subtotal - wht) };
  }

  // VAT on top (default legacy mode): subtotal = net.
  const vat = round2(subtotal * 0.07);
  const wht = whtApplied ? round2(subtotal * 0.03) : 0;
  return { vatAmount: vat, whtAmount: wht, total: round2(subtotal + vat - wht) };
}

export function calcTotals(input: TotalsInput): Totals {
  const rate = input.exchangeRate ? Number(input.exchangeRate) : 0;
  const vatIncluded = !!input.vatIncluded;

  if (input.convertThbToUsd) {
    // THB → USD. With no valid rate there is nothing to compute: return zeros
    // but keep the shape so the UI does not crash.
    const subtotalThb = input.items.reduce(
      (s, it) => s + calcItemAmount(it),
      0,
    );
    const thbTaxes = applyTaxes(
      subtotalThb,
      input.vatApplied,
      vatIncluded,
      input.whtApplied,
    );

    if (rate <= 0) {
      return {
        subtotal: 0,
        vatAmount: 0,
        whtAmount: 0,
        total: 0,
        subtotalUsd: null,
        totalUsd: null,
        subtotalThb: round2(subtotalThb),
        totalThb: thbTaxes.total,
      };
    }

    const subtotalUsd = round2(subtotalThb / rate);
    const usdTaxes = applyTaxes(
      subtotalUsd,
      input.vatApplied,
      vatIncluded,
      input.whtApplied,
    );

    return {
      subtotal: subtotalUsd,
      vatAmount: usdTaxes.vatAmount,
      whtAmount: usdTaxes.whtAmount,
      total: usdTaxes.total,
      subtotalUsd: null,
      totalUsd: null,
      subtotalThb: round2(subtotalThb),
      totalThb: thbTaxes.total,
    };
  }

  const subtotal = input.items.reduce((s, it) => s + calcItemAmount(it), 0);
  const { vatAmount, whtAmount, total } = applyTaxes(
    subtotal,
    input.vatApplied,
    vatIncluded,
    input.whtApplied,
  );

  let subtotalUsd: number | null = null;
  let totalUsd: number | null = null;
  if (input.showUsdEquivalent && rate > 0) {
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
    subtotalThb: null,
    totalThb: null,
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
