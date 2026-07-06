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
  /** False when the LLM rubric call failed (verdict is deterministic-only, default-PASS). */
  rubricRan: boolean;
}

export interface JudgeContext {
  language: string;
  productName?: string;
}

/** Normalize "Swedish"/"sv"/"svenska" etc to a 2-letter key for language-scoped rules. */
function langKey(language: string): string {
  const l = language.toLowerCase();
  if (l.startsWith("sv") || l.startsWith("sw")) return "sv";
  if (l.startsWith("da")) return "da";
  if (l.startsWith("no")) return "no";
  if (l.startsWith("de") || l.startsWith("ge")) return "de";
  if (l.startsWith("en")) return "en";
  return l.slice(0, 2);
}

// English words that commonly slip into Swedish ad copy (from memory + the live bot tests).
// Some entries are real words in a target language and must not fire there (notIn):
// "proven" is Swedish (definite plural of "prov"), "skin" is Danish ("shine/glow").
const ENGLISH_OFFENDERS: Array<{ word: string; notIn?: string[] }> = [
  { word: "satisfies" },
  { word: "manic" },
  { word: "energy" },
  { word: "boost" },
  { word: "boosts" },
  { word: "boosting" },
  { word: "results" },
  { word: "proven", notIn: ["sv"] },
  { word: "guaranteed" },
  { word: "amazing" },
  { word: "awesome" },
  { word: "game-changer" },
  { word: "game changer" },
  { word: "skin", notIn: ["da"] },
  { word: "glow" },
  { word: "anti-aging" },
  { word: "mindset" },
];

// Currency-word tokens need a trailing \b so substrings don't fire:
//   "endast 299 kr"        -> match      "somna på 30 sekunder" -> NO match ("sek" in "sekunder")
//   "spara 50 kronor"      -> match      "10 kraftfulla tips"   -> NO match ("kr" in "kraftfulla")
//   "SEK 299" / "kr 299"   -> match      "49€" / "$49"          -> match (symbols need no \b)
const PRICE_RE = /(\d[\d\s.,]*\s*(kr|kronor|sek|dkk|nok|euro)\b)|(\d[\d\s.,]*\s*[€$])|([€$]\s*\d)|(\b(kr|sek)\b\s*\d)/i;

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
    const key = langKey(ctx.language);
    for (const { word: w, notIn } of ENGLISH_OFFENDERS) {
      if (notIn?.includes(key)) continue; // native word in this language - never block-reject on it
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
  let rubricRan = false;

  try {
    const raw = await chatOpenRouter(
      [
        { role: "system", content: RUBRIC },
        { role: "user", content: `Target language: ${ctx.language}.${ctx.productName ? ` Product: ${ctx.productName}.` : ""}\n\nAD COPY:\n${copy}` },
      ],
      { model: JUDGE_MODEL, temperature: 0, maxTokens: 1200, json: true },
    );
    const parsed = parseJsonLoose<{ score?: number; issues?: JudgeIssue[] }>(raw);
    rubricRan = true;
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
  } catch (err) {
    // LLM unavailable - deterministic verdict only. rubricRan stays false so
    // callers can tag the silent degradation (judge:PASS-norubric) instead of
    // presenting a default-PASS as a real rubric pass.
    console.error("[creative-judge] rubric call failed - deterministic-only verdict:", err);
  }

  const blocked = issues.some((i) => i.severity === "block");
  const verdict: Verdict = blocked ? "REJECT" : issues.length || score < 6 ? "WARN" : "PASS";
  return { verdict, score, issues, blocked, rubricRan };
}
