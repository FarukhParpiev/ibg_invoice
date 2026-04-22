"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  issueInvoice,
  payInvoice,
  cancelInvoice,
  deleteDraftInvoice,
} from "../actions";
import type { InvoiceStatus, InvoiceType } from "@prisma/client";

export function InvoiceActions({
  id,
  status,
  type,
}: {
  id: string;
  status: InvoiceStatus;
  type: InvoiceType;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleIssue = () => {
    setError(null);
    startTransition(async () => {
      const res = await issueInvoice(id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  };

  const handlePay = () => {
    const dateStr = prompt(
      "Дата оплаты (YYYY-MM-DD):",
      new Date().toISOString().slice(0, 10),
    );
    if (!dateStr) return;
    setError(null);
    startTransition(async () => {
      const res = await payInvoice(id, dateStr);
      if (!res.ok) setError(res.error);
      else {
        router.push(`/admin/invoices/${res.id}`);
        router.refresh();
      }
    });
  };

  const handleCancel = () => {
    const reason = prompt("Причина отмены:", "");
    if (reason === null) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelInvoice(id, reason);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  };

  const handleDelete = () => {
    if (!confirm("Удалить draft навсегда?")) return;
    startTransition(async () => {
      await deleteDraftInvoice(id);
    });
  };

  // Receipt нельзя модифицировать через эти кнопки
  if (type === "receipt") {
    return (
      <div className="text-sm text-zinc-500">
        Это автосозданный receipt. Он изменяется вместе с родительским инвойсом.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "draft" && (
          <>
            <button
              onClick={handleIssue}
              disabled={pending}
              className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-40"
            >
              Выпустить (Issue)
            </button>
            <button
              onClick={() => router.push(`/admin/invoices/${id}/edit`)}
              disabled={pending}
              className="border rounded px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-40"
            >
              Редактировать
            </button>
            <button
              onClick={handleDelete}
              disabled={pending}
              className="text-sm text-red-600 hover:text-red-800 disabled:opacity-40 px-2"
            >
              Удалить draft
            </button>
          </>
        )}

        {status === "issued" && (
          <>
            <button
              onClick={handlePay}
              disabled={pending}
              className="bg-green-600 text-white rounded px-4 py-2 text-sm hover:bg-green-700 disabled:opacity-40"
            >
              Отметить оплаченным (+ receipt)
            </button>
            <button
              onClick={handleCancel}
              disabled={pending}
              className="border border-red-300 text-red-700 rounded px-4 py-2 text-sm hover:bg-red-50 disabled:opacity-40"
            >
              Отменить
            </button>
          </>
        )}

        {status === "paid" && (
          <div className="text-sm text-zinc-600">
            Инвойс оплачен. Изменения запрещены.
          </div>
        )}
        {status === "cancelled" && (
          <div className="text-sm text-zinc-600">Инвойс отменён.</div>
        )}
      </div>

      {error && (
        <div className="text-sm rounded bg-red-50 text-red-700 px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
