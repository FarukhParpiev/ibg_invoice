"use client";

// Кнопки для работы с PDF на странице инвойса:
// - «Сгенерировать PDF» / «Перегенерировать» → POST /api/invoices/[id]/pdf
// - «Скачать» → ссылка на /api/invoices/[id]/pdf/download (auth-gated)
// - «Скопировать прямую ссылку» → кладёт pdfUrl в буфер обмена.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function PdfActions({
  invoiceId,
  pdfUrl,
}: {
  invoiceId: string;
  pdfUrl: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/invoices/${invoiceId}/pdf`, {
          method: "POST",
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !body.ok) {
          setError(body.error ?? `Ошибка ${res.status}`);
          return;
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка сети");
      }
    });
  };

  const handleCopy = async () => {
    if (!pdfUrl) return;
    // Копируем auth-gated URL нашего приложения, а не raw Vercel Blob.
    // Приватный blob-store отдаёт Forbidden без авторизации, а наш endpoint
    // проверяет сессию и стримит файл.
    const downloadUrl = `${window.location.origin}/api/invoices/${invoiceId}/pdf/download`;
    try {
      await navigator.clipboard.writeText(downloadUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // игнор
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={handleGenerate}
          disabled={pending}
          className="border rounded px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-40"
        >
          {pending
            ? "Генерация…"
            : pdfUrl
              ? "Перегенерировать PDF"
              : "Сгенерировать PDF"}
        </button>

        {pdfUrl && (
          <>
            <a
              href={`/api/invoices/${invoiceId}/pdf/download`}
              className="bg-black text-white rounded px-3 py-1.5 text-sm hover:bg-zinc-800"
            >
              Скачать PDF
            </a>
            <button
              onClick={handleCopy}
              className="border rounded px-3 py-1.5 text-sm hover:bg-zinc-50"
            >
              {copied ? "Скопировано ✓" : "Скопировать ссылку"}
            </button>
          </>
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
