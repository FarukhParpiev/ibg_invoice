// POST /api/admin/regenerate-pdfs
//
// One-shot migration endpoint: regenerates the PDF for every invoice whose
// pdfUrl still points at the old private Vercel Blob store. After the project
// switched to a public Blob store, old URLs return 403 on fetch() — this
// endpoint walks the table and re-generates each into the new public store,
// overwriting invoice.pdfUrl with the new public URL.
//
// Safe to re-run: a pdfUrl that already lives on the new (current) store is
// left untouched. Super-admin only.
//
// Usage:
//   curl -X POST https://.../api/admin/regenerate-pdfs  (while logged in)
// or hit it via browser devtools from the admin panel.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { regenerateInvoicePdf } from "@/lib/pdf/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

// Accept either a super-admin session (button on /admin) or a bearer token
// matching MIGRATION_SECRET (for curl during one-shot infra migration).
async function authorize(req: Request): Promise<{ actorId: string | null } | { error: string; status: number }> {
  const secret = process.env.MIGRATION_SECRET;
  const auth_header = req.headers.get("authorization");
  if (secret && auth_header === `Bearer ${secret}`) {
    return { actorId: null };
  }
  const session = await auth();
  if (session?.user?.role === "super_admin") {
    return { actorId: session.user.id };
  }
  return { error: "Forbidden", status: 403 };
}

type RowResult =
  | { id: string; number: string | null; status: "skipped"; reason: string }
  | { id: string; number: string | null; status: "regenerated"; oldUrl: string; newUrl: string }
  | { id: string; number: string | null; status: "error"; error: string };

export async function POST(req: Request) {
  const authResult = await authorize(req);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }
  const actorId = authResult.actorId;

  // Detect the "current" blob host from BLOB_READ_WRITE_TOKEN indirectly: we
  // don't have it, but we can probe by looking at the most recently regenerated
  // pdfUrl. Simpler heuristic: any URL containing ".private.blob." is old;
  // anything else we assume is already on the new public store.
  const invoices = await prisma.invoice.findMany({
    where: {
      pdfUrl: { not: null },
      status: { in: ["issued", "paid", "cancelled"] },
    },
    select: { id: true, number: true, pdfUrl: true },
    orderBy: { issueDate: "asc" },
  });

  const results: RowResult[] = [];
  let regenerated = 0;
  let skipped = 0;
  let errors = 0;

  for (const inv of invoices) {
    const oldUrl = inv.pdfUrl!;
    const isOldPrivate = oldUrl.includes(".private.blob.");
    if (!isOldPrivate) {
      results.push({
        id: inv.id,
        number: inv.number,
        status: "skipped",
        reason: "already on public store",
      });
      skipped++;
      continue;
    }
    try {
      const gen = await regenerateInvoicePdf(inv.id, actorId);
      results.push({
        id: inv.id,
        number: inv.number,
        status: "regenerated",
        oldUrl,
        newUrl: gen.url,
      });
      regenerated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      results.push({ id: inv.id, number: inv.number, status: "error", error: msg });
      errors++;
    }
  }

  return NextResponse.json({
    ok: true,
    total: invoices.length,
    regenerated,
    skipped,
    errors,
    results,
  });
}
