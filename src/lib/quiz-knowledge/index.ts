/**
 * Quiz Funnel Knowledge Base
 *
 * Compressed reference material for the quiz adaptation AI. Also usable from
 * docs/admin pages if we want to expose it to users.
 *
 * To extend: add a new .md file and register it here. Keep the registry in
 * output order (00 → 06) so `FULL_KNOWLEDGE` stays coherent.
 */

// Using raw string imports is Node-friendly and works in Next.js server routes.
// We inline read synchronously at module load — files are a few hundred lines each.

import { readFileSync } from "fs";
import { join } from "path";

const DIR = join(process.cwd(), "src/lib/quiz-knowledge");

function loadDoc(filename: string): string {
  return readFileSync(join(DIR, filename), "utf-8");
}

export const FOUNDATION = loadDoc("00-foundation.md");
export const PRINCIPLES = loadDoc("01-principles.md");
export const ARC_AND_PHASES = loadDoc("02-arc-and-phases.md");
export const QUESTION_LIBRARY = loadDoc("03-question-library.md");
export const PATTERNS = loadDoc("04-patterns.md");
export const TEARDOWN_LESSONS = loadDoc("05-teardown-lessons.md");
export const ADAPTATION_GUIDE = loadDoc("06-adaptation-guide.md");
export const POST_QUIZ_EMAIL = loadDoc("07-post-quiz-email.md");
export const VILLAIN_FRAMEWORK = loadDoc("08-villain-framework.md");
export const FUNNEL_PROFESSOR_PILLARS = loadDoc("09-funnel-professor-pillars.md");

export const FULL_KNOWLEDGE = [
  FOUNDATION,
  PRINCIPLES,
  ARC_AND_PHASES,
  QUESTION_LIBRARY,
  PATTERNS,
  TEARDOWN_LESSONS,
  ADAPTATION_GUIDE,
  POST_QUIZ_EMAIL,
  VILLAIN_FRAMEWORK,
  FUNNEL_PROFESSOR_PILLARS,
].join("\n\n---\n\n");

/**
 * Returns a trimmed version without the full teardown lessons, for use when
 * token budget is tight. Keeps foundation + principles + arc + adaptation guide.
 */
export const CORE_KNOWLEDGE = [
  FOUNDATION,
  PRINCIPLES,
  ARC_AND_PHASES,
  QUESTION_LIBRARY,
  PATTERNS,
  ADAPTATION_GUIDE,
].join("\n\n---\n\n");
