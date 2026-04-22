"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { resetUserPassword } from "../actions";

type FormValues = { password: string };

export function ResetPasswordForm({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);

  const { register, handleSubmit, reset, formState } = useForm<FormValues>({
    defaultValues: { password: "" },
  });

  const onSubmit = (values: FormValues) => {
    setMessage(null);
    startTransition(async () => {
      const res = await resetUserPassword(id, values);
      if (res.ok) {
        setMessage({ kind: "ok", text: "Пароль обновлён" });
        reset({ password: "" });
      } else {
        setMessage({ kind: "error", text: res.error });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-700">Новый пароль</span>
        <input
          type="password"
          autoComplete="new-password"
          className="border rounded px-3 py-2 text-sm"
          {...register("password", {
            required: "Введите новый пароль",
            minLength: { value: 8, message: "Минимум 8 символов" },
          })}
        />
        {formState.errors.password && (
          <span className="text-red-600 text-xs">
            {formState.errors.password.message}
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

      <button
        type="submit"
        disabled={isPending}
        className="border rounded px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-40"
      >
        {isPending ? "Обновление…" : "Обновить пароль"}
      </button>
    </form>
  );
}
