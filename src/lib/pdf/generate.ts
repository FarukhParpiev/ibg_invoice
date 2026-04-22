// Spins up a headless browser and renders HTML to PDF (A4, backgrounds on).
// Two branches:
// - Vercel/AWS Lambda → @sparticuz/chromium + puppeteer-core
// - Local (mac/linux dev) → system Chrome/Chromium via puppeteer-core
//
// To avoid shipping Chromium as a dev dependency, locally we look up the
// executable via env vars and standard paths.

import type { Browser, LaunchOptions } from "puppeteer-core";

const IS_VERCEL = Boolean(process.env.VERCEL) || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

function localChromePath(): string {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  if (process.platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }
  if (process.platform === "linux") {
    return "/usr/bin/google-chrome";
  }
  if (process.platform === "win32") {
    return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  }
  throw new Error(
    "Chrome path not found. Set PUPPETEER_EXECUTABLE_PATH.",
  );
}

async function launchBrowser(): Promise<Browser> {
  const puppeteer = await import("puppeteer-core");

  if (IS_VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const opts: LaunchOptions = {
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    };
    return puppeteer.launch(opts);
  }

  return puppeteer.launch({
    executablePath: localChromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    // networkidle0 — so we wait for logo and fonts to finish loading
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      // Standard "safe" margins for printed documents: 15 mm on every
      // side. Printers clip 5–8 mm at the edges — going below 12 mm is
      // risky (part of the text ends up in the trim).
      margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
