"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import {
  createCounterparty,
  updateCounterparty,
  deleteCounterparty,
  type CounterpartyFormValues,
} from "./actions";

type Mode = { kind: "create" } | { kind: "edit"; id: string };

const emptyDefaults: CounterpartyFormValues = {
  name: "",
  address: "",
  taxId: "",
  phone: "",
  email: "",
  preferredLanguage: "en",
  notes: "",
  isActive: true,
};

export function CounterpartyForm({
  mode,
  defaults,
}: {
  mode: Mode;
  defaults?: CounterpartyFormValues;
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
  } = useForm<CounterpartyFormValues>({
    defaultValues: defaults ?? emptyDefaults,
  });

  const onSubmit = (values: CounterpartyFormValues) => {
    setMessage(null);
    startTransition(async () => {
      const res =
        mode.kind === "create"
          ? await createCounterparty(values)
          : await updateCounterparty(mode.id, values);

      if (res.ok) {
        if (mode.kind === "create") {
          router.push(`/admin/counterparties/${res.id}`);
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
    if (!confirm("Delete this counterparty? If it has invoices, it will be hidden instead of deleted.")) {
      return;
    }
    startDelete(async () => {
      await deleteCounterparty(mode.id);
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

        <Field label="Preferred language">
          <select className="input" {...register("preferredLanguage")}>
            <option value="en">English</option>
            <option value="th">ภาษาไทย</option>
          </select>
        </Field>

        <Field label="Tax ID" error={errors.taxId?.message}>
          <input className="input" {...register("taxId")} />
        </Field>

        <Field label="Phone" error={errors.phone?.message}>
          <input className="input" {...register("phone")} />
        </Field>

        <Field label="E-mail" error={errors.email?.message}>
          <input type="email" className="input" {...register("email")} />
        </Field>

        <Field label="Address" error={errors.address?.message} wide>
          <textarea rows={2} className="input resize-y" {...register("address")} />
        </Field>

        <Field label="Notes" error={errors.notes?.message} wide>
          <textarea rows={3} className="input resize-y" {...register("notes")} />
        </Field>

        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("isActive")} />
          <span>Active (available when creating invoices)</span>
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
