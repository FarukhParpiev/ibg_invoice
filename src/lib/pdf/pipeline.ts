// Glues everything together: loads the invoice from the DB, renders HTML → PDF,
// uploads to Vercel Blob, writes pdfUrl and pdfVersions back to the DB.
// Also fires off a background copy to Google Drive (best-effort backup).

import { prisma } from "@/lib/prisma";
import { renderInvoiceHtml, type InvoicePdfData } from "./template";
import { renderHtmlToPdf } from "./generate";
import { uploadInvoicePdf } from "./blob";
import { syncInvoiceToDriveInBackground } from "@/lib/drive/sync";

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
  if (!inv) throw new Error("Invoice not found");
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

  // We keep a version history — JSON array in Invoice.pdfVersions
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

  // Mirror the same buffer to Google Drive in the background. We hand the
  // function the in-memory PDF directly to skip an extra round-trip back
  // through Vercel Blob. Any failure is logged and otherwise swallowed —
  // Drive is a backup, not a gate on the user-visible flow.
  syncInvoiceToDriveInBackground(invoiceId, pdf);

  return { url: uploaded.url, size: uploaded.size };
}
