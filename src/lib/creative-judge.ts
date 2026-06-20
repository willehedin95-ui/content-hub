/**
 * Creative judge (Phase 3 of the Genesis integration).
 *
 * A writer->judge rubric pass over generated ad COPY. Two layers:
 *  1. Deterministic hard-rule checks (instant, free): en/em dashes, prices, a curated list of
 *     English words that slip into Swedish copy. These are non-negotiable -> REJECT.
 *  2. An LLM rubric judge (via OpenRouter, runs on the OpenRouter key) scoring the copy on the
 *     transcript frameworks (curiosity, vivid pain, proof, specificity, naturalness) and catching
 *     subtler issues - English words, en/ett grammar, unnatural Swedish - that the live tests
 *     showed the trained bots occasionally produce (e.g. "Din hud satisfies inte...").
 *
 * Drop this between generation and persistence: bounce REJECTs back to regenerate before the
 * human ever sees them. Generalizes the existing meta-compliance.ts {verdict, issues[]} pattern.
 */

import { chatOpenRouter, parseJsonLoose, JUDGE_MODEL } from "./openrouter";

export type Verdict = "PASS" | "WARN" | "REJECT";

export interface JudgeIssue {
  type: string; // e.g. "english-word", "grammar", "slop", "weak-curiosity", "price"
  severity: "block" | "warn";
  quote: string;
  fix: string;
}

export interface JudgeResult {
  verdict: Verdict;
  score: number; // 0-10 overall quality
  issues: JudgeIssue[];
  /** True if any "block"-severity issue exists. */
  blocked: boolean;
}

export interface JudgeContext {
  language: string;
  productName?: string;
}

// English words that commonly slip into Swedish ad copy (from memory + the live bot tests).
const ENGLISH_OFFENDERS = [
  "satisfies",
  "manic",
  "energy",
  "boost",
  "boosts",
  "boosting",
  "results",
  "proven",
  "guaranteed",
  "amazing",
  "awesome",
  "game-changer",
  "game changer",
  "skin",
  "glow",
  "anti-aging",
  "mindset",
];

const PRICE_RE = /(\d[\d\s.,]*\s*(kr|kronor|sek|dkk|nok|€|\$|euro))|((kr|sek)\s*\d)/i;

/** Deterministic pre-checks - instant, free. */
export function deterministicChecks(copy: string, ctx: JudgeContext): JudgeIssue[] {
  const issues: JudgeIssue[] = [];
  const nonEnglish = !ctx.language.toLowerCase().startsWith("en");

  const dash = copy.match(/[—–]/);
  if (dash) {
    issues.push({ type: "dash", severity: "warn", quote: dash[0], fix: "Replace en/em dash with a regular hyphen." });
  }

  const price = copy.match(PRICE_RE);
  if (price) {
    issues.push({ type: "price", severity: "block", quote: price[0], fix: "Remove the price/currency figure (NO PRICES rule)." });
  }

  if (nonEnglish) {
    for (const w of ENGLISH_OFFENDERS) {
      const re = new RegExp(`\\b${w.replace(/[-]/g, "\\-")}\\b`, "i");
      const m = copy.match(re);
      if (m) {
        issues.push({
          type: "english-word",
          severity: "block",
          quote: m[0],
          fix: `Replace the English word "${m[0]}" with natural ${ctx.language}.`,
        });
      }
    }
  }
  return issues;
}

const RUBRIC = `You are a ruthless senior direct-response copy editor. Judge the ad copy below.
Score it 0-10 on these (in priority order): curiosity/hook strength, vivid felt pain, vivid benefits,
credibility/proof, specificity, naturalness of the language. A bad idea worded perfectly is still bad.

Flag as "block" severity ONLY genuinely unusable problems:
- ANY English word in copy that should be entirely in the target language (very important).
Flag everything else as "warn" (do NOT block on these):
- Grammar errors (e.g. Swedish en/ett gender: "Din nattserum" should be "Ditt nattserum").
- AI-slop phrasing (robotic transitions, "Det är inte X, det är Y" clichés, empty hype).
- Weak curiosity / generic openings / weak CTA / specificity gaps.

Return ONLY JSON:
{"score": <0-10 number>, "issues": [{"type": "...", "severity": "block"|"warn", "quote": "<exact text>", "fix": "<short fix>"}]}`;

/**
 * Full judge: deterministic checks + LLM rubric. Verdict = REJECT if any block issue, WARN if any
 * warn issue or score < 6, else PASS. If the LLM call fails, falls back to deterministic-only.
 */
export async function judgeCopy(copy: string, ctx: JudgeContext): Promise<JudgeResult> {
  const issues: JudgeIssue[] = deterministicChecks(copy, ctx);
  let score = 7;

  try {
    const raw = await chatOpenRouter(
      [
        { role: "system", content: RUBRIC },
        { role: "user", content: `Target language: ${ctx.language}.${ctx.productName ? ` Product: ${ctx.productName}.` : ""}\n\nAD COPY:\n${copy}` },
      ],
      { model: JUDGE_MODEL, temperature: 0, maxTokens: 1200, json: true },
    );
    const parsed = parseJsonLoose<{ score?: number; issues?: JudgeIssue[] }>(raw);
    if (typeof parsed.score === "number") score = parsed.score;
    for (const it of parsed.issues || []) {
      // de-dupe against deterministic finds on the same quote
      if (!issues.some((e) => e.quote?.toLowerCase() === it.quote?.toLowerCase())) {
        issues.push({
          type: it.type || "rubric",
          severity: it.severity === "block" ? "block" : "warn",
          quote: it.quote || "",
          fix: it.fix || "",
        });
      }
    }
  } catch {
    // LLM unavailable - deterministic verdict only.
  }

  const blocked = issues.some((i) => i.severity === "block");
  const verdict: Verdict = blocked ? "REJECT" : issues.length || score < 6 ? "WARN" : "PASS";
  return { verdict, score, issues, blocked };
}
