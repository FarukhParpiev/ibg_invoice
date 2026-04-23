"use client";

// One-shot admin tool to re-generate PDFs that still live on the old private
// Vercel Blob store into the new public store. Super-admin only; intended to
// be run once right after the blob store migration.

import { useState, useTransition } from "react";

type Summary = {
  ok: boolean;
  total: number;
  regenerated: number;
  skipped: number;
  errors: number;
  results: Array<{
    id: string;
    number: string | null;
    status: "skipped" | "regenerated" | "error";
    reason?: string;
    error?: string;
  }>;
};

export function MigratePdfsButton() {
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = () => {
    if (!window.confirm("Regenerate PDFs for every invoice on the old private store? This can take a while.")) {
      return;
    }
    setError(null);
    setSummary(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/regenerate-pdfs", { method: "POST" });
        const body = (await res.json().catch(() => ({}))) as Summary | { error?: string };
        if (!res.ok) {
          const msg = "error" in body && body.error ? body.error : `Error ${res.status}`;
          setError(msg);
          return;
        }
        setSummary(body as Summary);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
      }
    });
  };

  return (
    <div className="space-y-3">
      <button
        onClick={handleRun}
        disabled={pending}
        className="border rounded px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-40"
      >
        {pending ? "Regenerating…" : "Regenerate old-store PDFs"}
      </button>

      {error && (
        <div className="text-sm rounded bg-red-50 text-red-700 px-3 py-2">
          {error}
        </div>
      )}

      {summary && (
        <div className="text-sm rounded bg-green-50 text-green-800 px-3 py-2 space-y-1">
          <div>
            Total: {summary.total} · Regenerated: {summary.regenerated} ·
            Skipped: {summary.skipped} · Errors: {summary.errors}
          </div>
          {summary.errors > 0 && (
            <ul className="list-disc pl-5 text-red-700">
              {summary.results
                .filter((r) => r.status === "error")
                .map((r) => (
                  <li key={r.id}>
                    {r.number ?? r.id}: {r.error}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
