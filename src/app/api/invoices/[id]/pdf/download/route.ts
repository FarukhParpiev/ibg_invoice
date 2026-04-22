// GET /api/invoices/[id]/pdf/download
// Auth-gated стрим PDF из приватного Vercel Blob. Если PDF ещё нет —
// регенерируем. Требует super_admin.
//
// Редирект не подходит: store приватный, blob.url требует токен, который
// браузер не знает. Поэтому тянем поток через get() с серверным токеном
// и отдаём клиенту напрямую.

import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { regenerateInvoicePdf } from "@/lib/pdf/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireSuperAdmin();
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
      const message = err instanceof Error ? err.message : "Ошибка генерации";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const result = await get(url, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return NextResponse.json({ error: "PDF не найден в хранилище" }, { status: 404 });
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
