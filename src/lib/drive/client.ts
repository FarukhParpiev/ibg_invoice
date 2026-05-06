// Google Drive backup — auth.
//
// Disaster-recovery copy of every generated invoice/receipt PDF lives on a
// Google Drive folder shared with a Service Account. Credentials are taken
// from two environment variables:
//
//   GOOGLE_SERVICE_ACCOUNT_KEY  — the contents of the Service Account JSON
//                                 key file, as a single string. We accept
//                                 either raw JSON or base64-encoded JSON
//                                 (the latter avoids escape headaches when
//                                 pasting into Vercel env settings).
//   GOOGLE_DRIVE_FOLDER_ID      — the ID of the root folder on Drive (the
//                                 Service Account email must have Editor
//                                 access to it). Read from the URL after
//                                 .../folders/.
//
// Both are optional. If either is missing, isDriveConfigured() returns
// false and every Drive-related call short-circuits without throwing — the
// invoice flow stays fully functional even when the backup is off.

import { google, type drive_v3 } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/drive"];

let cachedClient: drive_v3.Drive | null = null;

function readServiceAccountKey(): {
  client_email: string;
  private_key: string;
} | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  let json: string;
  // Tolerate either raw JSON or base64-wrapped JSON. Vercel's env editor
  // is happier with the base64 form (no quoting surprises with newlines).
  if (raw.trim().startsWith("{")) {
    json = raw;
  } else {
    try {
      json = Buffer.from(raw, "base64").toString("utf8");
    } catch {
      return null;
    }
  }
  try {
    const parsed = JSON.parse(json) as {
      client_email?: string;
      private_key?: string;
    };
    if (!parsed.client_email || !parsed.private_key) return null;
    // Vercel sometimes mangles \n inside private_key when entered as a
    // multi-line string. Normalize literal backslash-n into real newlines.
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

export function isDriveConfigured(): boolean {
  return !!readServiceAccountKey() && !!process.env.GOOGLE_DRIVE_FOLDER_ID;
}

export function driveRootFolderId(): string | null {
  return process.env.GOOGLE_DRIVE_FOLDER_ID ?? null;
}

export function getDriveClient(): drive_v3.Drive | null {
  if (cachedClient) return cachedClient;
  const key = readServiceAccountKey();
  if (!key) return null;
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: SCOPES,
  });
  cachedClient = google.drive({ version: "v3", auth });
  return cachedClient;
}
