// GET /api/invoices/[id]/pdf/download
// Auth-gated PDF stream from private Vercel Blob. If a PDF does not exist yet,
// regenerate it. Requires super_admin.
//
// A redirect is not an option: the store is private, blob.url needs a token
// that the browser doesn't have. So we pull the stream through get() with a
// server-side token and hand it to the client directly.

import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireAdminAccess } from "@/lib/auth-helpers";
import { regenerateInvoicePdf } from "@/lib/pdf/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminAccess();
  const { id } = await ctx.params;

  // ?inline=1 switches from "attachment" (browser offers Save As) to "inline"
  // (browser renders it in an iframe / PDF viewer). Used by the in-app preview
  // on the invoice detail page.
  const inline = new URL(req.url).searchParams.get("inline") === "1";

  const inv = await prisma.invoice.findUnique({
    where: { id },
    select: {
      pdfUrl: true,
      number: true,
      items: {
        orderBy: { positionNo: "asc" },
        take: 1,
        select: { projectName: true, unitCode: true },
      },
    },
  });
  if (!inv) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let url = inv.pdfUrl;
  if (!url) {
    try {
      const gen = await regenerateInvoicePdf(id, session.user.id);
      url = gen.url;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Generation error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const result = await get(url, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return NextResponse.json(
      { error: "PDF not found in storage" },
      { status: 404 },
    );
  }

  // CRM workflow: the filename is pasted straight into a deal card, so it
  // should read as "{Project} {Unit}.pdf". Fall back to the invoice number
  // when the first line item has no project info (e.g. ad-hoc receipts).
  const first = inv.items[0];
  const titleParts = [first?.projectName, first?.unitCode]
    .map((s) => s?.trim())
    .filter((s): s is string => !!s);
  const title = titleParts.length > 0 ? titleParts.join(" ") : (inv.number ?? "invoice");
  // Keep Unicode (Thai/Cyrillic project names are common) but strip characters
  // that break Content-Disposition parsing across browsers.
  const safeTitle = title.replace(/["\\/:*?<>|\r\n]+/g, "_").trim() || "invoice";
  const filename = `${safeTitle}.pdf`;
  // Content-Disposition only allows ASCII in the unquoted `filename=`; for
  // Thai / Cyrillic project names we need RFC 5987 `filename*=`. Keep both
  // so older clients that ignore filename* still get an ASCII fallback.
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_");
  return new NextResponse(result.stream, {
    status: 200,
    headers: {
      "Content-Type": result.blob.contentType ?? "application/pdf",
      "Content-Length": String(result.blob.size ?? ""),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
