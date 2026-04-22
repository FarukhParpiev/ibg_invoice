import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Puppeteer / Chromium must be external so Next doesn't try to bundle them.
  serverExternalPackages: [
    "puppeteer-core",
    "@sparticuz/chromium",
  ],
  // On Vercel we must explicitly include Chromium binaries in the trace of the
  // PDF routes, otherwise at runtime: "Could not find Chromium" / ENOENT on
  // the .br archives.
  outputFileTracingIncludes: {
    "/api/invoices/*/pdf": ["./node_modules/@sparticuz/chromium/**"],
    "/api/invoices/*/pdf/download": ["./node_modules/@sparticuz/chromium/**"],
  },
};

export default nextConfig;
