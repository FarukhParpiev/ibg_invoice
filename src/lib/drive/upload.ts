// Google Drive backup — upload + folder management.
//
// Why we need this: PDFs in Vercel Blob have unguessable URLs and are bound
// to our Vercel project. If anything ever goes sideways with the app, the
// finance team should still be able to open the company's Google Drive,
// navigate to `IBG Invoices Backup/2026/05/` and find the right file by
// invoice number, counterparty name, project name or unit code. So this
// module is purely about being a recoverable mirror — not a primary store.
//
// Folder layout
//   IBG Invoices Backup/             <- root, configured via GOOGLE_DRIVE_FOLDER_ID
//   ├── 2026/
//   │   ├── 04/
//   │   │   ├── 23-04-2026-0001_John Smith Sky Park A-205.pdf
//   │   │   └── 23-04-2026-0001-R_John Smith Sky Park A-205.pdf
//   │   └── 05/
//   │       └── 02-05-2026-0020_Acme Co Pearl B-1207.pdf
//   └── 2025/...
//
// Filename
//   `{number-with-slashes-replaced}_{counterparty} {project} {unit}.pdf`
//   — every searchable attribute lives in the name, so Drive's built-in
//   substring search ("any word matches" semantics) finds the file no matter
//   which one the user remembers.
//
// Drive `description` field
//   We additionally put the *original* invoice number (with slashes), the
//   counterparty name, project, unit and the total amount into the file's
//   description so Drive search by description ALSO works — useful when the
//   user pastes the canonical "23/04/2026-0001" form.

import { Readable } from "node:stream";
import {
  driveRootFolderId,
  getDriveClient,
  isDriveConfigured,
} from "./client";

// ─────────────────────────────────────────────────────────────────────────
// Folder cache
// We resolve year/month subfolders lazily, then cache their IDs in process
// memory. A single Vercel serverless instance might handle multiple invoices
// in a row — no point round-tripping the Drive API for `2026/05` every time.
// ─────────────────────────────────────────────────────────────────────────
const folderCache = new Map<string, string>(); // cache key: parentId/name -> folderId

function cacheKey(parentId: string, name: string): string {
  return `${parentId}/${name}`;
}

