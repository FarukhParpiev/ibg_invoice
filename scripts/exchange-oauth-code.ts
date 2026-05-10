// Exchange a fresh OAuth authorization code for a refresh token.
//
// Usage: npx tsx scripts/exchange-oauth-code.ts <CODE>
//
// or with a full redirect URL pasted from the browser:
//   npx tsx scripts/exchange-oauth-code.ts 'https://developers.google.com/oauthplayground/?...&code=4/0Ae...&scope=...'
//
// Reads GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET from .env;
// the redirect_uri must match the one whitelisted on the OAuth Client
// (https://developers.google.com/oauthplayground).
//
// On success: prints the refresh token AND patches it back into .env so
// the next backfill / smoke test picks it up automatically.

import { promises as fs } from "node:fs";
import path from "node:path";

const REDIRECT_URI = "https://developers.google.com/oauthplayground";

function extractCode(arg: string): string {
  const trimmed = arg.trim();
  // Accept either a raw code or a full URL with ?code=... in the query.
  if (trimmed.startsWith("http")) {
    try {
      const url = new URL(trimmed);
      const code = url.searchParams.get("code");
      if (!code) throw new Error("no `code` in URL");
      return code;
    } catch (err) {
      throw new Error(`Could not parse URL: ${(err as Error).message}`);
    }
  }
  return trimmed;
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: npx tsx scripts/exchange-oauth-code.ts <CODE_OR_URL>");
    process.exit(1);
  }
  const code = extractCode(arg);

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error(
      "GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set in .env",
    );
    process.exit(1);
  }

  console.log(`Exchanging code (${code.slice(0, 16)}...) for tokens...`);

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    console.error(`Token exchange failed (HTTP ${res.status}):`);
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }

  const refresh = json.refresh_token as string | undefined;
  if (!refresh) {
    console.error("No refresh_token in response. Most likely causes:");
    console.error("  · the code was reused (codes are single-use)");
    console.error("  · the auth URL was missing access_type=offline + prompt=consent");
    console.error("Full response:");
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }

  console.log(`✓ refresh_token (length ${refresh.length}): ${refresh.slice(0, 12)}...`);

  // Patch .env so subsequent scripts pick it up automatically.
  const envPath = path.join(process.cwd(), ".env");
  const env = await fs.readFile(envPath, "utf8");
  let next: string;
  if (/^GOOGLE_OAUTH_REFRESH_TOKEN=/m.test(env)) {
    next = env.replace(
      /^GOOGLE_OAUTH_REFRESH_TOKEN=.*$/m,
      `GOOGLE_OAUTH_REFRESH_TOKEN=${refresh}`,
    );
  } else {
    next = env.trimEnd() + `\nGOOGLE_OAUTH_REFRESH_TOKEN=${refresh}\n`;
  }
  await fs.writeFile(envPath, next);
  console.log("✓ .env patched with new refresh token");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
