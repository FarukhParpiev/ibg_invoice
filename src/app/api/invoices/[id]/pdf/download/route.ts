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
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminAccess();
  const { id } = await ctx.params;

  const inv = await prisma.invoice.findUnique({
    where: { id },
    select: { pdfUrl: true, number: true },
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

  const filename = `${inv.number ?? "invoice"}.pdf`.replace(/[^A-Za-z0-9._-]/g, "_");
  return new NextResponse(result.stream, {
    status: 200,
    headers: {
      "Content-Type": result.blob.contentType ?? "application/pdf",
      "Content-Length": String(result.blob.size ?? ""),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
