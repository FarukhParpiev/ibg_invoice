// POST /api/instructions/upload-image
// Image upload endpoint for the Instructions Markdown editor. Accepts a
// multipart/form-data with field "file"; uploads to public Vercel Blob and
// returns the URL ready to be embedded as ![alt](url) in the body.
//
// Super-admin only — only super-admins are allowed to edit instructions, so
// only super-admins should be able to upload images for them. We validate
// MIME type and size to keep junk out of the public bucket.

import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { randomBytes } from "node:crypto";
import { requireSuperAdmin } from "@/lib/auth-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MiB ceiling — screenshots, not 4K photos
const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

export async function POST(req: Request) {
  await requireSuperAdmin();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "Missing file field" },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json(
      { ok: false, error: "Empty file" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` },
      { status: 413 },
    );
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Unsupported type: ${file.type || "unknown"}. Use PNG, JPG, WebP, GIF or SVG.`,
      },
      { status: 415 },
    );
  }

  // Build a safe key. Strip the directory portion of the original filename;
  // browsers occasionally send paths on Windows.
  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/jpeg"
        ? "jpg"
        : file.type === "image/webp"
          ? "webp"
          : file.type === "image/gif"
            ? "gif"
            : "svg";
  const stamp = Date.now();
  const nonce = randomBytes(6).toString("hex");
  const safeName =
    file.name
      .replace(/^.*[\\/]/, "")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .slice(0, 60) || "image";
  const pathname = `instructions/${stamp}-${nonce}-${safeName}.${ext}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const blob = await put(pathname, buffer, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: false,
    });
    return NextResponse.json({
      ok: true,
      url: blob.url,
      pathname: blob.pathname,
      size: file.size,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
