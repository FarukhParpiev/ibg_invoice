"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { createUser } from "../actions";

type FormValues = {
  email: string;
  name: string;
  role: "super_admin" | "user";
  password: string;
};

export function NewUserForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState } = useForm<FormValues>({
    defaultValues: { email: "", name: "", role: "user", password: "" },
  });

  const onSubmit = (values: FormValues) => {
    setError(null);
    startTransition(async () => {
      const res = await createUser(values);
      if (res.ok) {
        router.push("/admin/users");
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="border rounded-lg p-5 bg-white space-y-4"
    >
      <Field label="Email" error={formState.errors.email?.message}>
        <input
          type="email"
          className="input"
          autoComplete="off"
          {...register("email", { required: "Email is required" })}
        />
      </Field>

      <Field label="Name (optional)">
        <input className="input" {...register("name")} />
      </Field>

      <Field label="Role">
        <select className="input" {...register("role")}>
          <option value="user">user — works with invoices and counterparties</option>
          <option value="super_admin">
            super_admin — full access, including companies and users
          </option>
        </select>
      </Field>

      <Field label="Password (minimum 8 characters)" error={formState.errors.password?.message}>
        <input
          type="password"
          className="input"
          autoComplete="new-password"
          {...register("password", {
            required: "Password is required",
            minLength: { value: 8, message: "Minimum 8 characters" },
          })}
        />
      </Field>

      {error && (
        <div className="text-sm rounded bg-red-50 text-red-700 px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="bg-black text-white rounded px-5 py-2.5 hover:bg-zinc-800 disabled:opacity-40"
        >
          {isPending ? "Creating…" : "Create user"}
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
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-700">{label}</span>
      {children}
      {error && <span className="text-red-600 text-xs">{error}</span>}
    </label>
  );
}
