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
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "sharp", "ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/video-jobs/\\[id\\]/generate-captions": ["./node_modules/ffmpeg-static/ffmpeg", "./assets/fonts/**/*"],
    // Make sure the quiz-runtime bundle is packaged into the serverless
    // function for /_runtime/[filename] (and any other route that reads
    // it via fs at runtime, e.g. /quizzes/[id]/preview, /api/quiz/[id]/publish).
    "/_runtime/\\[filename\\]": ["./runtime/quiz-runtime/dist/**/*"],
    "/quizzes/\\[id\\]/preview": ["./runtime/quiz-runtime/dist/**/*"],
    "/api/quiz/\\[id\\]/publish": ["./runtime/quiz-runtime/dist/**/*"],
  },
};

export default nextConfig;
