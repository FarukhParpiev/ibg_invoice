import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Puppeteer / Chromium должны быть внешними, Next не пытается их бандлить
  serverExternalPackages: [
    "puppeteer-core",
    "@sparticuz/chromium",
  ],
};

export default nextConfig;
