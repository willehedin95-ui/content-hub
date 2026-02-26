import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev",
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  // Required for @sparticuz/chromium to work in Vercel serverless functions
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "sharp"],
};

export default nextConfig;
