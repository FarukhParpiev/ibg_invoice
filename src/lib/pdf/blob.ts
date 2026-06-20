// PDF upload to Vercel Blob. PDFs are uploaded with `access: "public"` so
// that the returned URL is a permanent shareable link — the user pastes it
// into CRM deal cards, and the other side can open the PDF without needing
// an account. The path includes a timestamp + random nonce, so the URL is
// unguessable in practice.
// The auth-gated /api/invoices/[id]/pdf/download route is still kept as the
// "pretty filename" download entrypoint used by the in-app UI.

import { put, del } from "@vercel/blob";
import { randomBytes } from "node:crypto";
import type { Location } from "@prisma/client";

export type UploadedPdf = {
  url: string;
  pathname: string;
  uploadedAt: string;
  size: number;
};

// PDFs are foldered by location first, so the Blob store mirrors the
// Phuket/Pattaya split (invoices/phuket/<id>/… and invoices/pattaya/<id>/…).
function makeKey(
  invoiceId: string,
  number: string | null,
  location: Location,
): string {
  const slug = (number ?? "draft").replace(/[^a-zA-Z0-9_-]+/g, "_");
  const stamp = Date.now();
  const nonce = randomBytes(6).toString("hex");
  return `invoices/${location}/${invoiceId}/${stamp}-${nonce}-${slug}.pdf`;
}

export async function uploadInvoicePdf(
  invoiceId: string,
  number: string | null,
  location: Location,
  pdf: Buffer,
): Promise<UploadedPdf> {
  const pathname = makeKey(invoiceId, number, location);
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
