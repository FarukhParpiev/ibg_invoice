// HTML-шаблон для PDF инвойса.
// Одна универсальная вёрстка, которая адаптируется под поле Invoice.template:
// - ibg_kas            → скрывает банковские реквизиты (наличные)
// - crypto             → заголовок "Crypto payment" вместо банка
// - остальные          → полноценный блок с банковскими реквизитами
//
// Язык берётся из counterparty.preferredLanguage.

import type {
  BankAccount,
  Company,
  Counterparty,
  Invoice,
  InvoiceItem,
  PaymentTerms,
} from "@prisma/client";
import { t, type PdfLang } from "./i18n";

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

export function renderInvoiceHtml(invoice: InvoicePdfData): string {
  const lang = invoice.counterparty.preferredLanguage as PdfLang;
  const L = t(lang);

  const isReceipt = invoice.type === "receipt";
  const isCash = invoice.template === "ibg_kas";
  const isCrypto = invoice.template === "crypto";

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
      const typeLabel = it.itemType === "commission" ? L.commission : L.bonus;
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

  const paymentSection = isCash
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

  const logoBlock = invoice.ourCompany.logoUrl
    ? `<img src="${escapeHtml(invoice.ourCompany.logoUrl)}" alt="logo" class="logo"/>`
    : `<div class="logo-placeholder">${escapeHtml(invoice.ourCompany.name)}</div>`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(title)} ${escapeHtml(number)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; font-family: ${lang === "th" ? "'Sarabun', 'Noto Sans Thai', sans-serif" : "-apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"}; font-size: 10pt; color: #111; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${titleColor}; padding-bottom: 10px; margin-bottom: 18px; }
  .header .title { font-size: 22pt; font-weight: 700; letter-spacing: 2px; color: ${titleColor}; }
  .header .meta { text-align: right; font-size: 10pt; }
  .header .meta .num { font-size: 13pt; font-weight: 600; margin-top: 4px; font-family: 'Courier New', monospace; }
  .logo { max-height: 48px; max-width: 180px; }
  .logo-placeholder { font-size: 14pt; font-weight: 600; border: 1px dashed #aaa; padding: 6px 12px; color: #777; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-bottom: 20px; }
  .party h3 { margin: 0 0 4px 0; font-size: 9pt; text-transform: uppercase; color: #666; letter-spacing: 0.6px; font-weight: 500; }
  .party .name { font-weight: 600; font-size: 11pt; margin-bottom: 4px; }
  .party .info { color: #333; white-space: pre-line; line-height: 1.5; }
  .party .info .row { color: #555; }
  .cancel-banner { background: #fee; color: #a11; border: 1px solid #faa; padding: 10px 14px; margin-bottom: 16px; font-weight: 600; text-align: center; }
  .paid-banner { background: #ecfdf5; color: #047857; border: 1px solid #86efac; padding: 8px 14px; margin-bottom: 16px; font-weight: 600; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  table.items thead th { background: #f5f5f5; border-bottom: 1px solid #ccc; font-weight: 600; padding: 7px 8px; text-align: left; font-size: 9pt; text-transform: uppercase; color: #444; }
  table.items tbody td { padding: 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  table.items .col-no { width: 28px; color: #888; }
  table.items .col-amount { width: 110px; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .type-badge { display: inline-block; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; padding: 1px 6px; border-radius: 3px; margin-bottom: 2px; }
  .type-commission { background: #eef3ff; color: #1e40af; }
  .type-bonus { background: #f5edff; color: #6d28d9; }
  .muted { color: #777; font-size: 9pt; }
  .totals { margin-left: auto; width: 300px; margin-bottom: 22px; }
  .totals .row { display: flex; justify-content: space-between; padding: 3px 0; }
  .totals .row.grand { border-top: 1px solid #999; margin-top: 6px; padding-top: 8px; font-weight: 700; font-size: 12pt; }
  .totals .row .v { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .totals .usd-box { border-top: 1px dashed #aaa; margin-top: 10px; padding-top: 8px; color: #555; font-size: 9pt; }
  .pay-block { border: 1px solid #ddd; padding: 12px 14px; border-radius: 4px; margin-bottom: 18px; background: #fafafa; }
  .pay-title { font-size: 9pt; text-transform: uppercase; color: #666; letter-spacing: 0.5px; margin-bottom: 6px; font-weight: 600; }
  .pay-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  .pay-table td { padding: 2px 0; vertical-align: top; }
  .pay-table td:first-child { width: 140px; color: #666; }
  .notes { border-top: 1px dashed #ccc; padding-top: 10px; font-size: 9pt; color: #444; white-space: pre-line; }
  .footer { margin-top: 30px; border-top: 1px solid #eee; padding-top: 8px; font-size: 8pt; color: #888; text-align: center; }
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

<table class="items">
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
  ${invoice.vatApplied ? `<div class="row"><span>${escapeHtml(L.vat)}</span><span class="v">${fmt(invoice.vatAmount, lang)} ${escapeHtml(invoice.primaryCurrency)}</span></div>` : ""}
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
</div>

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
