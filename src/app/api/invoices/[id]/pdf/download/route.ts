// GET /api/invoices/[id]/pdf/download
// Auth-gated PDF stream with a pretty "{project} {unit}.pdf" filename. If a
// PDF does not exist yet, regenerate it.
//
// Blobs are now uploaded with access: "public", so pdfUrl is directly
// reachable by HTTP and we just proxy it through here. This endpoint is
// retained because the raw blob URL has a random pathname — users who want
// a nice filename in Save As / Print dialogs still go through this route.

import { NextResponse } from "next/server";
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
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  let url = inv.pdfUrl;
  if (!url) {
    try {
      const gen = await regenerateInvoicePdf(id, session.user.id);
      url = gen.url;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Generation error";
      return NextResponse.json(
        { error: message },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  // Public blob URL → plain fetch, no token needed. We still proxy the body
  // so we control Content-Disposition (pretty filename) and the inline flag.
  // If the stored URL points at a now-dead private store (legacy rows that
  // haven't been re-generated since the migration), self-heal by regenerating
  // the PDF into the current public store and retrying once.
  let upstream = await fetch(url);
  if (upstream.status === 403 || upstream.status === 404) {
    try {
      const gen = await regenerateInvoicePdf(id, session.user.id);
      url = gen.url;
      upstream = await fetch(url);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Regen error";
      return NextResponse.json(
        { error: `PDF regen failed: ${message}` },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `PDF not reachable in storage (${upstream.status})` },
      { status: 404, headers: { "Cache-Control": "no-store" } },
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
  const upstreamLength = upstream.headers.get("content-length");
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") ?? "application/pdf",
      ...(upstreamLength ? { "Content-Length": upstreamLength } : {}),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
