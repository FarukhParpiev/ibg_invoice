"use client";

// Form for creating / editing an instruction. Markdown body is a plain
// <textarea> with a live preview pane on the right. Image upload writes
// to Vercel Blob via /api/instructions/upload-image and inserts the
// resulting Markdown link at the cursor position.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Mode =
  | { kind: "create" }
  | {
      kind: "edit";
      id: string;
      initial: { title: string; bodyMd: string; position: number; slug: string };
    };

export function InstructionForm({
  mode,
  action,
  onDelete,
}: {
  mode: Mode;
  action: (formData: FormData) => Promise<{ ok: false; error: string } | void>;
  onDelete?: () => Promise<void>;
}) {
  const router = useRouter();
  const initial =
    mode.kind === "edit"
      ? mode.initial
      : { title: "", bodyMd: "", position: 0, slug: "" };

  const [title, setTitle] = useState(initial.title);
  const [bodyMd, setBodyMd] = useState(initial.bodyMd);
  const [position, setPosition] = useState(String(initial.position));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewing, setPreviewing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await action(fd);
      if (res && res.ok === false) setError(res.error);
      // Success path redirects on the server side.
    });
  };

  const handleDelete = () => {
    if (!onDelete) return;
    if (
      !confirm(
        "Delete this article permanently? This cannot be undone.",
      )
    )
      return;
    startTransition(async () => {
      await onDelete();
    });
  };

  const insertAtCursor = (text: string) => {
    const el = textareaRef.current;
    if (!el) {
      setBodyMd((b) => b + text);
      return;
    }
    const start = el.selectionStart ?? bodyMd.length;
    const end = el.selectionEnd ?? bodyMd.length;
    const next = bodyMd.slice(0, start) + text + bodyMd.slice(end);
    setBodyMd(next);
    // Restore cursor just after the inserted text on the next paint.
    setTimeout(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleImageUpload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/instructions/upload-image", {
        method: "POST",
        body: fd,
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.url) {
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }
      const alt = file.name.replace(/\.[^.]+$/, "").slice(0, 60);
      insertAtCursor(`\n\n![${alt}](${body.url})\n\n`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-uploading the same file
    files.forEach(handleImageUpload);
  };

  const togglePreview = async () => {
    if (previewing) {
      setPreviewing(false);
      return;
    }
    // Preview is rendered by the same /api/instructions/upload-image host
    // route — keep the markdown -> HTML conversion server-side so we don't
    // ship marked to the client. The endpoint accepts md and returns html.
    try {
      const res = await fetch("/api/instructions/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ md: bodyMd }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        html?: string;
        error?: string;
      };
      if (!res.ok || !body.ok || typeof body.html !== "string") {
        setError(body.error ?? "Preview failed");
        return;
      }
      setPreviewHtml(body.html);
      setPreviewing(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-5xl">
      <div>
        <label className="text-xs uppercase tracking-wide text-zinc-500">
          Title
        </label>
        <input
          name="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full border rounded px-3 py-2 mt-1"
          placeholder="How to issue an invoice"
        />
      </div>

      <div>
        <label className="text-xs uppercase tracking-wide text-zinc-500">
          Position (lower = higher in the list)
        </label>
        <input
          name="position"
          type="number"
          min={0}
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          className="w-32 border rounded px-3 py-2 mt-1"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs uppercase tracking-wide text-zinc-500">
            Body (Markdown)
          </label>
          <div className="flex items-center gap-2">
            <label className="text-xs border rounded px-2 py-1 cursor-pointer hover:bg-zinc-50">
              {uploading ? "Uploading…" : "📷 Insert image"}
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileInput}
                disabled={uploading}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={togglePreview}
              className="text-xs border rounded px-2 py-1 hover:bg-zinc-50"
            >
              {previewing ? "Edit" : "Preview"}
            </button>
          </div>
        </div>

        {previewing ? (
          <div
            className="instruction-body min-h-[300px] border rounded p-4 bg-white"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        ) : (
          <textarea
            name="bodyMd"
            ref={textareaRef}
            value={bodyMd}
            onChange={(e) => setBodyMd(e.target.value)}
            rows={20}
            className="w-full border rounded px-3 py-2 font-mono text-sm leading-relaxed"
            placeholder={`# Heading\n\nText with **bold** and a list:\n\n- Step 1\n- Step 2\n\nClick «Insert image» above to upload screenshots.`}
          />
        )}
        <p className="text-xs text-zinc-500 mt-1">
          Markdown supported: <code>**bold**</code>, <code>*italic*</code>,{" "}
          <code># headings</code>, <code>- bullets</code>, links, tables, code
          blocks, inline images via the button above.
        </p>
      </div>

      {error && (
        <div className="text-sm rounded bg-red-50 text-red-700 px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-40"
          >
            {pending
              ? "Saving…"
              : mode.kind === "edit"
                ? "Save changes"
                : "Publish article"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/admin/instructions")}
            disabled={pending}
            className="border rounded px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
        {mode.kind === "edit" && onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="text-sm text-red-600 hover:text-red-800 disabled:opacity-40"
          >
            Delete article
          </button>
        )}
      </div>
    </form>
  );
}
