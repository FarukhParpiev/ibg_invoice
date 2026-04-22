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
    }
  | {
      itemType: "other";
      otherAmount: number;
    };

// Сумма строки в «родной» валюте ввода (THB для ib_group_usd, иначе primary).
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

// Итоговая сумма строки в USD для шаблона ib_group_usd.
export function calcItemAmountUsd(it: ItemInput, rate: number): number {
  if (!rate || rate <= 0) return 0;
  return round2(calcItemAmount(it) / rate);
}

export type TotalsInput = {
  items: ItemInput[];
  vatApplied: boolean;
  // true  → VAT уже «сидит» внутри сумм позиций: вытаскиваем его как 7/107,
  //         total = subtotal − wht (субтотал не меняется).
  // false → VAT начисляется сверху: vat = subtotal × 0.07, total = subtotal + vat − wht.
  // WHT всегда считается от pre-VAT базы (net), чтобы 3% совпадало в обоих режимах.
  vatIncluded?: boolean;
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

// Возвращает {vatAmount, whtAmount, total} от субтотала в нужном режиме VAT.
// Ключевое: WHT всегда от pre-VAT базы, чтобы сумма WHT совпадала
// в «VAT сверху» и «VAT включён» режимах (тайская практика).
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
    // VAT уже в субтотале: извлекаем 7/107, WHT от net-базы (subtotal − vat).
    const vat = round2(subtotal * (7 / 107));
    const net = subtotal - vat;
    const wht = whtApplied ? round2(net * 0.03) : 0;
    // Total не добавляет VAT — он уже внутри субтотала; минусуем только WHT.
    return { vatAmount: vat, whtAmount: wht, total: round2(subtotal - wht) };
  }

  // VAT сверху (дефолтный старый режим): субтотал = net.
  const vat = round2(subtotal * 0.07);
  const wht = whtApplied ? round2(subtotal * 0.03) : 0;
  return { vatAmount: vat, whtAmount: wht, total: round2(subtotal + vat - wht) };
}

export function calcTotals(input: TotalsInput): Totals {
  const rate = input.exchangeRate ? Number(input.exchangeRate) : 0;
  const vatIncluded = !!input.vatIncluded;

  if (input.convertThbToUsd) {
    // THB → USD. Без валидного курса считать нечего: возвращаем нули,
    // но структуру сохраняем, чтобы UI не падал.
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
