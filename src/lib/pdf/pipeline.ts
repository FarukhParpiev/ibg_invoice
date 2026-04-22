// Собирает всё вместе: подтягивает инвойс из БД, рендерит HTML → PDF,
// заливает в Vercel Blob, записывает pdfUrl и pdfVersions в БД.

import { prisma } from "@/lib/prisma";
import { renderInvoiceHtml, type InvoicePdfData } from "./template";
import { renderHtmlToPdf } from "./generate";
import { uploadInvoicePdf } from "./blob";

export type PdfVersion = {
  url: string;
  generatedAt: string;
  by: string | null;
  size: number;
};

async function loadInvoiceForPdf(id: string): Promise<InvoicePdfData> {
  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: {
      items: { orderBy: { positionNo: "asc" } },
      ourCompany: true,
      ourBankAccount: true,
      counterparty: true,
      paymentTerms: true,
    },
  });
  if (!inv) throw new Error("Инвойс не найден");
  return inv;
}

export async function regenerateInvoicePdf(
  invoiceId: string,
  actorUserId: string | null,
): Promise<{ url: string; size: number }> {
  const data = await loadInvoiceForPdf(invoiceId);
  const html = renderInvoiceHtml(data);
  const pdf = await renderHtmlToPdf(html);
  const uploaded = await uploadInvoicePdf(invoiceId, data.number, pdf);

  // Поддерживаем историю версий — JSON массив в Invoice.pdfVersions
  const prev = Array.isArray(data.pdfVersions)
    ? (data.pdfVersions as unknown as PdfVersion[])
    : [];

  const version: PdfVersion = {
    url: uploaded.url,
    generatedAt: uploaded.uploadedAt,
    by: actorUserId,
    size: uploaded.size,
  };

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      pdfUrl: uploaded.url,
      pdfVersions: [...prev, version] as unknown as object,
    },
  });

  return { url: uploaded.url, size: uploaded.size };
}
