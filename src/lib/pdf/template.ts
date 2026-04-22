// HTML-шаблон для PDF инвойса.
// Одна универсальная вёрстка, которая адаптируется под поле Invoice.template:
// - ibg_kas            → скрывает банковские реквизиты (наличные)
// - crypto             → заголовок "Crypto payment" вместо банка
// - остальные          → полноценный блок с банковскими реквизитами
//
// Язык берётся из counterparty.preferredLanguage.

import fs from "node:fs";
import path from "node:path";
import type {
  BankAccount,
  Company,
  Counterparty,
  Invoice,
  InvoiceItem,
  PaymentTerms,
} from "@prisma/client";
import { t, type PdfLang } from "./i18n";

// Универсальный логотип IBG — одинаковый для всех 9 компаний.
// Встраиваем как data-URI, потому что page.setContent() в Puppeteer не имеет
// baseURL, и относительные пути не резолвятся.
let cachedLogoDataUri: string | null | undefined;
function loadUniversalLogoDataUri(): string | null {
  if (cachedLogoDataUri !== undefined) return cachedLogoDataUri;
  const candidates: Array<{ file: string; mime: string }> = [
    { file: "ibg.svg", mime: "image/svg+xml" },
    { file: "ibg.png", mime: "image/png" },
    { file: "ibg.jpg", mime: "image/jpeg" },
    { file: "ibg.jpeg", mime: "image/jpeg" },
    { file: "ibg.webp", mime: "image/webp" },
  ];
  for (const c of candidates) {
    const p = path.join(process.cwd(), "public", "logos", c.file);
    try {
      const buf = fs.readFileSync(p);
      cachedLogoDataUri = `data:${c.mime};base64,${buf.toString("base64")}`;
      return cachedLogoDataUri;
    } catch {
      // файла нет — пробуем следующий формат
    }
  }
  cachedLogoDataUri = null;
  return null;
}

export type InvoicePdfData = Invoice & {
  items: InvoiceItem[];
  ourCompany: Company;
  ourBankAccount: BankAccount;
  counterparty: Counterparty;
  paymentTerms: PaymentTerms | null;
};

