import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Puppeteer / Chromium должны быть внешними, Next не пытается их бандлить
  serverExternalPackages: [
    "puppeteer-core",
    "@sparticuz/chromium",
  ],
  // На Vercel нужно явно включить бинарники Chromium в трейс PDF-роутов,
  // иначе в рантайме: "Could not find Chromium" / ENOENT на .br-архивах.
  outputFileTracingIncludes: {
    "/api/invoices/*/pdf": ["./node_modules/@sparticuz/chromium/**"],
    "/api/invoices/*/pdf/download": ["./node_modules/@sparticuz/chromium/**"],
  },
};

export default nextConfig;
