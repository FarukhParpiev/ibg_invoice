"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import {
  createDraftInvoice,
  updateDraftInvoice,
  type InvoiceFormValues,
} from "./actions";
import {
  createCounterpartyAdHoc,
  createCounterpartyQuick,
} from "../counterparties/actions";
import { calcTotals } from "@/lib/invoice-calc";

type Mode = { kind: "create" } | { kind: "edit"; id: string };

export type InvoiceFormCompany = {
  id: string;
  name: string;
  defaultCurrency: "THB" | "USD" | "EUR" | "RUB";
  bankAccounts: Array<{
    id: string;
    bankName: string;
    currency: "THB" | "USD" | "EUR" | "RUB";
    accountNumber: string;
    isDefault: boolean;
  }>;
};

export type InvoiceFormContext = {
  companies: InvoiceFormCompany[];
  counterparties: Array<{ id: string; name: string; isActive: boolean }>;
  paymentTerms: Array<{ id: string; code: string; label: string }>;
};

// "others_thai" was retired — covered by the "blank" manual template now.
const templateOptions: { value: InvoiceFormValues["template"]; label: string }[] = [
  { value: "ibg_thb", label: "IBG THB (residents)" },
  { value: "ib_group_thb", label: "IB Group THB" },
  { value: "ib_group_usd", label: "IB Group USD" },
  { value: "wise_thb", label: "Wise USD" },
  { value: "crypto", label: "Crypto (BEP20)" },
  { value: "ibg_kas", label: "IBG Kas (cash)" },
  { value: "blank", label: "Blank (manual)" },
];

// When the user picks a template, we auto-select our company, bank and invoice
// currency. Substring matching against company.name + bank.bankName means the
// preset survives small name tweaks in /admin/companies (e.g. renaming an
// account). Returns null for manual templates (others_thai, blank) and when
// no company/bank matches — the caller then leaves those fields alone.
type TemplatePreset = {
  companyId: string;
  bankId: string;
  currency: "THB" | "USD" | "EUR" | "RUB";
};

type TemplatePresetRule = {
  company?: RegExp;
  bank?: RegExp;
  currency?: "THB" | "USD" | "EUR" | "RUB";
};

const TEMPLATE_PRESET_RULES: Record<
  InvoiceFormValues["template"],
  TemplatePresetRule
> = {
  ibg_thb: {
    company: /IBG Property.*Head Office/i,
    bank: /(Siam Commercial|SCB)/i,
    currency: "THB",
  },
  ib_group_thb: {
    company: /IB GROUP INCORPORATED/i,
    bank: /Citibank/i,
    currency: "THB",
  },
  ib_group_usd: {
    company: /IB GROUP INCORPORATED/i,
    bank: /Citibank/i,
    currency: "USD",
  },
  wise_thb: {
    company: /IB Global Partners/i,
    bank: /Wise/i,
    currency: "USD",
  },
  crypto: {
    company: /IBG Property.*Head Office/i,
    bank: /Binance/i,
    currency: "USD",
  },
  ibg_kas: {
    company: /IBG Property.*Head Office/i,
    bank: /Kasikorn/i,
    currency: "THB",
  },
  // Manual: blank clears the preset fields so the user picks fresh.
  blank: {},
};

function findTemplatePreset(
  template: InvoiceFormValues["template"],
  companies: InvoiceFormCompany[],
): TemplatePreset | null {
  const rule = TEMPLATE_PRESET_RULES[template];
  if (!rule.company) return null;
  const company = companies.find((c) => rule.company!.test(c.name));
  if (!company) return null;
  // Prefer a bank whose name matches the template; fall back to the default
  // bank so the form stays valid even if the target bank hasn't been added yet.
  const bank =
    (rule.bank && company.bankAccounts.find((b) => rule.bank!.test(b.bankName))) ||
    company.bankAccounts.find((b) => b.isDefault) ||
    company.bankAccounts[0];
  if (!bank) return null;
  return {
    companyId: company.id,
    bankId: bank.id,
    currency: rule.currency ?? company.defaultCurrency,
  };
}

