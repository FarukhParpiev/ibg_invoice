"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import {
  createDraftInvoice,
  updateDraftInvoice,
  type InvoiceFormValues,
} from "./actions";
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

const templateOptions: { value: InvoiceFormValues["template"]; label: string }[] = [
  { value: "ibg_thb", label: "IBG THB (residents)" },
  { value: "ib_group_thb", label: "IB Group THB" },
  { value: "ib_group_usd", label: "IB Group USD" },
  { value: "wise_thb", label: "Wise THB" },
  { value: "crypto", label: "Crypto" },
  { value: "ibg_kas", label: "IBG Kas (cash)" },
  { value: "others_thai", label: "Others Thai" },
];

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
  const { register, control, handleSubmit, formState, setValue, reset } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

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
            <select
              className="input"
              {...register("template", {
                onChange: (e) => {
                  if (e.target.value === "ib_group_usd") {
                    // For the USD template, primary is always USD; show-equivalent is not used
                    setValue("primaryCurrency", "USD", { shouldDirty: true });
                    setValue("showUsdEquivalent", false, {
                      shouldDirty: true,
                    });
                  }
                },
              })}
            >
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
            <Controller
              control={control}
              name="counterpartyId"
              render={({ field }) => (
                <CounterpartyCombobox
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  options={ctx.counterparties.filter((c) => c.isActive)}
                />
              )}
            />
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
