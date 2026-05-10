// Google Drive backup — auth.
//
// Two supported auth modes; the module picks the first that's fully
// configured:
//
//   1. OAuth 2.0 refresh token — the user-facing path. The token represents
//      a real Gmail user, files land in their personal Drive (and count
//      against their 15GB free quota). This is what we use because Service
//      Accounts cannot write to a personal Drive — they have no storage
//      quota of their own and require a Shared Drive (Workspace feature)
//      to host any uploads.
//
//   2. Service Account JSON key — kept as a fallback for when (and if) the
//      org migrates to Workspace + Shared Drives. Saves a future rewrite.
//
// Required env (mode 1):
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   GOOGLE_OAUTH_REFRESH_TOKEN
//   GOOGLE_DRIVE_FOLDER_ID
//
// Optional env (mode 2 fallback):
//   GOOGLE_SERVICE_ACCOUNT_KEY   (raw JSON or base64-wrapped JSON)
//   GOOGLE_DRIVE_FOLDER_ID
//
// If neither mode is fully configured, isDriveConfigured() returns false
// and every Drive-related call short-circuits without throwing — the
// invoice flow stays fully functional even when the backup is off.

import { google, type drive_v3 } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/drive"];

let cachedClient: drive_v3.Drive | null = null;

// ─────────────────────────────────────────────────────────────────────────
// Mode 1 — OAuth 2.0 refresh token
// ─────────────────────────────────────────────────────────────────────────

function readOAuthCreds(): {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
} | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

// ─────────────────────────────────────────────────────────────────────────
// Mode 2 — Service Account
// ─────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────

export function isDriveConfigured(): boolean {
  if (!process.env.GOOGLE_DRIVE_FOLDER_ID) return false;
  return !!readOAuthCreds() || !!readServiceAccountKey();
}

export function driveRootFolderId(): string | null {
  return process.env.GOOGLE_DRIVE_FOLDER_ID ?? null;
}

export function driveAuthMode(): "oauth" | "service-account" | null {
  if (readOAuthCreds()) return "oauth";
  if (readServiceAccountKey()) return "service-account";
  return null;
}

export function getDriveClient(): drive_v3.Drive | null {
  if (cachedClient) return cachedClient;

  // Prefer OAuth — it's what works for personal Gmail.
  const oauth = readOAuthCreds();
  if (oauth) {
    const client = new google.auth.OAuth2({
      clientId: oauth.clientId,
      clientSecret: oauth.clientSecret,
    });
    client.setCredentials({ refresh_token: oauth.refreshToken });
    cachedClient = google.drive({ version: "v3", auth: client });
    return cachedClient;
  }

  // Fallback: Service Account (only useful with Shared Drives).
  const sa = readServiceAccountKey();
  if (sa) {
    const auth = new google.auth.JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes: SCOPES,
    });
    cachedClient = google.drive({ version: "v3", auth });
    return cachedClient;
  }

  return null;
}
