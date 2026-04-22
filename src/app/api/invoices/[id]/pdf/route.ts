// POST /api/invoices/[id]/pdf — регенерирует PDF и возвращает ссылку.
// Требует super_admin.

import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { regenerateInvoicePdf } from "@/lib/pdf/pipeline";
import { revalidatePath } from "next/cache";

// Puppeteer не должен запускаться в edge — принудительно nodejs runtime.
export const runtime = "nodejs";
// PDF-рендеринг может занять время — поднимаем лимит для Vercel.
export const maxDuration = 60;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireSuperAdmin();
  const { id } = await ctx.params;

  try {
    const res = await regenerateInvoicePdf(id, session.user.id);
    revalidatePath(`/admin/invoices/${id}`);
    return NextResponse.json({ ok: true, url: res.url, size: res.size });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ошибка генерации PDF";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
