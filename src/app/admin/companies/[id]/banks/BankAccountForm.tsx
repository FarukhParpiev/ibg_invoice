"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import {
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  type BankAccountFormValues,
} from "./actions";

type Mode =
  | { kind: "create"; companyId: string }
  | { kind: "edit"; companyId: string; bankId: string };

const emptyDefaults: BankAccountFormValues = {
  bankName: "",
  accountName: "",
  accountNumber: "",
  swift: "",
  branch: "",
  bankAddress: "",
  currency: "THB",
  isDefault: false,
};

export function BankAccountForm({
  mode,
  defaults,
}: {
  mode: Mode;
  defaults?: BankAccountFormValues;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [message, setMessage] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<BankAccountFormValues>({
    defaultValues: defaults ?? emptyDefaults,
  });

  const onSubmit = (values: BankAccountFormValues) => {
    setMessage(null);
    startTransition(async () => {
      const res =
        mode.kind === "create"
          ? await createBankAccount(mode.companyId, values)
          : await updateBankAccount(mode.companyId, mode.bankId, values);

      if (res.ok) {
        if (mode.kind === "create") {
          router.push(`/admin/companies/${mode.companyId}`);
        } else {
          setMessage({ kind: "ok", text: "Saved" });
          reset(values);
        }
      } else {
        setMessage({ kind: "error", text: res.error });
      }
    });
  };

  const onDelete = () => {
    if (mode.kind !== "edit") return;
    if (!confirm("Delete this bank account? If it is used by invoices, the deletion will be cancelled.")) {
      return;
    }
    startDelete(async () => {
      await deleteBankAccount(mode.companyId, mode.bankId);
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="border rounded-lg p-6 space-y-5 bg-white"
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Currency">
          <select className="input" {...register("currency")}>
            <option value="THB">THB</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="RUB">RUB</option>
          </select>
        </Field>

        <div className="col-span-1 flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("isDefault")} />
            <span>Default account for this currency</span>
          </label>
        </div>

        <Field label="Bank name" error={errors.bankName?.message} wide>
          <input
            className="input"
            autoFocus={mode.kind === "create"}
            {...register("bankName", { required: "Required" })}
          />
        </Field>

        <Field
          label="Account name"
          error={errors.accountName?.message}
          wide
        >
          <input
            className="input"
            {...register("accountName", { required: "Required" })}
          />
        </Field>

        <Field label="Account number" error={errors.accountNumber?.message}>
          <input
            className="input"
            {...register("accountNumber", { required: "Required" })}
          />
        </Field>

        <Field label="SWIFT / BIC" error={errors.swift?.message}>
          <input className="input" {...register("swift")} />
        </Field>

        <Field label="Branch" error={errors.branch?.message}>
          <input className="input" {...register("branch")} />
        </Field>

        <Field label="Bank address" error={errors.bankAddress?.message} wide>
          <textarea
            rows={2}
            className="input resize-y"
            {...register("bankAddress")}
          />
        </Field>
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

      <div className="flex items-center justify-between">
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
          {mode.kind === "edit" && (
            <button
              type="button"
              disabled={!isDirty || isPending}
              onClick={() => {
                if (defaults) reset(defaults);
                setMessage(null);
              }}
              className="rounded px-4 py-2 border hover:bg-zinc-50 disabled:opacity-40"
            >
              Cancel
            </button>
          )}
        </div>

        {mode.kind === "edit" && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            className="text-sm text-red-600 hover:text-red-800 disabled:opacity-40"
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </button>
        )}
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
