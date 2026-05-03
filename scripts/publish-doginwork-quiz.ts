// One-off: publish the Maries Valpakademin quiz to quiz.doginwork.se via the
// existing publishQuiz pipeline. Run with: npx tsx scripts/publish-doginwork-quiz.ts
//
// Bypasses the /api/quiz/[id]/publish HTTP route so we don't need a session
// cookie - this script runs server-side with .env.local loaded by next/dotenv.
//
// 2026-05-03: Pre-publish hook runs optimize-quiz-assets to convert any new
// PNG/JPG uploads to WebP automatically. Idempotent - skips files where webp
// is already up-to-date.

import { spawnSync } from "child_process";
import { resolve } from "path";

import { publishQuiz } from "../src/lib/quiz-publish";

const QUIZ_ID = "29dd6398-51b7-46aa-8f3a-92b455d18cb7";
const WORKSPACE = "doginwork-valpakademin";

function runOptimizer() {
  console.log(`\n[1/2] Optimizing images in quiz-assets/${WORKSPACE}/ → WebP`);
  const result = spawnSync(
    "npx",
    [
      "--yes",
      "tsx",
      resolve(__dirname, "optimize-quiz-assets.ts"),
      WORKSPACE,
    ],
    { stdio: "inherit", env: process.env },
  );
  if (result.status !== 0) {
    throw new Error(`Image optimization failed (exit ${result.status})`);
  }
}

async function main() {
  runOptimizer();
  console.log(`\n[2/2] Publishing quiz ${QUIZ_ID}...`);
  const result = await publishQuiz(QUIZ_ID);
  console.log("Published:", result);
}

main().catch((err) => {
  console.error("Publish failed:", err);
  process.exit(1);
});
