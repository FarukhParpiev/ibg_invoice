"use client";

// Кнопка «Создать копию» → новый draft по шаблону текущего инвойса.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { duplicateInvoice } from "../actions";

export function DuplicateButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    if (!confirm("Создать копию этого инвойса как новый draft?")) return;
    setError(null);
    startTransition(async () => {
      const res = await duplicateInvoice(invoiceId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/admin/invoices/${res.id}/edit`);
    });
  };

  return (
    <div className="space-y-2">
      <button
        onClick={onClick}
        disabled={pending}
        className="border rounded px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-40"
      >
        {pending ? "Копируется…" : "Создать копию"}
      </button>
      {error && (
        <div className="text-sm rounded bg-red-50 text-red-700 px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
