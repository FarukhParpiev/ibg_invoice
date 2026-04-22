"use client";

import { forwardRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import {
  updateOwnName,
  updateOwnEmail,
  updateOwnPassword,
} from "./actions";

type Defaults = {
  name: string;
  email: string;
};

type Msg = { kind: "ok" | "error"; text: string } | null;

export function ProfileForms({ defaults }: { defaults: Defaults }) {
  return (
    <div className="space-y-6">
      <NameForm defaultName={defaults.name} />
      <EmailForm defaultEmail={defaults.email} />
      <PasswordForm />
    </div>
  );
}

// ─── Name ────────────────────────────────────────────────

function NameForm({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isDirty },
  } = useForm<{ name: string }>({ defaultValues: { name: defaultName } });

  const onSubmit = (values: { name: string }) => {
    setMsg(null);
    startTransition(async () => {
      const res = await updateOwnName(values);
      if (res.ok) {
        setMsg({ kind: "ok", text: "Name updated" });
        reset(values);
        router.refresh();
      } else {
        setMsg({ kind: "error", text: res.error });
      }
    });
  };

  return (
    <Section title="Name" description="Shown in the sidebar and audit log.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <Input
          label="Display name"
          placeholder="e.g. Alex"
          {...register("name", { maxLength: 200 })}
        />
        <FormFooter
          msg={msg}
          disabled={isPending || !isDirty}
          pending={isPending}
          label="Save name"
        />
      </form>
    </Section>
  );
}

// ─── Email ────────────────────────────────────────────────

function EmailForm({ defaultEmail }: { defaultEmail: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<{ email: string; currentPassword: string }>({
    defaultValues: { email: defaultEmail, currentPassword: "" },
  });

  const currentEmail = watch("email");
  const touched = currentEmail.trim().toLowerCase() !== defaultEmail.toLowerCase();

  const onSubmit = (values: { email: string; currentPassword: string }) => {
    setMsg(null);
    startTransition(async () => {
      const res = await updateOwnEmail(values);
      if (res.ok) {
        setMsg({ kind: "ok", text: "Email updated — use the new email next sign-in" });
        reset({ email: values.email.trim().toLowerCase(), currentPassword: "" });
        router.refresh();
      } else {
        setMsg({ kind: "error", text: res.error });
      }
    });
  };

  return (
    <Section
      title="Email"
      description="Used to sign in. Requires your current password to change."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <Input
          type="email"
          label="Email"
          error={errors.email?.message}
          {...register("email", {
            required: "Email is required",
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: "Invalid email",
            },
          })}
        />
        <Input
          type="password"
          autoComplete="current-password"
          label="Current password"
          error={errors.currentPassword?.message}
          {...register("currentPassword", {
            required: touched ? "Enter your current password" : false,
          })}
        />
        <FormFooter
          msg={msg}
          disabled={isPending || !touched}
          pending={isPending}
          label="Update email"
        />
      </form>
    </Section>
  );
}

// ─── Password ────────────────────────────────────────────────

function PasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    watch,
  } = useForm<{
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }>({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const newPwd = watch("newPassword");

  const onSubmit = (values: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => {
    setMsg(null);
    startTransition(async () => {
      const res = await updateOwnPassword(values);
      if (res.ok) {
        setMsg({ kind: "ok", text: "Password updated" });
        reset({ currentPassword: "", newPassword: "", confirmPassword: "" });
      } else {
        setMsg({ kind: "error", text: res.error });
      }
    });
  };

  return (
    <Section
      title="Password"
      description="Choose a strong password. Minimum 8 characters."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <Input
          type="password"
          autoComplete="current-password"
          label="Current password"
          error={errors.currentPassword?.message}
          {...register("currentPassword", {
            required: "Enter your current password",
          })}
        />
        <Input
          type="password"
          autoComplete="new-password"
          label="New password"
          error={errors.newPassword?.message}
          {...register("newPassword", {
            required: "Enter a new password",
            minLength: { value: 8, message: "Minimum 8 characters" },
          })}
        />
        <Input
          type="password"
          autoComplete="new-password"
          label="Confirm new password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword", {
            required: "Confirm your new password",
            validate: (v) => v === newPwd || "Passwords do not match",
          })}
        />
        <FormFooter
          msg={msg}
          disabled={isPending}
          pending={isPending}
          label="Update password"
        />
      </form>
    </Section>
  );
}

// ─── Shared UI ────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border rounded-lg p-5 bg-white space-y-4">
      <div>
        <h2 className="font-semibold text-zinc-900">{title}</h2>
        {description && (
          <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

type InputProps = {
  label: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>;

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, ...rest },
  ref,
) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-700">{label}</span>
      <input
        ref={ref}
        {...rest}
        className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
      />
      {error && <span className="text-red-600 text-xs">{error}</span>}
    </label>
  );
});

function FormFooter({
  msg,
  disabled,
  pending,
  label,
}: {
  msg: Msg;
  disabled: boolean;
  pending: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <div className="flex-1 min-h-[20px]">
        {msg && (
          <span
            className={`text-xs rounded px-2 py-1 ${
              msg.kind === "ok"
                ? "bg-green-50 text-green-800"
                : "bg-red-50 text-red-700"
            }`}
          >
            {msg.text}
          </span>
        )}
      </div>
      <button
        type="submit"
        disabled={disabled}
        className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-40"
      >
        {pending ? "Saving…" : label}
      </button>
    </div>
  );
}
