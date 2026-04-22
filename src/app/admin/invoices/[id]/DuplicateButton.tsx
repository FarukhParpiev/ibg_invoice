"use client";

// "Duplicate" button → creates a new draft from the current invoice as a template.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { duplicateInvoice } from "../actions";

export function DuplicateButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    if (!confirm("Duplicate this invoice as a new draft?")) return;
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
        {pending ? "Duplicating…" : "Duplicate"}
      </button>
      {error && (
        <div className="text-sm rounded bg-red-50 text-red-700 px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
