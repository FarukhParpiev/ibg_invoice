"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { updateCompany, type CompanyFormValues } from "../actions";

export function CompanyEditForm({
  id,
  defaults,
}: {
  id: string;
  defaults: CompanyFormValues;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<CompanyFormValues>({ defaultValues: defaults });

  const onSubmit = (values: CompanyFormValues) => {
    setMessage(null);
    startTransition(async () => {
      const res = await updateCompany(id, values);
      if (res.ok) {
        setMessage({ kind: "ok", text: "Сохранено" });
        reset(values);
      } else {
        setMessage({ kind: "error", text: res.error });
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="border rounded-lg p-6 space-y-5 bg-white"
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Название" error={errors.name?.message} wide>
          <input
            className="input"
            {...register("name", { required: "Обязательное поле" })}
          />
        </Field>

        <Field label="Юр. тип">
          <select className="input" {...register("legalType")}>
            <option value="resident">Resident (Таиланд)</option>
            <option value="offshore">Offshore</option>
          </select>
        </Field>

        <Field label="Валюта по умолчанию">
          <select className="input" {...register("defaultCurrency")}>
            <option value="THB">THB</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="RUB">RUB</option>
          </select>
        </Field>

        <Field label="Tax ID" error={errors.taxId?.message}>
          <input className="input" {...register("taxId")} />
        </Field>

        <Field label="Registration No" error={errors.registrationNo?.message}>
          <input className="input" {...register("registrationNo")} />
        </Field>

        <Field label="Телефон" error={errors.phone?.message}>
          <input className="input" {...register("phone")} />
        </Field>

        <Field label="E-mail" error={errors.email?.message}>
          <input type="email" className="input" {...register("email")} />
        </Field>

        <Field label="Адрес" error={errors.address?.message} wide>
          <textarea
            rows={2}
            className="input resize-y"
            {...register("address")}
          />
        </Field>

        <Field label="URL логотипа" error={errors.logoUrl?.message} wide>
          <input
            type="url"
            placeholder="https://..."
            className="input"
            {...register("logoUrl")}
          />
        </Field>

        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("isActive")} />
          <span>Активна (отображается при выборе в инвойсе)</span>
        </label>
      </div>

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
          disabled={isPending || !isDirty}
          className="bg-black text-white rounded px-4 py-2 hover:bg-zinc-800 disabled:opacity-40"
        >
          {isPending ? "Сохранение…" : "Сохранить"}
        </button>
        <button
          type="button"
          disabled={!isDirty || isPending}
          onClick={() => {
            reset(defaults);
            setMessage(null);
          }}
          className="rounded px-4 py-2 border hover:bg-zinc-50 disabled:opacity-40"
        >
          Отменить
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
