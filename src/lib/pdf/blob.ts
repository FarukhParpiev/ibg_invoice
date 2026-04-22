// PDF upload to Vercel Blob. The store is configured as private — we
// serve the PDF only through the auth-gated stream at
// /api/invoices/[id]/pdf/download.
// blob.url in the DB is a reference for a later get(), not a public URL:
// you cannot open it directly in the browser, a token is required.

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
    access: "private",
    contentType: "application/pdf",
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
