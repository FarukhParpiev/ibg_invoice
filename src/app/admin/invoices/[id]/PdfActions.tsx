"use client";

// PDF-related buttons on the invoice page:
// - "Generate PDF" / "Regenerate" → POST /api/invoices/[id]/pdf
// - "Download" → link to /api/invoices/[id]/pdf/download (auth-gated)
// - "Copy direct link" → puts pdfUrl into the clipboard.

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
  const [success, setSuccess] = useState(false);

  const handleGenerate = () => {
    setError(null);
    setSuccess(false);
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
          setError(body.error ?? `Error ${res.status}`);
          return;
        }
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2500);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
      }
    });
  };

  const handleCopy = async () => {
    if (!pdfUrl) return;
    // Copy our own auth-gated URL, not the raw Vercel Blob.
    // The private blob store returns Forbidden without auth, while our
    // endpoint checks the session and streams the file.
    const downloadUrl = `${window.location.origin}/api/invoices/${invoiceId}/pdf/download`;
    try {
      await navigator.clipboard.writeText(downloadUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
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
            ? "Generating…"
            : pdfUrl
              ? "Regenerate PDF"
              : "Generate PDF"}
        </button>

        {pdfUrl && (
          <>
            <a
              href={`/api/invoices/${invoiceId}/pdf/download`}
              className="bg-black text-white rounded px-3 py-1.5 text-sm hover:bg-zinc-800"
            >
              Download PDF
            </a>
            <button
              onClick={handleCopy}
              className="border rounded px-3 py-1.5 text-sm hover:bg-zinc-50"
            >
              {copied ? "Copied ✓" : "Copy link"}
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="text-sm rounded bg-red-50 text-red-700 px-3 py-2">
          {error}
        </div>
      )}

      {success && (
        <div className="text-sm rounded bg-green-50 text-green-700 px-3 py-2">
          PDF updated ✓
        </div>
      )}
    </div>
  );
}
