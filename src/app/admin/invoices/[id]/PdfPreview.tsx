"use client";

// In-app PDF viewer for the invoice detail page. Streams through our auth-gated
// /api/invoices/[id]/pdf/download?inline=1 endpoint (Content-Disposition: inline)
// so the browser's native PDF plugin renders it. The Print button asks the
// iframe to print — if popup blockers interfere we fall back to window.open.

import { useRef, useState } from "react";

export function PdfPreview({ invoiceId }: { invoiceId: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Cache-busting token: bumping it forces the iframe to re-fetch after the
  // user hits "Regenerate PDF" without reloading the whole detail page.
  // Seed from Date.now() so that even if the browser cached an earlier error
  // response for this route (e.g. a 404/403 before the blob was migrated)
  // we don't surface it on page reload.
  const [v, setV] = useState<number>(() => Date.now());

  const src = `/api/invoices/${invoiceId}/pdf/download?inline=1&v=${v}`;

  const handlePrint = () => {
    // Same-origin iframe → we can call print() on its contentWindow. Chrome
    // blocks this if the PDF is still loading; opening a fresh tab is the
    // safe fallback for the rare stuck case.
    try {
      const win = iframeRef.current?.contentWindow;
      if (win) {
        win.focus();
        win.print();
        return;
      }
    } catch {
      // fall through
    }
    window.open(src, "_blank");
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <div className="flex items-center justify-between border-b px-4 py-2 bg-zinc-50">
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          PDF preview
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setV(Date.now())}
            className="text-xs border rounded px-2.5 py-1 hover:bg-white"
            title="Reload the preview (useful after Regenerate PDF)"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="text-xs bg-black text-white rounded px-2.5 py-1 hover:bg-zinc-800"
          >
            Print
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="text-xs border rounded px-2.5 py-1 hover:bg-white"
          >
            {collapsed ? "Show" : "Hide"}
          </button>
        </div>
      </div>
      {!collapsed && (
        <iframe
          ref={iframeRef}
          src={src}
          title="Invoice PDF"
          className="w-full bg-zinc-100"
          style={{ height: "80vh", border: "none" }}
        />
      )}
    </div>
  );
}