function fmt(
  n: Parameters<typeof Number>[0] | null | undefined,
  lang: PdfLang,
): string {
  if (n == null) return "—";
  const num = Number(n);
  const locale = lang === "th" ? "en-US" : lang === "ru" ? "ru-RU" : "en-US";
  return num.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(d: Date, lang: PdfLang): string {
  const locale = lang === "th" ? "en-GB" : lang === "ru" ? "ru-RU" : "en-GB";
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// THB-сумма строки (до деления на курс). Для commission собирается из
// sellingPrice+spCorr × % + commCorr; для bonus — сам bonusAmount.
// Inputs в БД всегда в «базовой» валюте (для ib_group_usd это THB),
// что позволяет восстановить THB-срез детерминированно.
function calcItemThbAmount(it: InvoicePdfData["items"][number]): number {
  if (it.itemType === "commission") {
    const sp = Number(it.sellingPrice ?? 0) + Number(it.sellingPriceCorrection ?? 0);
    const base = sp * (Number(it.commissionPercent ?? 0) / 100);
    return base + Number(it.commissionCorrection ?? 0);
  }
  if (it.itemType === "bonus") {
    return Number(it.bonusAmount ?? 0);
  }
  return Number(it.otherAmount ?? 0);
}

export function renderInvoiceHtml(invoice: InvoicePdfData): string {
  const lang = invoice.counterparty.preferredLanguage as PdfLang;
  const L = t(lang);

  const isReceipt = invoice.type === "receipt";
  const isCash = invoice.template === "ibg_kas";
  const isCrypto = invoice.template === "crypto";
  const isUsdTemplate = invoice.template === "ib_group_usd";
  const rate = invoice.exchangeRate ? Number(invoice.exchangeRate) : 0;

  const title = isReceipt ? L.receipt : L.invoice;
  const number = invoice.number ?? "—";

  const titleColor = isReceipt ? "#047857" : "#111";

  const cancelledBanner =
    invoice.status === "cancelled"
      ? `
        <div class="cancel-banner">
          ${escapeHtml(L.cancelled)}${invoice.cancelledReason ? ` — ${escapeHtml(L.cancelledReason)}: ${escapeHtml(invoice.cancelledReason)}` : ""}
        </div>
      `
      : "";

  const paidBanner =
    isReceipt && invoice.paidAt
      ? `<div class="paid-banner">${escapeHtml(L.paidOn)}: ${fmtDate(invoice.paidAt, lang)}</div>`
      : "";

  const itemsRows = invoice.items
    .map((it) => {
      const typeLabel =
        it.itemType === "commission"
          ? L.commission
          : it.itemType === "bonus"
            ? L.bonus
            : L.other;
      const descLines = [
        it.projectName ? `<div>${escapeHtml(it.projectName)}</div>` : "",
        it.unitCode
          ? `<div class="muted">${escapeHtml(L.unit)}: ${escapeHtml(it.unitCode)}</div>`
          : "",
        it.note ? `<div class="muted">${escapeHtml(it.note)}</div>` : "",
      ]
        .filter(Boolean)
        .join("");

      const details =
        it.itemType === "commission"
          ? `<div class="muted">${escapeHtml(L.sellingPrice)}: ${fmt(it.sellingPrice, lang)}${
              Number(it.sellingPriceCorrection) !== 0
                ? ` (${fmt(it.sellingPriceCorrection, lang)})`
                : ""
            } × ${fmt(it.commissionPercent, lang)}%${
              Number(it.commissionCorrection) !== 0
                ? ` + ${fmt(it.commissionCorrection, lang)}`
                : ""
            }</div>`
          : "";

      if (isUsdTemplate) {
        const thb = calcItemThbAmount(it);
        return `
          <tr>
            <td class="col-no">${it.positionNo}</td>
            <td>
              <div class="type-badge type-${it.itemType}">${escapeHtml(typeLabel)}</div>
              ${descLines}
              ${details}
            </td>
            <td class="col-amount">${fmt(thb, lang)}</td>
            <td class="col-amount">${fmt(it.amount, lang)}</td>
          </tr>
        `;
      }

      return `
        <tr>
          <td class="col-no">${it.positionNo}</td>
          <td>
            <div class="type-badge type-${it.itemType}">${escapeHtml(typeLabel)}</div>
            ${descLines}
            ${details}
          </td>
          <td class="col-amount">${fmt(it.amount, lang)}</td>
        </tr>
      `;
    })
    .join("");

  // USD-шаблон: справочные THB-суммы. Sum(line THB) = subtotalThb.
  // VAT-режим: сверху (+7%) или включён в сумму (извлекаем 7/107).
  // WHT всегда от pre-VAT базы (net) — в обоих режимах 3% совпадает.
  const subtotalThb = isUsdTemplate
    ? invoice.items.reduce((s, it) => s + calcItemThbAmount(it), 0)
    : 0;
  const vatIncluded = invoice.vatIncluded;
  const vatThb = isUsdTemplate && invoice.vatApplied
    ? vatIncluded
      ? subtotalThb * (7 / 107)
      : subtotalThb * 0.07
    : 0;
  const netThb = vatIncluded ? subtotalThb - vatThb : subtotalThb;
  const whtThb = isUsdTemplate && invoice.whtApplied ? netThb * 0.03 : 0;
  const totalThb = vatIncluded
    ? subtotalThb - whtThb
    : subtotalThb + vatThb - whtThb;

  // На receipt платёжные реквизиты не нужны — деньги уже получены,
   // а блок съедает пол-страницы и выталкивает receipt на вторую A4.
  const paymentSection = isReceipt
    ? ""
    : isCash
    ? `<div class="pay-block"><strong>${escapeHtml(L.cash)}</strong></div>`
    : isCrypto
      ? `<div class="pay-block">
            <div class="pay-title">${escapeHtml(L.crypto)}</div>
            <div class="muted">${escapeHtml(L.paymentDetails)}</div>
            <div>${escapeHtml(invoice.ourBankAccount.bankName)}</div>
            <div>${escapeHtml(invoice.ourBankAccount.accountNumber)}</div>
         </div>`
      : `<div class="pay-block">
            <div class="pay-title">${escapeHtml(L.paymentDetails)}</div>
            <table class="pay-table">
              <tr><td>${escapeHtml(L.bankName)}</td><td>${escapeHtml(invoice.ourBankAccount.bankName)}</td></tr>
              <tr><td>${escapeHtml(L.accountName)}</td><td>${escapeHtml(invoice.ourBankAccount.accountName)}</td></tr>
              <tr><td>${escapeHtml(L.accountNumber)}</td><td>${escapeHtml(invoice.ourBankAccount.accountNumber)}</td></tr>
              ${
                invoice.ourBankAccount.swift
                  ? `<tr><td>${escapeHtml(L.swift)}</td><td>${escapeHtml(invoice.ourBankAccount.swift)}</td></tr>`
                  : ""
              }
              ${
                invoice.ourBankAccount.branch
                  ? `<tr><td>${escapeHtml(L.branch)}</td><td>${escapeHtml(invoice.ourBankAccount.branch)}</td></tr>`
                  : ""
              }
              ${
                invoice.ourBankAccount.bankAddress
                  ? `<tr><td>${escapeHtml(L.bankAddress)}</td><td>${escapeHtml(invoice.ourBankAccount.bankAddress)}</td></tr>`
                  : ""
              }
            </table>
            ${
              invoice.paymentTerms
                ? `<div class="muted" style="margin-top:6px">${escapeHtml(L.paymentTerms)}: ${escapeHtml(invoice.paymentTerms.label)}</div>`
                : ""
            }
         </div>`;

  const universalLogo = loadUniversalLogoDataUri();
  const logoBlock = universalLogo
    ? `<img src="${universalLogo}" alt="logo" class="logo"/>`
    : "";

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(title)} ${escapeHtml(number)}</title>
<style>
  /* Поля задаём через page.pdf({margin}) в generate.ts (15 мм).
     Здесь фиксируем только размер — если указать margin:0, CSS @page
     перебьёт puppeteer-опцию и всё упрётся в край листа. */
  @page { size: A4; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; font-family: ${lang === "th" ? "'Sarabun', 'Noto Sans Thai', sans-serif" : "-apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"}; font-size: 9pt; color: #111; line-height: 1.35; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${titleColor}; padding-bottom: 6px; margin-bottom: 10px; }
  .header .title { font-size: 18pt; font-weight: 700; letter-spacing: 2px; color: ${titleColor}; }
  .header .meta { text-align: right; font-size: 9pt; }
  .header .meta .num { font-size: 11pt; font-weight: 600; margin-top: 2px; font-family: 'Courier New', monospace; }
  .logo { max-height: 46px; max-width: 200px; object-fit: contain; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 10px; }
  .party h3 { margin: 0 0 2px 0; font-size: 8pt; text-transform: uppercase; color: #666; letter-spacing: 0.6px; font-weight: 500; }
  .party .name { font-weight: 600; font-size: 10pt; margin-bottom: 2px; }
  .party .info { color: #333; white-space: pre-line; line-height: 1.3; }
  .party .info .row { color: #555; }
  .cancel-banner { background: #fee; color: #a11; border: 1px solid #faa; padding: 6px 12px; margin-bottom: 8px; font-weight: 600; text-align: center; }
  .paid-banner { background: #ecfdf5; color: #047857; border: 1px solid #86efac; padding: 5px 10px; margin-bottom: 8px; font-weight: 600; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  table.items thead th { background: #f5f5f5; border-bottom: 1px solid #ccc; font-weight: 600; padding: 5px 6px; text-align: left; font-size: 8pt; text-transform: uppercase; color: #444; }
  table.items tbody td { padding: 4px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
  table.items .col-no { width: 22px; color: #888; }
  table.items .col-amount { width: 100px; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .type-badge { display: inline-block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.5px; padding: 0 5px; border-radius: 3px; margin-bottom: 1px; }
  .type-commission { background: #eef3ff; color: #1e40af; }
  .type-bonus { background: #f5edff; color: #6d28d9; }
  .type-other { background: #fff7ed; color: #9a3412; }
  .muted { color: #777; font-size: 8.5pt; }
  .totals { margin-left: auto; width: 280px; margin-bottom: 10px; }
  .totals .row { display: flex; justify-content: space-between; padding: 2px 0; }
  .totals .row.grand { border-top: 1px solid #999; margin-top: 4px; padding-top: 5px; font-weight: 700; font-size: 11pt; }
  .totals .row .v { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .totals .usd-box { border-top: 1px dashed #aaa; margin-top: 5px; padding-top: 4px; color: #555; font-size: 8.5pt; }
  .pay-block { border: 1px solid #ddd; padding: 8px 10px; border-radius: 4px; margin-bottom: 8px; background: #fafafa; }
  .pay-title { font-size: 8pt; text-transform: uppercase; color: #666; letter-spacing: 0.5px; margin-bottom: 3px; font-weight: 600; }
  .pay-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  .pay-table td { padding: 1px 0; vertical-align: top; }
  .pay-table td:first-child { width: 130px; color: #666; }
  .notes { border-top: 1px dashed #ccc; padding-top: 5px; font-size: 8.5pt; color: #444; white-space: pre-line; }
  .footer { margin-top: 12px; border-top: 1px solid #eee; padding-top: 4px; font-size: 7.5pt; color: #888; text-align: center; }
</style>
</head>
<body>

<div class="header">
  <div class="brand">
    ${logoBlock}
  </div>
  <div class="meta">
    <div class="title">${escapeHtml(title)}</div>
    <div class="num">${escapeHtml(L.number)} ${escapeHtml(number)}</div>
    <div class="muted">${escapeHtml(L.issueDate)}: ${fmtDate(invoice.issueDate, lang)}</div>
    ${invoice.dueDate ? `<div class="muted">${escapeHtml(L.dueDate)}: ${fmtDate(invoice.dueDate, lang)}</div>` : ""}
  </div>
</div>

${cancelledBanner}
${paidBanner}

<div class="parties">
  <div class="party">
    <h3>${escapeHtml(L.from)}</h3>
    <div class="name">${escapeHtml(invoice.ourCompany.name)}</div>
    <div class="info">
      ${invoice.ourCompany.address ? `<div class="row">${escapeHtml(invoice.ourCompany.address)}</div>` : ""}
      ${invoice.ourCompany.taxId ? `<div class="row">${escapeHtml(L.taxId)}: ${escapeHtml(invoice.ourCompany.taxId)}</div>` : ""}
      ${invoice.ourCompany.registrationNo ? `<div class="row">${escapeHtml(L.registrationNo)}: ${escapeHtml(invoice.ourCompany.registrationNo)}</div>` : ""}
      ${invoice.ourCompany.phone ? `<div class="row">${escapeHtml(L.phone)}: ${escapeHtml(invoice.ourCompany.phone)}</div>` : ""}
      ${invoice.ourCompany.email ? `<div class="row">${escapeHtml(L.email)}: ${escapeHtml(invoice.ourCompany.email)}</div>` : ""}
    </div>
  </div>
  <div class="party">
    <h3>${escapeHtml(L.billTo)}</h3>
    <div class="name">${escapeHtml(invoice.counterparty.name)}</div>
    <div class="info">
      ${invoice.counterparty.address ? `<div class="row">${escapeHtml(invoice.counterparty.address)}</div>` : ""}
      ${invoice.counterparty.taxId ? `<div class="row">${escapeHtml(L.taxId)}: ${escapeHtml(invoice.counterparty.taxId)}</div>` : ""}
      ${invoice.counterparty.phone ? `<div class="row">${escapeHtml(L.phone)}: ${escapeHtml(invoice.counterparty.phone)}</div>` : ""}
      ${invoice.counterparty.email ? `<div class="row">${escapeHtml(L.email)}: ${escapeHtml(invoice.counterparty.email)}</div>` : ""}
    </div>
  </div>
</div>

${
  isUsdTemplate
    ? `<table class="items">
  <thead>
    <tr>
      <th>#</th>
      <th>${escapeHtml(L.description)}</th>
      <th style="text-align:right">${escapeHtml(L.commission)} THB</th>
      <th style="text-align:right">${escapeHtml(L.commission)} USD</th>
    </tr>
  </thead>
  <tbody>
    ${itemsRows}
  </tbody>
</table>

<div class="totals">
  <div class="row"><span>${escapeHtml(L.subtotal)} (THB)</span><span class="v">${fmt(subtotalThb, lang)} THB</span></div>
  <div class="row"><span>${escapeHtml(L.subtotal)} (USD)</span><span class="v">${fmt(invoice.subtotal, lang)} USD</span></div>
  ${invoice.vatApplied ? `<div class="row"><span>${escapeHtml(L.vat)}${invoice.vatIncluded ? ` (${escapeHtml(L.vatIncluded)})` : ""} (USD)</span><span class="v">${fmt(invoice.vatAmount, lang)} USD</span></div>` : ""}
  ${invoice.whtApplied ? `<div class="row"><span>${escapeHtml(L.wht)} (USD)</span><span class="v">− ${fmt(invoice.whtAmount, lang)} USD</span></div>` : ""}
  <div class="row grand"><span>${escapeHtml(L.total)}</span><span class="v">${fmt(invoice.total, lang)} USD</span></div>
  <div class="usd-box">
    <div class="row"><span>${escapeHtml(L.total)} (THB, справочно)</span><span class="v">${fmt(totalThb, lang)} THB</span></div>
    ${rate > 0 ? `<div class="row"><span>${escapeHtml(L.exchangeRate)}</span><span class="v">1 USD = ${fmt(rate, lang)} THB</span></div>` : ""}
  </div>
</div>`
    : `<table class="items">
  <thead>
    <tr>
      <th>#</th>
      <th>${escapeHtml(L.description)}</th>
      <th style="text-align:right">${escapeHtml(L.amount)} ${escapeHtml(invoice.primaryCurrency)}</th>
    </tr>
  </thead>
  <tbody>
    ${itemsRows}
  </tbody>
</table>

<div class="totals">
  <div class="row"><span>${escapeHtml(L.subtotal)}</span><span class="v">${fmt(invoice.subtotal, lang)} ${escapeHtml(invoice.primaryCurrency)}</span></div>
  ${invoice.vatApplied ? `<div class="row"><span>${escapeHtml(L.vat)}${invoice.vatIncluded ? ` (${escapeHtml(L.vatIncluded)})` : ""}</span><span class="v">${fmt(invoice.vatAmount, lang)} ${escapeHtml(invoice.primaryCurrency)}</span></div>` : ""}
  ${invoice.whtApplied ? `<div class="row"><span>${escapeHtml(L.wht)}</span><span class="v">− ${fmt(invoice.whtAmount, lang)} ${escapeHtml(invoice.primaryCurrency)}</span></div>` : ""}
  <div class="row grand"><span>${escapeHtml(L.total)}</span><span class="v">${fmt(invoice.total, lang)} ${escapeHtml(invoice.primaryCurrency)}</span></div>
  ${
    invoice.showUsdEquivalent && invoice.totalUsd
      ? `<div class="usd-box">
            <div class="row"><span>${escapeHtml(L.totalUsdEquivalent)}</span><span class="v">${fmt(invoice.totalUsd, lang)} USD</span></div>
            ${invoice.exchangeRate ? `<div class="row"><span>${escapeHtml(L.exchangeRate)}</span><span class="v">${fmt(invoice.exchangeRate, lang)}</span></div>` : ""}
         </div>`
      : ""
  }
</div>`
}

${paymentSection}

${
  invoice.notesText
    ? `<div class="notes"><strong>${escapeHtml(L.notes)}:</strong><br/>${escapeHtml(invoice.notesText)}</div>`
    : ""
}

<div class="footer">IBG Invoice · ${escapeHtml(number)} · ${fmtDate(new Date(), lang)}</div>

</body>
</html>`;
}
