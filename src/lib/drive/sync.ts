// Glue layer between the invoice domain and the Drive upload primitive.
// Knows how to build the filename + description from a full Invoice (with
// items + counterparty + company), and how to persist the resulting Drive
// IDs back to the invoice row.

import { prisma } from "@/lib/prisma";
import {
  buildDriveDescription,
  buildDriveFilename,
  uploadInvoiceToDrive,
  deleteFromDrive,
} from "./upload";
import { isDriveConfigured } from "./client";

function formatTotal(value: { toString(): string }, currency: string): string {
  // Avoid pulling in the heavy invoice-format helpers here — we just want a
  // stable, human-readable string for the description field.
  const n = Number(value.toString());
  if (!Number.isFinite(n)) return `${value.toString()} ${currency}`;
  return `${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

// Synchronously upload the freshly generated PDF to Drive and write the
// returned IDs back onto the invoice row. Best-effort: we swallow errors
// inside this function so the caller can choose to fire-and-forget. The
// PDF flow itself never blocks on Drive — Drive is a backup, not a gate.
export async function syncInvoiceToDrive(
  invoiceId: string,
  pdf: Buffer,
): Promise<{ ok: boolean; reason?: string }> {
  if (!isDriveConfigured()) {
    return { ok: false, reason: "drive-not-configured" };
  }

  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      items: { orderBy: { positionNo: "asc" } },
      counterparty: { select: { name: true } },
      ourCompany: { select: { name: true } },
    },
  });
  if (!inv) return { ok: false, reason: "invoice-not-found" };

  // Drive backup is for published artefacts. A draft has no number → there's
  // nothing usefully searchable, and the PDF will be regenerated later.
  if (inv.status === "draft" || !inv.number) {
    return { ok: false, reason: "draft-or-unnumbered" };
  }

  // Pick the first non-empty project/unit pair to put in the filename.
  // Single-item invoices are common; multi-item ones get the first item in
  // the name and the rest in the description.
  const firstItem = inv.items.find((it) => it.projectName || it.unitCode);
  const filename = buildDriveFilename({
    number: inv.number,
    counterpartyName: inv.counterparty.name,
    projectName: firstItem?.projectName ?? null,
    unitCode: firstItem?.unitCode ?? null,
    isReceipt: inv.type === "receipt",
  });

  const projectsAndUnits = inv.items
    .map((it) => [it.projectName, it.unitCode].filter(Boolean).join(" "))
    .filter((s) => s.length > 0)
    .slice(0, 5);

  const description = buildDriveDescription({
    number: inv.number,
    type: inv.type,
    status: inv.status,
    counterpartyName: inv.counterparty.name,
    companyName: inv.ourCompany.name,
    total: formatTotal(inv.total, inv.primaryCurrency),
    projectsAndUnits,
  });

  try {
    const result = await uploadInvoiceToDrive({
      issueDate: inv.issueDate,
      filename,
      description,
      pdf,
      existingFileId: inv.driveFileId ?? null,
    });
    if (!result) return { ok: false, reason: "drive-not-configured" };

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        driveFileId: result.fileId,
        driveFolderId: result.folderId,
        driveUploadedAt: new Date(),
        driveWebViewLink: result.webViewLink,
      },
    });
    return { ok: true };
  } catch (err) {
    console.error("[drive] syncInvoiceToDrive failed", err);
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "unknown",
    };
  }
}

// Fire-and-forget wrapper for use inside the regular PDF flow. We log
// outcomes for observability but never throw — the caller's response is
// already going back to the user by the time this resolves.
export function syncInvoiceToDriveInBackground(
  invoiceId: string,
  pdf: Buffer,
): void {
  if (!isDriveConfigured()) return;
  void syncInvoiceToDrive(invoiceId, pdf).then((res) => {
    if (!res.ok && res.reason && res.reason !== "draft-or-unnumbered") {
      console.warn(
        `[drive] background sync skipped for ${invoiceId}: ${res.reason}`,
      );
    }
  });
}

export async function deleteInvoiceFromDrive(
  invoiceId: string,
): Promise<void> {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { driveFileId: true },
  });
  if (!inv?.driveFileId) return;
  await deleteFromDrive(inv.driveFileId);
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      driveFileId: null,
      driveFolderId: null,
      driveUploadedAt: null,
      driveWebViewLink: null,
    },
  });
}
