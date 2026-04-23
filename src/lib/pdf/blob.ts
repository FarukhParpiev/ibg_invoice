// PDF upload to Vercel Blob. PDFs are uploaded with `access: "public"` so
// that the returned URL is a permanent shareable link — the user pastes it
// into CRM deal cards, and the other side can open the PDF without needing
// an account. The path includes a timestamp + random nonce, so the URL is
// unguessable in practice.
// The auth-gated /api/invoices/[id]/pdf/download route is still kept as the
// "pretty filename" download entrypoint used by the in-app UI.

import { put, del } from "@vercel/blob";
import { randomBytes } from "node:crypto";

export type UploadedPdf = {
  url: string;
  pathname: string;
  uploadedAt: string;
  size: number;
};

function makeKey(invoiceId: string, number: string | null): string {
  const slug = (number ?? "draft").replace(/[^a-zA-Z0-9_-]+/g, "_");
  const stamp = Date.now();
  const nonce = randomBytes(6).toString("hex");
  return `invoices/${invoiceId}/${stamp}-${nonce}-${slug}.pdf`;
}

export async function uploadInvoicePdf(
  invoiceId: string,
  number: string | null,
  pdf: Buffer,
): Promise<UploadedPdf> {
  const pathname = makeKey(invoiceId, number);
  const blob = await put(pathname, pdf, {
    access: "public",
    contentType: "application/pdf",
    // makeKey already injects a 48-bit hex nonce + timestamp, which is
    // unguessable enough. Skipping the suffix keeps the URL stable once
    // we've written the DB record.
    addRandomSuffix: false,
  });
  return {
    url: blob.url,
    pathname: blob.pathname,
    uploadedAt: new Date().toISOString(),
    size: pdf.byteLength,
  };
}

export async function deleteBlob(url: string): Promise<void> {
  try {
    await del(url);
  } catch {
    // ignore — the file may already be gone
  }
}
