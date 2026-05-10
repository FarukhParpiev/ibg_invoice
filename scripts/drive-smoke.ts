// Smoke test: confirms the Service Account can see the configured folder
// and read/write inside it, then cleans up. No invoice data touched.
//
// Run via: npx tsx scripts/drive-smoke.ts

import {
  driveRootFolderId,
  getDriveClient,
  isDriveConfigured,
} from "../src/lib/drive/client";

async function main(): Promise<void> {
  if (!isDriveConfigured()) {
    console.error(
      "GOOGLE_SERVICE_ACCOUNT_KEY and/or GOOGLE_DRIVE_FOLDER_ID not set",
    );
    process.exit(1);
  }
  const drive = getDriveClient();
  const folderId = driveRootFolderId();
  if (!drive || !folderId) {
    console.error("Could not initialize Drive client");
    process.exit(1);
  }

  console.log(`Root folder ID: ${folderId}`);

  // 1. Read folder metadata.
  try {
    const meta = await drive.files.get({
      fileId: folderId,
      fields: "id,name,mimeType,owners(emailAddress)",
      supportsAllDrives: true,
    });
    console.log(
      `✓ Folder visible: "${meta.data.name}" (${meta.data.mimeType})`,
    );
    if (meta.data.owners) {
      console.log(
        `  Owners: ${meta.data.owners.map((o) => o.emailAddress).join(", ")}`,
      );
    }
  } catch (err) {
    console.error("✗ Cannot read folder metadata. Did you share it with the Service Account email?");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // 2. Try to create + delete a tiny test file.
  let testId: string | null = null;
  try {
    const created = await drive.files.create({
      requestBody: {
        name: ".smoke-test.txt",
        parents: [folderId],
        mimeType: "text/plain",
      },
      media: {
        mimeType: "text/plain",
        body: "ok",
      },
      fields: "id",
      supportsAllDrives: true,
    });
    testId = created.data.id ?? null;
    if (!testId) throw new Error("create returned no id");
    console.log(`✓ Write OK (test file id: ${testId})`);
  } catch (err) {
    console.error("✗ Cannot write to folder. Service Account needs Editor role.");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  try {
    await drive.files.delete({ fileId: testId, supportsAllDrives: true });
    console.log("✓ Delete OK (test file removed)");
  } catch (err) {
    console.warn(
      "! Could not clean up test file — you may want to remove it manually",
      err,
    );
  }

  console.log("\nAll good. Ready to run backfill.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
