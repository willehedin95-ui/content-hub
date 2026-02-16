import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // Required for @sparticuz/chromium to work in Vercel serverless functions
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "sharp"],
};

export default nextConfig;
