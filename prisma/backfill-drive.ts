// One-shot backfill: for every invoice/receipt that already has a PDF in
// Vercel Blob but no driveFileId, fetch the PDF and upload it to Google
// Drive. Idempotent: rows that already have a driveFileId are skipped.
//
// Run via: `npx tsx prisma/backfill-drive.ts`
//
// Required env: GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_DRIVE_FOLDER_ID
//
// Safe to re-run after a partial failure — it picks up where it left off.

import { PrismaClient } from "@prisma/client";
import { isDriveConfigured } from "../src/lib/drive/client";
import { syncInvoiceToDrive } from "../src/lib/drive/sync";

const prisma = new PrismaClient();

async function fetchPdf(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url} → HTTP ${res.status}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

async function main(): Promise<void> {
  if (!isDriveConfigured()) {
    console.error(
      "GOOGLE_SERVICE_ACCOUNT_KEY and GOOGLE_DRIVE_FOLDER_ID must be set.",
    );
    process.exit(1);
  }

  const targets = await prisma.invoice.findMany({
    where: {
      pdfUrl: { not: null },
      driveFileId: null,
      // Skip drafts (they don't have proper numbers anyway).
      status: { not: "draft" },
    },
    orderBy: { issueDate: "asc" },
    select: { id: true, number: true, type: true, pdfUrl: true },
  });

  console.log(`Found ${targets.length} invoice(s)/receipt(s) to back up.`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const t of targets) {
    if (!t.pdfUrl) {
      skipped++;
      continue;
    }
    const tag = `${t.type} ${t.number ?? "(no number)"} (${t.id.slice(0, 8)})`;
    try {
      process.stdout.write(`  · ${tag} … `);
      const pdf = await fetchPdf(t.pdfUrl);
      const res = await syncInvoiceToDrive(t.id, pdf);
      if (res.ok) {
        ok++;
        process.stdout.write("uploaded\n");
      } else {
        skipped++;
        process.stdout.write(`skipped (${res.reason ?? "unknown"})\n`);
      }
    } catch (err) {
      failed++;
      process.stdout.write(
        `failed: ${err instanceof Error ? err.message : err}\n`,
      );
    }
  }

  console.log(
    `\nDone. uploaded=${ok} skipped=${skipped} failed=${failed} total=${targets.length}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
