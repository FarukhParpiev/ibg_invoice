"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { updateUser } from "../actions";

type FormValues = {
  name: string;
  role: "super_admin" | "user";
  isActive: boolean;
};

export function EditUserForm({
  id,
  defaults,
  isSelf,
}: {
  id: string;
  defaults: FormValues;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);

  const { register, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: defaults,
  });

  const onSubmit = (values: FormValues) => {
    setMessage(null);
    startTransition(async () => {
      const res = await updateUser(id, values);
      if (res.ok) {
        setMessage({ kind: "ok", text: "Saved" });
        reset(values);
        router.refresh();
      } else {
        setMessage({ kind: "error", text: res.error });
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="border rounded-lg p-5 bg-white space-y-4"
    >
      <Field label="Name">
        <input className="input" {...register("name")} />
      </Field>

      <Field label="Role">
        <select className="input" disabled={isSelf} {...register("role")}>
          <option value="user">user</option>
          <option value="super_admin">super_admin</option>
        </select>
        {isSelf && (
          <span className="text-xs text-zinc-500">
            You cannot change your own role.
          </span>
        )}
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={isSelf} {...register("isActive")} />
        <span>Active</span>
        {isSelf && (
          <span className="text-xs text-zinc-500 ml-2">
            — you cannot deactivate yourself
          </span>
        )}
      </label>

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
          {isPending ? "Saving…" : "Save"}
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
        .input:disabled { background: #f4f4f5; color: #71717a; }
        .input:focus { outline: 2px solid rgba(0,0,0,0.15); outline-offset: 0; }
      `}</style>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-700">{label}</span>
      {children}
    </label>
  );
}
