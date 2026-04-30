// One-off: publish the Maries Valpakademin quiz to quiz.doginwork.se via the
// existing publishQuiz pipeline. Run with: npx tsx scripts/publish-doginwork-quiz.ts
//
// Bypasses the /api/quiz/[id]/publish HTTP route so we don't need a session
// cookie - this script runs server-side with .env.local loaded by next/dotenv.

import { publishQuiz } from "../src/lib/quiz-publish";

const QUIZ_ID = "29dd6398-51b7-46aa-8f3a-92b455d18cb7";

async function main() {
  console.log(`Publishing quiz ${QUIZ_ID}...`);
  const result = await publishQuiz(QUIZ_ID);
  console.log("Published:", result);
}

main().catch((err) => {
  console.error("Publish failed:", err);
  process.exit(1);
});
