import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],

  // Force Next.js to include the chromium binary payload in the serverless bundle
  outputFileTracingIncludes: {
    "/api/report/pdf": [
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
  },
};

export default nextConfig;