"use client";

// Bulk-selectable table on /admin/invoices and /admin/invoices/archive.
// Checkbox in each row, "Select all on page" in the header, and a sticky
// action bar at the bottom that adapts to which view is active:
//  - default view  → "Delete drafts" (drafts only) / "Archive" (issued/paid/cancelled)
//  - archive view  → "Restore" / "Delete permanently"
//
// All actions are server actions imported from ./actions. The component
// owns the selection state; the parent decides which rows to render.

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InvoiceStatus, InvoiceType } from "@prisma/client";
import {
  bulkDeleteDrafts,
  bulkArchiveInvoices,
  bulkRestoreInvoices,
  bulkPermanentlyDeleteInvoices,
} from "./actions";

const statusLabels: Record<InvoiceStatus, { text: string; cls: string }> = {
  draft: { text: "Draft", cls: "bg-zinc-100 text-zinc-700" },
  issued: { text: "Issued", cls: "bg-blue-50 text-blue-700" },
  paid: { text: "Paid", cls: "bg-green-50 text-green-700" },
  cancelled: { text: "Cancelled", cls: "bg-red-50 text-red-700" },
};

export type BulkInvoiceRow = {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  type: InvoiceType;
  issueDate: string; // YYYY-MM-DD (already serialised by the server)
  title: string;
  companyName: string;
  counterpartyName: string;
  total: string; // pre-formatted "1,234.50"
  primaryCurrency: string;
  hasReceipt: boolean;
};

