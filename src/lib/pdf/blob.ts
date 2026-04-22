// Загрузка PDF в Vercel Blob + получение прямой (permalink) ссылки.
// Путь делаем непредсказуемым: invoices/<invoiceId>/<timestamp>-<hash>.pdf,
// чтобы сырой URL было сложно подобрать; для защищённой выдачи
// используем auth-gated redirect (см. /api/invoices/[id]/pdf/download).

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
    // игнорируем — файла может уже не быть
  }
}
