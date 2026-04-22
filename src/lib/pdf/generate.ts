// Запускает headless-браузер и рендерит HTML в PDF (A4, фон включён).
// Две ветки:
// - Vercel/AWS Lambda → @sparticuz/chromium + puppeteer-core
// - Локально (mac/linux dev) → системный Chrome/Chromium через puppeteer-core
//
// Чтобы не тащить сам Chromium в зависимости разработки, локально ищем
// исполняемый файл по переменным окружения и стандартным путям.

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
    "Не найден путь до Chrome. Установите PUPPETEER_EXECUTABLE_PATH.",
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
    // networkidle0 — чтобы дождаться загрузки логотипа и шрифтов
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", right: "12mm", bottom: "14mm", left: "12mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