async function findOrCreateFolder(
  parentId: string,
  name: string,
): Promise<string> {
  const key = cacheKey(parentId, name);
  const cached = folderCache.get(key);
  if (cached) return cached;

  const drive = getDriveClient();
  if (!drive) throw new Error("Drive client not configured");

  // Check whether the folder already exists under the parent. We use the
  // `name = '...'` selector with parents filter so we don't accidentally
  // pick up a like-named folder elsewhere on the Drive.
  const escaped = name.replace(/'/g, "\\'");
  const list = await drive.files.list({
    q: `'${parentId}' in parents and name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id,name)",
    pageSize: 1,
    spaces: "drive",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const existingId = list.data.files?.[0]?.id;
  if (existingId) {
    folderCache.set(key, existingId);
    return existingId;
  }

  // Create it.
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives: true,
  });
  const id = created.data.id;
  if (!id) throw new Error(`Drive: failed to create folder ${name}`);
  folderCache.set(key, id);
  return id;
}

// Public: get (or create) the year/month folder for an issue date.
export async function ensureYearMonthFolder(
  issueDate: Date,
): Promise<string> {
  const root = driveRootFolderId();
  if (!root) throw new Error("GOOGLE_DRIVE_FOLDER_ID not set");
  // Local-time year/month would be ambiguous on a server timezone; use UTC
  // consistently so the same invoice always lands in the same folder.
  const year = String(issueDate.getUTCFullYear());
  const month = String(issueDate.getUTCMonth() + 1).padStart(2, "0");
  const yearFolder = await findOrCreateFolder(root, year);
  const monthFolder = await findOrCreateFolder(yearFolder, month);
  return monthFolder;
}

// ─────────────────────────────────────────────────────────────────────────
// Filename + description formatting
// ─────────────────────────────────────────────────────────────────────────

// File system / Drive don't strictly forbid much, but we still scrub a few
// characters that confuse some OS file managers when the file is later
// downloaded (slashes, leading dots, colons, etc.).
function safeForFilename(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type DriveFilenameInput = {
  number: string | null; // "23/04/2026-0001" or null for unissued (shouldn't happen post-issue)
  counterpartyName: string;
  projectName: string | null;
  unitCode: string | null;
  isReceipt: boolean; // true: parent number already includes -R; we DON'T add it twice
};

export function buildDriveFilename(input: DriveFilenameInput): string {
  // Slashes can't appear in a filename — replace with hyphens.
  const numberSafe = (input.number ?? "no-number").replace(/\//g, "-");
  const cp = safeForFilename(input.counterpartyName);
  const proj = safeForFilename(input.projectName);
  const unit = safeForFilename(input.unitCode);
  const tail = [cp, proj, unit].filter(Boolean).join(" ");
  // Cap total length — some old finance laptops still trip over 255-char
  // pathnames once you nest the file deep enough.
  const base = tail ? `${numberSafe}_${tail}` : numberSafe;
  return `${base.slice(0, 200)}.pdf`;
}

export function buildDriveDescription(args: {
  number: string | null;
  type: "invoice" | "receipt";
  status: string;
  counterpartyName: string;
  companyName: string;
  total: string; // pre-formatted with currency
  projectsAndUnits: string[]; // first few "{project} {unit}" pairs
}): string {
  const lines = [
    `Invoice ${args.number ?? "(unnumbered)"} — ${args.type} (${args.status})`,
    `Counterparty: ${args.counterpartyName}`,
    `Our company: ${args.companyName}`,
    `Total: ${args.total}`,
  ];
  if (args.projectsAndUnits.length > 0) {
    lines.push(`Projects/Units: ${args.projectsAndUnits.join("; ")}`);
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────
// Upload
// ─────────────────────────────────────────────────────────────────────────

export type DriveUploadResult = {
  fileId: string;
  folderId: string;
  webViewLink: string | null;
  filename: string;
};

export type DriveUploadInput = {
  // Used for picking the year/month folder. Falls back to "now" if absent.
  issueDate: Date | null;
  filename: string;
  description: string;
  pdf: Buffer;
  // If set: overwrite this existing file's contents instead of creating a
  // new one. This keeps the same Drive URL across regenerations and avoids
  // duplicates in the folder for a single invoice.
  existingFileId: string | null;
};

export async function uploadInvoiceToDrive(
  input: DriveUploadInput,
): Promise<DriveUploadResult | null> {
  if (!isDriveConfigured()) return null;
  const drive = getDriveClient();
  if (!drive) return null;

  const folderId = await ensureYearMonthFolder(input.issueDate ?? new Date());

  const media = {
    mimeType: "application/pdf",
    body: Readable.from(input.pdf),
  };

  if (input.existingFileId) {
    // Update path: keep the same file ID, refresh contents + name + description.
    const updated = await drive.files.update({
      fileId: input.existingFileId,
      media,
      requestBody: {
        name: input.filename,
        description: input.description,
      },
      fields: "id,webViewLink,parents",
      supportsAllDrives: true,
    });
    // If the file's parent folder is wrong (e.g. issue date was edited and
    // crossed a month boundary), move it.
    const currentParents = updated.data.parents ?? [];
    if (!currentParents.includes(folderId)) {
      await drive.files.update({
        fileId: input.existingFileId,
        addParents: folderId,
        removeParents: currentParents.join(","),
        fields: "id",
        supportsAllDrives: true,
      });
    }
    return {
      fileId: updated.data.id ?? input.existingFileId,
      folderId,
      webViewLink: updated.data.webViewLink ?? null,
      filename: input.filename,
    };
  }

  // Create path.
  const created = await drive.files.create({
    requestBody: {
      name: input.filename,
      description: input.description,
      parents: [folderId],
    },
    media,
    fields: "id,webViewLink",
    supportsAllDrives: true,
  });
  if (!created.data.id) {
    throw new Error("Drive: file creation returned no id");
  }
  return {
    fileId: created.data.id,
    folderId,
    webViewLink: created.data.webViewLink ?? null,
    filename: input.filename,
  };
}

export async function deleteFromDrive(fileId: string): Promise<void> {
  if (!isDriveConfigured()) return;
  const drive = getDriveClient();
  if (!drive) return;
  try {
    await drive.files.delete({ fileId, supportsAllDrives: true });
  } catch (err) {
    // Same posture as Vercel Blob delete: best-effort, don't blow up if the
    // file is already gone or we lost access.
    console.warn("[drive] delete failed", err);
  }
}