export function BulkInvoiceTable({
  rows,
  view,
  emptyMessage,
}: {
  rows: BulkInvoiceRow[];
  view: "default" | "archive";
  emptyMessage: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.id)),
    [rows, selected],
  );

  // Counts that drive which buttons are enabled and what they target.
  const counts = useMemo(() => {
    let drafts = 0;
    let archivable = 0;
    for (const r of selectedRows) {
      if (r.status === "draft") drafts++;
      else archivable++;
    }
    return { drafts, archivable };
  }, [selectedRows]);

  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someOnPage = rows.some((r) => selected.has(r.id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allOnPage) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.id)));
    }
  };

  const runAction = (
    fn: (ids: string[]) => Promise<{
      ok: boolean;
      affected: number;
      skipped: number;
      errors?: string[];
    }>,
    ids: string[],
    successLabel: string,
  ) => {
    setFlash(null);
    setErrors([]);
    startTransition(async () => {
      const res = await fn(ids);
      setSelected(new Set());
      const parts = [`${successLabel}: ${res.affected}`];
      if (res.skipped > 0) parts.push(`skipped: ${res.skipped}`);
      setFlash(parts.join(" · "));
      if (res.errors && res.errors.length > 0) setErrors(res.errors);
      router.refresh();
    });
  };

  const handleDeleteDrafts = () => {
    const ids = selectedRows.filter((r) => r.status === "draft").map((r) => r.id);
    if (ids.length === 0) return;
    if (
      !confirm(
        `Delete ${ids.length} draft${ids.length === 1 ? "" : "s"} permanently? This cannot be undone.`,
      )
    )
      return;
    runAction(bulkDeleteDrafts, ids, "Deleted drafts");
  };

  const handleArchive = () => {
    const ids = selectedRows
      .filter((r) => r.status !== "draft")
      .map((r) => r.id);
    if (ids.length === 0) return;
    runAction(bulkArchiveInvoices, ids, "Archived");
  };

  const handleRestore = () => {
    const ids = selectedRows.map((r) => r.id);
    if (ids.length === 0) return;
    runAction(bulkRestoreInvoices, ids, "Restored");
  };

  const handlePermanentDelete = () => {
    const ids = selectedRows.map((r) => r.id);
    if (ids.length === 0) return;
    if (
      !confirm(
        `Permanently delete ${ids.length} invoice${ids.length === 1 ? "" : "s"}?\n\nThis removes the row, line items and audit cannot bring them back. The PDFs in Blob storage will become orphaned.\n\nProceed?`,
      )
    )
      return;
    runAction(
      bulkPermanentlyDeleteInvoices,
      ids,
      "Permanently deleted",
    );
  };

  return (
    <div className="space-y-3">
      {flash && (
        <div className="text-sm rounded bg-zinc-100 px-3 py-2">{flash}</div>
      )}
      {errors.length > 0 && (
        <div className="text-sm rounded bg-red-50 text-red-700 px-3 py-2">
          <div className="font-medium mb-1">Some rows failed:</div>
          <ul className="list-disc pl-5 space-y-0.5">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr>
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allOnPage}
                  ref={(el) => {
                    if (el) el.indeterminate = !allOnPage && someOnPage;
                  }}
                  onChange={toggleAll}
                  disabled={rows.length === 0}
                  aria-label="Select all on page"
                />
              </th>
              <th className="text-left px-4 py-3 font-medium">No.</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Title</th>
              <th className="text-left px-4 py-3 font-medium">Company</th>
              <th className="text-left px-4 py-3 font-medium">Counterparty</th>
              <th className="text-right px-4 py-3 font-medium">Amount</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-zinc-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className={`border-t hover:bg-zinc-50/50 ${selected.has(r.id) ? "bg-blue-50/30" : ""}`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      aria-label={`Select ${r.number ?? r.id}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link
                      href={`/admin/invoices/${r.id}`}
                      className="hover:underline"
                    >
                      {r.number ?? (
                        <span className="text-zinc-400">
                          draft/{r.id.slice(0, 8)}
                        </span>
                      )}
                    </Link>
                    {r.type === "receipt" && (
                      <span className="ml-2 text-[10px] bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded">
                        receipt
                      </span>
                    )}
                    {r.hasReceipt && (
                      <span className="ml-2 text-[10px] bg-green-50 text-green-800 px-1.5 py-0.5 rounded">
                        +R
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{r.issueDate}</td>
                  <td
                    className="px-4 py-3 text-zinc-700 max-w-xs truncate"
                    title={r.title}
                  >
                    {r.title || <span className="text-zinc-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">{r.companyName}</td>
                  <td className="px-4 py-3 text-zinc-700">
                    {r.counterpartyName}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.total}{" "}
                    <span className="text-zinc-400 text-xs">
                      {r.primaryCurrency}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${statusLabels[r.status].cls}`}
                    >
                      {statusLabels[r.status].text}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Sticky-ish action bar — only shows when there's a selection. */}
      {selected.size > 0 && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-lg border bg-white px-4 py-3 shadow-md">
          <div className="text-sm text-zinc-700">
            <strong>{selected.size}</strong> selected
            {view === "default" && (
              <span className="text-zinc-500 ml-2">
                ({counts.drafts} draft, {counts.archivable} non-draft)
              </span>
            )}
          </div>
          <div className="flex-1" />
          {view === "default" ? (
            <>
              <button
                type="button"
                onClick={handleDeleteDrafts}
                disabled={pending || counts.drafts === 0}
                className="border border-red-300 text-red-700 rounded px-3 py-1.5 text-sm hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                title={
                  counts.drafts === 0
                    ? "Selection contains no drafts"
                    : "Permanently delete the selected drafts"
                }
              >
                Delete {counts.drafts > 0 ? `${counts.drafts} ` : ""}draft
                {counts.drafts === 1 ? "" : "s"}
              </button>
              <button
                type="button"
                onClick={handleArchive}
                disabled={pending || counts.archivable === 0}
                className="border rounded px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
                title={
                  counts.archivable === 0
                    ? "Drafts can't be archived (delete them instead)"
                    : "Move selected issued/paid/cancelled invoices to the archive"
                }
              >
                Archive {counts.archivable > 0 ? counts.archivable : ""}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleRestore}
                disabled={pending}
                className="border rounded px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-40"
              >
                Restore {selected.size}
              </button>
              <button
                type="button"
                onClick={handlePermanentDelete}
                disabled={pending}
                className="bg-red-600 text-white rounded px-3 py-1.5 text-sm hover:bg-red-700 disabled:opacity-40"
              >
                Delete permanently
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            disabled={pending}
            className="text-sm text-zinc-500 hover:text-zinc-900 disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
