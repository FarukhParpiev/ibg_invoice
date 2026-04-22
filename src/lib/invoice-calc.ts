// Вычисления по позициям и итогам инвойса.
// Два режима:
//  • Обычный: всё считается в primary currency. Опционально показываем
//    USD-эквивалент (поделить total на rate), если showUsdEquivalent=true.
//  • convertThbToUsd (шаблон ib_group_usd): все inputs в THB → комиссия в THB,
//    далее Commission(USD) = Commission(THB) / rate. primary=USD,
//    amount позиции хранится в USD; отдельно возвращаем THB-срезы.

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

// Сумма строки в «родной» валюте ввода (THB для ib_group_usd, иначе primary).
export function calcItemAmount(it: ItemInput): number {
  if (it.itemType === "commission") {
    const sp = (it.sellingPrice ?? 0) + (it.sellingPriceCorrection ?? 0);
    const base = sp * ((it.commissionPercent ?? 0) / 100);
    return round2(base + (it.commissionCorrection ?? 0));
  }
  return round2(it.bonusAmount ?? 0);
}

// Итоговая сумма строки в USD для шаблона ib_group_usd.
export function calcItemAmountUsd(it: ItemInput, rate: number): number {
  if (!rate || rate <= 0) return 0;
  return round2(calcItemAmount(it) / rate);
}

export type TotalsInput = {
  items: ItemInput[];
  vatApplied: boolean;
  whtApplied: boolean;
  exchangeRate?: number | null;
  showUsdEquivalent?: boolean;
  // Включает расчёт THB→USD: inputs трактуются как THB, amount = THB/rate,
  // totals субтотал/тотал в USD; subtotalThb/totalThb тоже возвращаются.
  convertThbToUsd?: boolean;
};

export type Totals = {
  subtotal: number;
  vatAmount: number;
  whtAmount: number;
  total: number;
  // В обычном режиме: USD-эквивалент, если showUsdEquivalent=true.
  // В режиме convertThbToUsd: null (тоталы уже в USD).
  subtotalUsd: number | null;
  totalUsd: number | null;
  // Только при convertThbToUsd: THB-срез по позициям до деления на rate.
  subtotalThb: number | null;
  totalThb: number | null;
};

export function calcTotals(input: TotalsInput): Totals {
  const rate = input.exchangeRate ? Number(input.exchangeRate) : 0;

  if (input.convertThbToUsd) {
    // THB → USD. Без валидного курса считать нечего: возвращаем нули,
    // но структуру сохраняем, чтобы UI не падал.
    const subtotalThb = input.items.reduce(
      (s, it) => s + calcItemAmount(it),
      0,
    );
    const vatThb = input.vatApplied ? round2(subtotalThb * 0.07) : 0;
    const whtThb = input.whtApplied ? round2(subtotalThb * 0.03) : 0;
    const totalThb = round2(subtotalThb + vatThb - whtThb);

    if (rate <= 0) {
      return {
        subtotal: 0,
        vatAmount: 0,
        whtAmount: 0,
        total: 0,
        subtotalUsd: null,
        totalUsd: null,
        subtotalThb: round2(subtotalThb),
        totalThb,
      };
    }

    const subtotalUsd = round2(subtotalThb / rate);
    const vatAmountUsd = input.vatApplied ? round2(subtotalUsd * 0.07) : 0;
    const whtAmountUsd = input.whtApplied ? round2(subtotalUsd * 0.03) : 0;
    const totalUsd = round2(subtotalUsd + vatAmountUsd - whtAmountUsd);

    return {
      subtotal: subtotalUsd,
      vatAmount: vatAmountUsd,
      whtAmount: whtAmountUsd,
      total: totalUsd,
      subtotalUsd: null,
      totalUsd: null,
      subtotalThb: round2(subtotalThb),
      totalThb,
    };
  }

  const subtotal = input.items.reduce((s, it) => s + calcItemAmount(it), 0);
  const vatAmount = input.vatApplied ? round2(subtotal * 0.07) : 0;
  const whtAmount = input.whtApplied ? round2(subtotal * 0.03) : 0;
  const total = round2(subtotal + vatAmount - whtAmount);

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
