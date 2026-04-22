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
  { value: "ibg_thb", label: "IBG THB (резиденты)" },
  { value: "ib_group_thb", label: "IB Group THB" },
  { value: "ib_group_usd", label: "IB Group USD" },
  { value: "wise_thb", label: "Wise THB" },
  { value: "crypto", label: "Crypto" },
  { value: "ibg_kas", label: "IBG Kas (наличные)" },
  { value: "others_thai", label: "Others Thai" },
];

const emptyDefaults: InvoiceFormValues = {
  template: "ibg_thb",
  ourCompanyId: "",
  ourBankAccountId: "",
  counterpartyId: "",
  paymentTermsId: "",
  primaryCurrency: "THB",
  showUsdEquivalent: false,
  exchangeRate: null,
  issueDate: new Date().toISOString().slice(0, 10),
  dueDate: "",
  otherDate: "",
  vatApplied: false,
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

  // Live-значения для пересчёта итогов
  const watchedItems = useWatch({ control, name: "items" });
  const vatApplied = useWatch({ control, name: "vatApplied" });
  const whtApplied = useWatch({ control, name: "whtApplied" });
  const exchangeRate = useWatch({ control, name: "exchangeRate" });
  const showUsdEquivalent = useWatch({ control, name: "showUsdEquivalent" });
  const primaryCurrency = useWatch({ control, name: "primaryCurrency" });
  const ourCompanyId = useWatch({ control, name: "ourCompanyId" });
  const template = useWatch({ control, name: "template" });

  // Для шаблона IB Group USD ввод идёт в THB, amount считается в USD
  // через курс. Отдельный режим в форме и в PDF.
  const isUsdTemplate = template === "ib_group_usd";

  const totals = useMemo(() => {
    return calcTotals({
      items: (watchedItems ?? []).map((it) =>
        it.itemType === "commission"
          ? {
              itemType: "commission",
              sellingPrice: Number(it.sellingPrice) || 0,
              sellingPriceCorrection: Number(it.sellingPriceCorrection) || 0,
              commissionPercent: Number(it.commissionPercent) || 0,
              commissionCorrection: Number(it.commissionCorrection) || 0,
            }
          : { itemType: "bonus", bonusAmount: Number(it.bonusAmount) || 0 },
      ),
      vatApplied: !!vatApplied,
      whtApplied: !!whtApplied,
      exchangeRate: exchangeRate ? Number(exchangeRate) : null,
      showUsdEquivalent: !!showUsdEquivalent,
      convertThbToUsd: isUsdTemplate,
    });
  }, [
    watchedItems,
    vatApplied,
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
        if (mode.kind === "create") {
          router.push(`/admin/invoices/${res.id}`);
        } else {
          setMessage({ kind: "ok", text: "Сохранено" });
          reset(values);
        }
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
      {/* ───── Реквизиты ───── */}
      <section className="border rounded-lg p-5 bg-white space-y-4">
        <h2 className="font-medium">Реквизиты</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Шаблон PDF">
            <select
              className="input"
              {...register("template", {
                onChange: (e) => {
                  if (e.target.value === "ib_group_usd") {
                    // Для USD-шаблона primary всегда USD, show/equivalent не используется
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

          <Field label="Способ оплаты">
            <select className="input" {...register("paymentTermsId")}>
              <option value="">— не указано —</option>
              {ctx.paymentTerms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Наша компания" error={formState.errors.ourCompanyId?.message} wide>
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
              <option value="">— выберите —</option>
              {ctx.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Наш банковский счёт" error={formState.errors.ourBankAccountId?.message} wide>
            <select
              className="input"
              disabled={!currentCompany}
              {...register("ourBankAccountId")}
            >
              <option value="">— выберите —</option>
              {availableBanks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bankName} · {b.currency} · {b.accountNumber}
                  {b.isDefault ? " (default)" : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Контрагент" error={formState.errors.counterpartyId?.message} wide>
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

      {/* ───── Даты и валюта ───── */}
      <section className="border rounded-lg p-5 bg-white space-y-4">
        <h2 className="font-medium">Даты и валюта</h2>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Дата выпуска" error={formState.errors.issueDate?.message}>
            <input type="date" className="input" {...register("issueDate")} />
          </Field>
          <Field label="Due date">
            <input type="date" className="input" {...register("dueDate")} />
          </Field>
          <Field label="Other date">
            <input type="date" className="input" {...register("otherDate")} />
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
                Курс THB → USD:
              </span>
              <input
                type="number"
                step="0.0001"
                placeholder="напр. 34.5"
                className="input w-36"
                {...register("exchangeRate", { valueAsNumber: true })}
              />
              <span className="text-xs text-zinc-500">
                Commission (USD) = Commission (THB) / Rate. Фиксируется при
                Issue.
              </span>
            </div>
          ) : (
            <div className="col-span-2 flex items-center gap-4 pt-5">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...register("showUsdEquivalent")} />
                <span>Показать эквивалент в USD</span>
              </label>
              {showUsdEquivalent && primaryCurrency !== "USD" && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-600">Курс (THB за 1 USD):</span>
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

          <label className="flex items-center gap-2 text-sm col-span-1">
            <input type="checkbox" {...register("vatApplied")} />
            <span>VAT 7%</span>
          </label>
          <label className="flex items-center gap-2 text-sm col-span-1">
            <input type="checkbox" {...register("whtApplied")} />
            <span>WHT 3% (вычитается)</span>
          </label>
        </div>
      </section>

      {/* ───── Позиции ───── */}
      <section className="border rounded-lg p-5 bg-white space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Позиции</h2>
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
                    Позиция {idx + 1} ·{" "}
                    {itemType === "commission" ? "commission" : "bonus"}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    disabled={fields.length === 1}
                    className="text-xs text-red-600 hover:text-red-800 disabled:opacity-30"
                  >
                    Удалить
                  </button>
                </div>

                <input
                  type="hidden"
                  {...register(`items.${idx}.itemType` as const)}
                />

                <div className="grid grid-cols-4 gap-3">
                  <Field label="Проект">
                    <input
                      className="input"
                      {...register(`items.${idx}.projectName` as const)}
                    />
                  </Field>
                  <Field label="Unit / код">
                    <input
                      className="input"
                      {...register(`items.${idx}.unitCode` as const)}
                    />
                  </Field>

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
                  ) : (
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
                  )}

                  <Field label="Комментарий" wide>
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

      {/* ───── Итоги ───── */}
      <section className="border rounded-lg p-5 bg-zinc-50 space-y-2 text-sm tabular-nums">
        <Row
          label="Subtotal"
          value={totals.subtotal}
          currency={primaryCurrency}
        />
        {vatApplied && (
          <Row
            label="VAT 7%"
            value={totals.vatAmount}
            currency={primaryCurrency}
          />
        )}
        {whtApplied && (
          <Row
            label="WHT 3% (вычитается)"
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

        {/* USD-шаблон: THB-справка + курс */}
        {isUsdTemplate && totals.totalThb != null && (
          <div className="pt-2 border-t text-zinc-600 space-y-1">
            <Row
              label="Subtotal (THB, справочно)"
              value={totals.subtotalThb ?? 0}
              currency="THB"
            />
            <Row
              label="Total (THB, справочно)"
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
                Курс не указан — USD-суммы не посчитаны
              </div>
            )}
          </div>
        )}

        {/* Обычный режим: эквивалент в USD */}
        {!isUsdTemplate && showUsdEquivalent && totals.totalUsd != null && (
          <div className="pt-2 text-zinc-600">
            <Row
              label="Total USD (эквивалент)"
              value={totals.totalUsd}
              currency="USD"
            />
          </div>
        )}
      </section>

      {/* ───── Заметки ───── */}
      <section className="border rounded-lg p-5 bg-white">
        <Field label="Заметки (будут отображены на PDF)" wide>
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
            ? "Сохранение…"
            : mode.kind === "create"
              ? "Создать draft"
              : "Сохранить"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded px-5 py-2.5 border hover:bg-zinc-50"
        >
          Отмена
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
    return Number(item.bonusAmount) || 0;
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
            {rate > 0 ? fmt(usd) : "— укажите курс"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="text-right text-sm tabular-nums">
      <span className="text-zinc-500">Сумма позиции: </span>
      <span className="font-medium">{fmt(amountThb)}</span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Combobox контрагента: type-ahead поиск по 121+ записям.
// Фильтр по подстроке, нечувствительный к регистру; работает и на латинице,
// и на тайском, и на кириллице (у нас есть Miss ... / บริษัท ... / ИП ...).
// Клиентский (ctx.counterparties уже загружен в форму из SSR) — не дёргает API.
//
// value — UUID выбранного контрагента (или ""). onChange(id) отдаёт наружу.
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

  // Если значение извне поменялось (edit mode, сброс формы) — синхронизируем input
  useEffect(() => {
    setQuery(selected?.name ?? "");
  }, [selected]);

  // Закрытие по клику вне
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

  // Показываем максимум 50 — если список огромный, пусть сужают запрос
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
        placeholder="Начните вводить имя контрагента…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
          // Если пользователь стёр имя — сбрасываем привязку
          if (e.target.value === "") onChange("");
          else if (selected && e.target.value !== selected.name) onChange("");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Если в поле текст, который не совпадает ни с одним контрагентом,
          // откатываем к последнему валидному выбору (или пусто).
          // Даём mousedown по элементу списка успеть сработать.
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
          aria-label="Очистить"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 text-sm"
        >
          ×
        </button>
      )}

      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border rounded shadow-md text-sm max-h-72 overflow-auto">
          {visible.length === 0 ? (
            <div className="px-3 py-2 text-zinc-500">Ничего не найдено</div>
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
                  ещё {filtered.length - visible.length} — уточните запрос
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