// Due date = issue date + this many days by default. Hardcoded, no per-terms
// override — users almost always use the same +5 window, and when they don't
// they just edit the field manually (which marks the field "dirty" and stops
// auto-updates from issueDate).
const DEFAULT_DUE_DATE_OFFSET_DAYS = 5;

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const todayIso = new Date().toISOString().slice(0, 10);

const emptyDefaults: InvoiceFormValues = {
  template: "ibg_thb",
  ourCompanyId: "",
  ourBankAccountId: "",
  counterpartyId: "",
  paymentTermsId: "",
  primaryCurrency: "THB",
  showUsdEquivalent: false,
  exchangeRate: null,
  issueDate: todayIso,
  dueDate: addDaysIso(todayIso, DEFAULT_DUE_DATE_OFFSET_DAYS),
  otherDate: "",
  vatApplied: false,
  vatIncluded: false,
  whtApplied: false,
  notesText: "",
  numberOverride: "",
  items: [
    {
      itemType: "commission",
      projectName: "",
      unitCode: "",
      sellingPrice: 0,
      sellingPriceCorrection: 0,
      commissionPercent: 3,
      commissionCorrection: 0,
      note: "",
    },
  ],
};

export function InvoiceForm({
  mode,
  defaults,
  ctx,
}: {
  mode: Mode;
  defaults?: InvoiceFormValues;
  ctx: InvoiceFormContext;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);

  const form = useForm<InvoiceFormValues>({
    defaultValues: defaults ?? emptyDefaults,
  });
  const { register, control, handleSubmit, formState, setValue } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  // Local, mutable list of counterparties: seeded from SSR, grows when the
  // user quick-adds a new one without leaving the invoice form.
  const [counterpartyOptions, setCounterpartyOptions] = useState(
    ctx.counterparties,
  );
  const [cpModal, setCpModal] = useState<
    { open: false } | { open: true; mode: "full" | "adHoc" }
  >({ open: false });

  // Live values used to recompute totals
  const watchedItems = useWatch({ control, name: "items" });
  const vatApplied = useWatch({ control, name: "vatApplied" });
  const vatIncluded = useWatch({ control, name: "vatIncluded" });
  const whtApplied = useWatch({ control, name: "whtApplied" });
  const exchangeRate = useWatch({ control, name: "exchangeRate" });
  const showUsdEquivalent = useWatch({ control, name: "showUsdEquivalent" });
  const primaryCurrency = useWatch({ control, name: "primaryCurrency" });
  const ourCompanyId = useWatch({ control, name: "ourCompanyId" });
  const template = useWatch({ control, name: "template" });
  const issueDate = useWatch({ control, name: "issueDate" });

  // Due date = issueDate + 5 days, but only until the user touches the field
  // manually. Once they change it, we stop auto-syncing, so we don't clobber
  // an explicit override every time they adjust the issue date.
  const [dueDateDirty, setDueDateDirty] = useState<boolean>(
    () => !!defaults?.dueDate,
  );
  useEffect(() => {
    if (dueDateDirty) return;
    if (!issueDate) return;
    const next = addDaysIso(issueDate, DEFAULT_DUE_DATE_OFFSET_DAYS);
    if (next) setValue("dueDate", next, { shouldDirty: true });
  }, [issueDate, dueDateDirty, setValue]);

  // Template preset runs via an effect rather than register's onChange so it
  // fires reliably in both create and edit modes (register.onChange sometimes
  // misses the first native change event right after SSR hydration, which
  // left wise/crypto/ib_group_thb stuck on the default company). On mount we
  // skip the effect — the initial defaults are already consistent (edit mode)
  // or empty (create mode) and we don't want to clobber either.
  const templateInitRef = useRef(true);
  useEffect(() => {
    if (templateInitRef.current) {
      templateInitRef.current = false;
      return;
    }
    const preset = findTemplatePreset(template, ctx.companies);
    if (preset) {
      // Auto-select our company, bank and currency so the user doesn't have
      // to pick them again every time they switch templates.
      setValue("ourCompanyId", preset.companyId, { shouldDirty: true });
      setValue("ourBankAccountId", preset.bankId, { shouldDirty: true });
      setValue("primaryCurrency", preset.currency, { shouldDirty: true });
    } else if (template === "blank") {
      // Blank template == "start over" — wipe the three fields so nothing
      // leaks through from the previously selected template.
      setValue("ourCompanyId", "", { shouldDirty: true });
      setValue("ourBankAccountId", "", { shouldDirty: true });
      setValue("primaryCurrency", "THB", { shouldDirty: true });
    }
    // The USD-conversion template runs its own USD-equivalent math on the
    // PDF — suppress the "Show USD equivalent" checkbox to avoid doubling up.
    if (template === "ib_group_usd") {
      setValue("showUsdEquivalent", false, { shouldDirty: true });
    }
  }, [template, ctx.companies, setValue]);

  // For the IB Group USD template, input is in THB, amount is computed in
  // USD via the rate. Dedicated mode in the form and in the PDF.
  const isUsdTemplate = template === "ib_group_usd";

  const totals = useMemo(() => {
    return calcTotals({
      items: (watchedItems ?? []).map((it) => {
        if (it.itemType === "commission") {
          return {
            itemType: "commission" as const,
            sellingPrice: Number(it.sellingPrice) || 0,
            sellingPriceCorrection: Number(it.sellingPriceCorrection) || 0,
            commissionPercent: Number(it.commissionPercent) || 0,
            commissionCorrection: Number(it.commissionCorrection) || 0,
          };
        }
        if (it.itemType === "bonus") {
          return {
            itemType: "bonus" as const,
            bonusAmount: Number(it.bonusAmount) || 0,
          };
        }
        return {
          itemType: "other" as const,
          otherAmount: Number(it.otherAmount) || 0,
        };
      }),
      vatApplied: !!vatApplied,
      vatIncluded: !!vatIncluded,
      whtApplied: !!whtApplied,
      exchangeRate: exchangeRate ? Number(exchangeRate) : null,
      showUsdEquivalent: !!showUsdEquivalent,
      convertThbToUsd: isUsdTemplate,
    });
  }, [
    watchedItems,
    vatApplied,
    vatIncluded,
    whtApplied,
    exchangeRate,
    showUsdEquivalent,
    isUsdTemplate,
  ]);

  const currentCompany = ctx.companies.find((c) => c.id === ourCompanyId);
  const availableBanks = currentCompany?.bankAccounts ?? [];

  const onSubmit = (values: InvoiceFormValues) => {
    setMessage(null);
    startTransition(async () => {
      const res =
        mode.kind === "create"
          ? await createDraftInvoice(values)
          : await updateDraftInvoice(mode.id, values);

      if (res.ok) {
        // Both create and edit land on the detail page — from there the user
        // can Issue, generate the PDF, preview, etc. without a detour through
        // the list.
        router.push(`/admin/invoices/${res.id}`);
      } else {
        setMessage({ kind: "error", text: res.error });
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6"
    >
      {/* ───── Details ───── */}
      <section className="border rounded-lg p-5 bg-white space-y-4">
        <h2 className="font-medium">Details</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="PDF template">
            {/* Preset logic lives in a useEffect above — see the comment
                there for why it's not inside register's onChange. */}
            <select className="input" {...register("template")}>
              {templateOptions.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Payment method">
            <select className="input" {...register("paymentTermsId")}>
              <option value="">— not specified —</option>
              {ctx.paymentTerms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Our company" error={formState.errors.ourCompanyId?.message} wide>
            <select
              className="input"
              {...register("ourCompanyId", {
                onChange: (e) => {
                  const company = ctx.companies.find(
                    (c) => c.id === e.target.value,
                  );
                  const defBank =
                    company?.bankAccounts.find((b) => b.isDefault) ??
                    company?.bankAccounts[0];
                  setValue("ourBankAccountId", defBank?.id ?? "", {
                    shouldDirty: true,
                  });
                  if (company) {
                    setValue("primaryCurrency", company.defaultCurrency, {
                      shouldDirty: true,
                    });
                  }
                },
              })}
            >
              <option value="">— select —</option>
              {ctx.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Our bank account" error={formState.errors.ourBankAccountId?.message} wide>
            <select
              className="input"
              disabled={!currentCompany}
              {...register("ourBankAccountId")}
            >
              <option value="">— select —</option>
              {availableBanks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bankName} · {b.currency} · {b.accountNumber}
                  {b.isDefault ? " (default)" : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Counterparty" error={formState.errors.counterpartyId?.message} wide>
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <Controller
                  control={control}
                  name="counterpartyId"
                  render={({ field }) => (
                    <CounterpartyCombobox
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      options={counterpartyOptions.filter((c) => c.isActive)}
                    />
                  )}
                />
              </div>
              {/* Quick-add buttons — keep the user on the page when they spot a
                  missing counterparty mid-form. "New" creates a regular entry;
                  "Ad-hoc" is for one-off deposit names ("Miss Larisa") that
                  shouldn't bloat the main directory. */}
              <button
                type="button"
                onClick={() => setCpModal({ open: true, mode: "full" })}
                className="text-sm border rounded px-3 py-2 hover:bg-zinc-50 whitespace-nowrap"
              >
                + New
              </button>
              <button
                type="button"
                onClick={() => setCpModal({ open: true, mode: "adHoc" })}
                className="text-sm border rounded px-3 py-2 hover:bg-zinc-50 whitespace-nowrap"
                title="One-off — won't appear in the main counterparty list"
              >
                + Ad-hoc
              </button>
            </div>
          </Field>
        </div>
      </section>

      {/* ───── Dates and currency ───── */}
      <section className="border rounded-lg p-5 bg-white space-y-4">
        <h2 className="font-medium">Dates and currency</h2>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Issue date" error={formState.errors.issueDate?.message}>
            <input type="date" className="input" {...register("issueDate")} />
          </Field>
          <Field label="Due date">
            <input
              type="date"
              className="input"
              {...register("dueDate", {
                onChange: () => setDueDateDirty(true),
              })}
            />
          </Field>

          <Field label="Primary currency">
            <select
              className="input"
              disabled={isUsdTemplate}
              {...register("primaryCurrency")}
            >
              <option value="THB">THB</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="RUB">RUB</option>
            </select>
          </Field>

          {isUsdTemplate ? (
            <div className="col-span-2 flex items-center gap-3 pt-5 text-sm">
              <span className="text-zinc-700 font-medium">
                THB → USD rate:
              </span>
              <input
                type="number"
                step="0.0001"
                placeholder="e.g. 34.5"
                className="input w-36"
                {...register("exchangeRate", { valueAsNumber: true })}
              />
              <span className="text-xs text-zinc-500">
                Commission (USD) = Commission (THB) / Rate. Locked in on
                Issue.
              </span>
            </div>
          ) : (
            <div className="col-span-2 flex items-center gap-4 pt-5">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...register("showUsdEquivalent")} />
                <span>Show USD equivalent</span>
              </label>
              {showUsdEquivalent && primaryCurrency !== "USD" && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-600">Rate (THB per 1 USD):</span>
                  <input
                    type="number"
                    step="0.0001"
                    className="input w-32"
                    {...register("exchangeRate", { valueAsNumber: true })}
                  />
                </div>
              )}
            </div>
          )}

          <div className="col-span-1 space-y-1">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register("vatApplied")} />
              <span>VAT 7%</span>
            </label>
            {vatApplied && (
              <label className="flex items-center gap-2 text-xs text-zinc-600 ml-5">
                <input type="checkbox" {...register("vatIncluded")} />
                <span>VAT already included in the commission amount</span>
              </label>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm col-span-1">
            <input type="checkbox" {...register("whtApplied")} />
            <span>WHT 3% (deducted)</span>
          </label>
        </div>
      </section>

      {/* ───── Line items ───── */}
      <section className="border rounded-lg p-5 bg-white space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Line items</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                append({
                  itemType: "commission",
                  projectName: "",
                  unitCode: "",
                  sellingPrice: 0,
                  sellingPriceCorrection: 0,
                  commissionPercent: 3,
                  commissionCorrection: 0,
                  note: "",
                })
              }
              className="text-sm border rounded px-3 py-1.5 hover:bg-zinc-50"
            >
              + Commission
            </button>
            <button
              type="button"
              onClick={() =>
                append({
                  itemType: "bonus",
                  projectName: "",
                  unitCode: "",
                  bonusAmount: 0,
                  note: "",
                })
              }
              className="text-sm border rounded px-3 py-1.5 hover:bg-zinc-50"
            >
              + Bonus
            </button>
            <button
              type="button"
              onClick={() =>
                append({
                  itemType: "other",
                  projectName: "",
                  unitCode: "",
                  otherAmount: 0,
                  note: "",
                })
              }
              className="text-sm border rounded px-3 py-1.5 hover:bg-zinc-50"
            >
              + Other
            </button>
          </div>
        </div>

        {formState.errors.items?.message && (
          <div className="text-red-600 text-sm">
            {formState.errors.items.message}
          </div>
        )}

        <div className="space-y-3">
          {fields.map((f, idx) => {
            const itemType = watchedItems?.[idx]?.itemType ?? "commission";
            return (
              <div
                key={f.id}
                className="border rounded p-3 space-y-3 bg-zinc-50/50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase text-zinc-500">
                    Line {idx + 1} · {itemType}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    disabled={fields.length === 1}
                    className="text-xs text-red-600 hover:text-red-800 disabled:opacity-30"
                  >
                    Remove
                  </button>
                </div>

                <input
                  type="hidden"
                  {...register(`items.${idx}.itemType` as const)}
                />

                <div className="grid grid-cols-4 gap-3">
                  <Field label={itemType === "other" ? "Name (what is being paid for)" : "Project"}>
                    <input
                      className="input"
                      {...register(`items.${idx}.projectName` as const)}
                    />
                  </Field>
                  {itemType !== "other" && (
                    <Field label="Unit / code">
                      <input
                        className="input"
                        {...register(`items.${idx}.unitCode` as const)}
                      />
                    </Field>
                  )}

                  {itemType === "commission" ? (
                    <>
                      <Field
                        label={
                          isUsdTemplate ? "Selling price (THB)" : "Selling price"
                        }
                      >
                        <input
                          type="number"
                          step="0.01"
                          className="input"
                          {...register(`items.${idx}.sellingPrice` as const, {
                            valueAsNumber: true,
                          })}
                        />
                      </Field>
                      <Field
                        label={
                          isUsdTemplate
                            ? "Correction (THB)"
                            : "Correction (sp)"
                        }
                      >
                        <input
                          type="number"
                          step="0.01"
                          className="input"
                          {...register(
                            `items.${idx}.sellingPriceCorrection` as const,
                            { valueAsNumber: true },
                          )}
                        />
                      </Field>
                      <Field label="Commission %">
                        <input
                          type="number"
                          step="0.001"
                          className="input"
                          {...register(
                            `items.${idx}.commissionPercent` as const,
                            { valueAsNumber: true },
                          )}
                        />
                      </Field>
                      <Field
                        label={
                          isUsdTemplate
                            ? "Correction comm. (THB)"
                            : "Correction (comm)"
                        }
                      >
                        <input
                          type="number"
                          step="0.01"
                          className="input"
                          {...register(
                            `items.${idx}.commissionCorrection` as const,
                            { valueAsNumber: true },
                          )}
                        />
                      </Field>
                    </>
                  ) : itemType === "bonus" ? (
                    <Field
                      label={isUsdTemplate ? "Bonus amount (THB)" : "Bonus amount"}
                      wide
                    >
                      <input
                        type="number"
                        step="0.01"
                        className="input"
                        {...register(`items.${idx}.bonusAmount` as const, {
                          valueAsNumber: true,
                        })}
                      />
                    </Field>
                  ) : (
                    <Field
                      label={isUsdTemplate ? "Amount (THB)" : "Amount"}
                      wide
                    >
                      <input
                        type="number"
                        step="0.01"
                        className="input"
                        {...register(`items.${idx}.otherAmount` as const, {
                          valueAsNumber: true,
                        })}
                      />
                    </Field>
                  )}

                  <Field label="Comment" wide>
                    <input
                      className="input"
                      {...register(`items.${idx}.note` as const)}
                    />
                  </Field>
                </div>

                <LineTotal
                  idx={idx}
                  form={form}
                  isUsdTemplate={isUsdTemplate}
                  rate={exchangeRate ? Number(exchangeRate) : 0}
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* ───── Totals ───── */}
      <section className="border rounded-lg p-5 bg-zinc-50 space-y-2 text-sm tabular-nums">
        <Row
          label="Subtotal"
          value={totals.subtotal}
          currency={primaryCurrency}
        />
        {vatApplied && (
          <Row
            label={vatIncluded ? "VAT 7% (included in amount)" : "VAT 7%"}
            value={totals.vatAmount}
            currency={primaryCurrency}
          />
        )}
        {whtApplied && (
          <Row
            label="WHT 3% (deducted)"
            value={-totals.whtAmount}
            currency={primaryCurrency}
          />
        )}
        <div className="border-t pt-2 mt-2">
          <Row
            label="Total"
            value={totals.total}
            currency={primaryCurrency}
            bold
          />
        </div>

        {/* USD template: THB reference + rate */}
        {isUsdTemplate && totals.totalThb != null && (
          <div className="pt-2 border-t text-zinc-600 space-y-1">
            <Row
              label="Subtotal (THB, reference)"
              value={totals.subtotalThb ?? 0}
              currency="THB"
            />
            <Row
              label="Total (THB, reference)"
              value={totals.totalThb}
              currency="THB"
            />
            {exchangeRate ? (
              <div className="text-xs text-zinc-500 text-right pt-1">
                Rate: 1 USD = {Number(exchangeRate).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 4,
                })}{" "}
                THB
              </div>
            ) : (
              <div className="text-xs text-red-600 text-right pt-1">
                Rate is not set — USD amounts are not calculated
              </div>
            )}
          </div>
        )}

        {/* Regular mode: USD equivalent */}
        {!isUsdTemplate && showUsdEquivalent && totals.totalUsd != null && (
          <div className="pt-2 text-zinc-600">
            <Row
              label="Total USD (equivalent)"
              value={totals.totalUsd}
              currency="USD"
            />
          </div>
        )}
      </section>

      {/* ───── Advanced (rarely used) ───── */}
      <section className="border rounded-lg p-5 bg-white space-y-3">
        <details>
          <summary className="text-sm text-zinc-600 cursor-pointer select-none hover:text-zinc-900">
            Advanced: override invoice number
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <Field
              label="Full invoice number (optional)"
              error={formState.errors.numberOverride?.message as string | undefined}
            >
              {/* Free-form text so the user can paste any format they need
                  — e.g. legacy "23/04/2026-0001" when migrating from an
                  external system. The unique index on Invoice.number still
                  guards against collisions at issuance time. */}
              <input
                type="text"
                className="input"
                placeholder="e.g. 23/04/2026-0001"
                {...register("numberOverride")}
              />
            </Field>
            <div className="self-end text-xs text-zinc-500 pb-2">
              Used verbatim when this draft is issued. Leave blank to use the
              default DD/MM/YYYY-NNNN format — next invoices keep auto-
              incrementing regardless.
            </div>
          </div>
        </details>
      </section>

      {/* ───── Notes ───── */}
      <section className="border rounded-lg p-5 bg-white">
        <Field label="Notes (will be shown on the PDF)" wide>
          <textarea
            rows={3}
            className="input resize-y"
            {...register("notesText")}
          />
        </Field>
      </section>

      {message && (
        <div
          className={`text-sm rounded px-3 py-2 ${
            message.kind === "ok"
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="bg-black text-white rounded px-5 py-2.5 hover:bg-zinc-800 disabled:opacity-40"
        >
          {isPending
            ? "Saving…"
            : mode.kind === "create"
              ? "Create draft"
              : "Save"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded px-5 py-2.5 border hover:bg-zinc-50"
        >
          Cancel
        </button>
      </div>

      <style>{`
        .input {
          border: 1px solid rgb(228 228 231);
          border-radius: 6px;
          padding: 8px 10px;
          font-size: 14px;
          width: 100%;
          background: white;
        }
        .input:focus { outline: 2px solid rgba(0,0,0,0.15); outline-offset: 0; }
      `}</style>

      {cpModal.open && (
        <QuickAddCounterpartyModal
          mode={cpModal.mode}
          onClose={() => setCpModal({ open: false })}
          onCreated={(cp) => {
            // Extend the local options and snap the combobox onto the new entry.
            setCounterpartyOptions((prev) => [
              ...prev,
              { id: cp.id, name: cp.name, isActive: true },
            ]);
            setValue("counterpartyId", cp.id, { shouldDirty: true });
            setCpModal({ open: false });
          }}
        />
      )}
    </form>
  );
}

function Field({
  label,
  error,
  wide,
  children,
}: {
  label: string;
  error?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${wide ? "col-span-2" : ""}`}>
      <span className="text-zinc-700">{label}</span>
      {children}
      {error && <span className="text-red-600 text-xs">{error}</span>}
    </label>
  );
}

function Row({
  label,
  value,
  currency,
  bold,
}: {
  label: string;
  value: number;
  currency: string;
  bold?: boolean;
}) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold text-base" : ""}`}>
      <span>{label}</span>
      <span>
        {value.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}{" "}
        <span className="text-zinc-500 text-xs">{currency}</span>
      </span>
    </div>
  );
}

function LineTotal({
  idx,
  form,
  isUsdTemplate,
  rate,
}: {
  idx: number;
  form: ReturnType<typeof useForm<InvoiceFormValues>>;
  isUsdTemplate: boolean;
  rate: number;
}) {
  const item = useWatch({ control: form.control, name: `items.${idx}` });
  const amountThb = useMemo(() => {
    if (!item) return 0;
    if (item.itemType === "commission") {
      const sp = (Number(item.sellingPrice) || 0) + (Number(item.sellingPriceCorrection) || 0);
      return sp * ((Number(item.commissionPercent) || 0) / 100) + (Number(item.commissionCorrection) || 0);
    }
    if (item.itemType === "bonus") {
      return Number(item.bonusAmount) || 0;
    }
    return Number(item.otherAmount) || 0;
  }, [item]);

  const fmt = (n: number) =>
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  if (isUsdTemplate) {
    const usd = rate > 0 ? amountThb / rate : 0;
    return (
      <div className="text-right text-sm tabular-nums space-y-0.5">
        <div>
          <span className="text-zinc-500">Commission (THB): </span>
          <span className="font-medium">{fmt(amountThb)}</span>
        </div>
        <div>
          <span className="text-zinc-500">Commission (USD): </span>
          <span className="font-medium">
            {rate > 0 ? fmt(usd) : "— set a rate"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="text-right text-sm tabular-nums">
      <span className="text-zinc-500">Line total: </span>
      <span className="font-medium">{fmt(amountThb)}</span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Counterparty combobox: type-ahead search over 121+ records.
// Substring filter, case-insensitive; works across Latin, Thai, and Cyrillic
// (we have Miss ... / บริษัท ... / IP ...).
// Client-side (ctx.counterparties is already loaded into the form from SSR) —
// does not hit an API.
//
// value — UUID of the selected counterparty (or ""). onChange(id) emits out.
// ───────────────────────────────────────────────────────────────────────────
type CounterpartyOption = { id: string; name: string };

function CounterpartyCombobox({
  value,
  onChange,
  onBlur,
  options,
}: {
  value: string;
  onChange: (id: string) => void;
  onBlur?: () => void;
  options: CounterpartyOption[];
}) {
  const selected = useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value],
  );

  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // If the external value changes (edit mode, form reset) — sync the input
  useEffect(() => {
    setQuery(selected?.name ?? "");
  }, [selected]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [query, options]);

  // Show at most 50 — if the list is huge, the user should narrow the query
  const visible = filtered.slice(0, 50);

  const commit = (opt: CounterpartyOption) => {
    onChange(opt.id);
    setQuery(opt.name);
    setOpen(false);
  };

  const clear = () => {
    onChange("");
    setQuery("");
    setOpen(true);
    setHighlight(0);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className="input"
        placeholder="Start typing a counterparty name…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
          // If the user cleared the name — drop the binding
          if (e.target.value === "") onChange("");
          else if (selected && e.target.value !== selected.name) onChange("");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // If the field has text that does not match any counterparty,
          // roll back to the last valid selection (or empty).
          // Give a mousedown on a list item time to fire.
          setTimeout(() => {
            setOpen(false);
            setQuery(selected?.name ?? "");
            onBlur?.();
          }, 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHighlight((i) => Math.min(i + 1, visible.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            if (open && visible[highlight]) {
              e.preventDefault();
              commit(visible[highlight]);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery(selected?.name ?? "");
          }
        }}
      />
      {selected && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 text-sm"
        >
          ×
        </button>
      )}

      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border rounded shadow-md text-sm max-h-72 overflow-auto">
          {visible.length === 0 ? (
            <div className="px-3 py-2 text-zinc-500">Nothing found</div>
          ) : (
            <ul role="listbox">
              {visible.map((o, i) => (
                <li
                  key={o.id}
                  role="option"
                  aria-selected={i === highlight}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(o);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`px-3 py-1.5 cursor-pointer ${
                    i === highlight ? "bg-zinc-100" : ""
                  }`}
                >
                  {o.name}
                </li>
              ))}
              {filtered.length > visible.length && (
                <li className="px-3 py-1.5 text-zinc-400 text-xs border-t">
                  {filtered.length - visible.length} more — refine the query
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Quick-add modal for counterparties. Two flavours:
//   "full"  → regular counterparty, appears in /admin/counterparties
//   "adHoc" → one-off, excluded from the main directory (e.g. "Miss Larisa")
// Minimal fields (name + language) — anything else can be filled in later on
// the dedicated edit page. Returns the new counterparty to the parent, which
// decides how to wire it into the form state.
// ───────────────────────────────────────────────────────────────────────────

function QuickAddCounterpartyModal({
  mode,
  onClose,
  onCreated,
}: {
  mode: "full" | "adHoc";
  onClose: () => void;
  onCreated: (cp: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [address, setAddress] = useState("");
  const [language, setLanguage] = useState<"en" | "th">("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const save = async () => {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    setBusy(true);
    const action =
      mode === "adHoc" ? createCounterpartyAdHoc : createCounterpartyQuick;
    const res = await action({
      name: trimmed,
      taxId: taxId.trim(),
      address: address.trim(),
      preferredLanguage: language,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onCreated({ id: res.id, name: res.name });
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        // Click outside the panel closes the modal.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md p-5 space-y-4"
        // Enter-to-submit is intentionally NOT bound here because the address
        // field is a multi-line textarea — pressing Enter inside it should add
        // a new line, not submit the modal. Esc still closes.
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-lg">
              {mode === "adHoc" ? "New ad-hoc counterparty" : "New counterparty"}
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {mode === "adHoc"
                ? "One-off — won't show up in the main counterparty list."
                : "Key fields for the PDF — edit the rest later if needed."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-400 hover:text-zinc-700 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-700">Name</span>
          <input
            ref={inputRef}
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              mode === "adHoc"
                ? 'e.g. "Miss Larisa (deposit)"'
                : "Full legal name"
            }
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-700">Tax ID (optional)</span>
          <input
            className="input"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            placeholder="e.g. 0105561000000"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-700">Address (optional)</span>
          <textarea
            rows={2}
            className="input resize-y"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, city, postal code, country"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-700">Preferred language</span>
          <select
            className="input"
            value={language}
            onChange={(e) => setLanguage(e.target.value as "en" | "th")}
          >
            <option value="en">English</option>
            <option value="th">Thai</option>
          </select>
        </label>

        {error && (
          <div className="text-sm rounded bg-red-50 text-red-700 px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="border rounded px-4 py-2 text-sm hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
