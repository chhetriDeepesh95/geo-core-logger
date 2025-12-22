/** @type {import('next').NextConfig} */
const nextConfig = {
  // ensures these packages are available in the server runtime bundle (including chromium bin assets)
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
};

module.exports = nextConfig;
