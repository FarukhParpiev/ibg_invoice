// GET /api/invoices/[id]/pdf/download
// Auth-gated редирект на Vercel Blob. Если PDF ещё нет — регенерируем.
// Требует super_admin.

import { NextResponse } from "next/server";
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
    select: { pdfUrl: true },
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

  return NextResponse.redirect(url, 302);
}
