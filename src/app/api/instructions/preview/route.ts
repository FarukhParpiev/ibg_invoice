// POST /api/instructions/preview
// Renders the editor's Markdown into HTML server-side. Keeps marked out
// of the client bundle. Super-admin only — same gate as the upload route.

import { NextResponse } from "next/server";
import { marked } from "marked";
import { requireSuperAdmin } from "@/lib/auth-helpers";

export const runtime = "nodejs";

export async function POST(req: Request) {
  await requireSuperAdmin();
  const body = (await req.json().catch(() => ({}))) as { md?: unknown };
  if (typeof body.md !== "string") {
    return NextResponse.json(
      { ok: false, error: "Missing 'md' string" },
      { status: 400 },
    );
  }
  marked.setOptions({ gfm: true, breaks: true });
  const html = marked.parse(body.md) as string;
  return NextResponse.json({ ok: true, html });
}
