"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  email: z.string().email("Invalid e-mail"),
  password: z.string().min(6, "Minimum 6 characters"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    setError(null);
    const res = await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    });

    if (res?.error) {
      setError("Invalid e-mail or password");
      return;
    }

    const callbackUrl = searchParams.get("callbackUrl") ?? "/";
    router.push(callbackUrl);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-zinc-700">E-mail</span>
        <input
          type="email"
          autoComplete="email"
          className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/20"
          {...register("email")}
        />
        {errors.email && (
          <span className="text-red-600 text-xs">{errors.email.message}</span>
        )}
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-zinc-700">Password</span>
        <input
          type="password"
          autoComplete="current-password"
          className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/20"
          {...register("password")}
        />
        {errors.password && (
          <span className="text-red-600 text-xs">
            {errors.password.message}
          </span>
        )}
      </label>

      {error && (
        <div className="text-red-600 text-sm py-2 px-3 bg-red-50 rounded">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-black text-white rounded py-2.5 mt-2 hover:bg-zinc-800 disabled:opacity-50"
      >
        {isSubmitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
