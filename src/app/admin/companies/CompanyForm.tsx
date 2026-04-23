"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import {
  createCompany,
  updateCompany,
  type CompanyFormValues,
} from "./actions";

type Mode = { kind: "create" } | { kind: "edit"; id: string };

const emptyDefaults: CompanyFormValues = {
  name: "",
  legalType: "resident",
  address: "",
  taxId: "",
  registrationNo: "",
  phone: "",
  email: "",
  defaultCurrency: "THB",
  isActive: true,
};

export function CompanyForm({
  mode,
  defaults,
}: {
  mode: Mode;
  defaults?: CompanyFormValues;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<CompanyFormValues>({
    defaultValues: defaults ?? emptyDefaults,
  });

  const onSubmit = (values: CompanyFormValues) => {
    setMessage(null);
    startTransition(async () => {
      if (mode.kind === "create") {
        const res = await createCompany(values);
        if (res.ok) {
          router.push(`/admin/companies/${res.id}`);
        } else {
          setMessage({ kind: "error", text: res.error });
        }
        return;
      }

      const res = await updateCompany(mode.id, values);
      if (res.ok) {
        setMessage({ kind: "ok", text: "Saved" });
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
        <Field label="Name" error={errors.name?.message} wide>
          <input
            className="input"
            autoFocus={mode.kind === "create"}
            {...register("name", { required: "Required" })}
          />
        </Field>

        <Field label="Legal type">
          <select className="input" {...register("legalType")}>
            <option value="resident">Resident (Thailand)</option>
            <option value="offshore">Offshore</option>
          </select>
        </Field>

        <Field label="Default currency">
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

        <Field label="Phone" error={errors.phone?.message}>
          <input className="input" {...register("phone")} />
        </Field>

        <Field label="E-mail" error={errors.email?.message}>
          <input type="email" className="input" {...register("email")} />
        </Field>

        <Field label="Address" error={errors.address?.message} wide>
          <textarea
            rows={2}
            className="input resize-y"
            {...register("address")}
          />
        </Field>

        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("isActive")} />
          <span>Active (shown when selecting on an invoice)</span>
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
          disabled={isPending || (mode.kind === "edit" && !isDirty)}
          className="bg-black text-white rounded px-4 py-2 hover:bg-zinc-800 disabled:opacity-40"
        >
          {isPending
            ? "Saving…"
            : mode.kind === "create"
              ? "Create"
              : "Save"}
        </button>
        <button
          type="button"
          disabled={isPending || (mode.kind === "edit" && !isDirty)}
          onClick={() => {
            if (mode.kind === "create") {
              router.push("/admin/companies");
            } else if (defaults) {
              reset(defaults);
              setMessage(null);
            }
          }}
          className="rounded px-4 py-2 border hover:bg-zinc-50 disabled:opacity-40"
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
