/**
 * Pre-generation image-prompt lint (Phase 2 of the Genesis integration).
 *
 * Validates an image-generation prompt BEFORE spending a KIE/Nano-Banana render, against the
 * product-visual rules (mirrors getProductAppearance) and the hard rendered-text language rule.
 * Pure function - no API. This is the Standards-Ladder "Tool" rung: binary, recurring, currently
 * enforced only by hoping the model honored a text instruction. Catches the exact failures in
 * memory: Hydro13 shot-glass / amber bottle, and English words baked into Swedish image overlays.
 *
 * Prompts may be a plain string OR a stringified JSON object (native/messy styles). We scan both
 * the whole text (for product-appearance violations) and any rendered-text fields/quoted strings
 * (for the language rule).
 */

export type LintSeverity = "block" | "warn";

export interface LintViolation {
  rule: string;
  severity: LintSeverity;
  message: string;
  match: string;
  /** Short instruction an auto-fix pass can apply. */
  fixHint: string;
}

export interface LintResult {
  pass: boolean; // true if no "block" violations
  violations: LintViolation[];
}

export interface LintContext {
  productSlug?: string;
  /** ISO-ish language code or name. Non-English triggers the rendered-text rule. */
  language?: string;
}

interface VisualRule {
  pattern: RegExp;
  severity: LintSeverity;
  message: string;
  fixHint: string;
}

// Product-visual rules, derived from src/lib/product-appearance.ts. Matched against the full prompt.
const VISUAL_RULES: Record<string, VisualRule[]> = {
  hydro13: [
    {
      pattern: /\bamber\b/i,
      severity: "block",
      message: "Hydro13 bottle is WHITE, never amber.",
      fixHint: "Describe the bottle as a tall sleek WHITE plastic bottle with a white screw cap.",
    },
    {
      pattern: /\b(glass|transparent|clear|brown|dark)\s+bottle\b/i,
      severity: "block",
      message: "Hydro13 bottle is white PLASTIC, not glass/transparent/clear/brown.",
      fixHint: "Bottle = white 500ml plastic bottle, white cap, label 'HYDRO13'.",
    },
    {
      pattern: /\bshot\s*glass\b/i,
      severity: "block",
      message: "No shot glass (reads as alcohol).",
      fixHint: "If a glass is shown, make it a tiny 30ml clear espresso-size glass with golden liquid.",
    },
    {
      pattern: /\b(tall|large|full[- ]?size|regular)\s+(drinking\s+)?glass\b/i,
      severity: "block",
      message: "No regular/large drinking glass for Hydro13.",
      fixHint: "Use a tiny 30ml espresso-size clear glass (~1/5 the bottle height).",
    },
    {
      pattern: /\b(ice cubes?|iceberg|snow|frost|glacier|mountain stream)\b/i,
      severity: "warn",
      message: "No ice/nature themes for Hydro13 (irrelevant to product).",
      fixHint: "Drop ice/nature; keep it a clean Scandinavian product/lifestyle context.",
    },
  ],
  happysleep: [
    {
      pattern: /\bbare foam\b/i,
      severity: "block",
      message: "Never show bare foam - the pillow always has its fabric cover.",
      fixHint: "Show the finished pillow: white quilted diamond cover + black mesh ventilation strip.",
    },
    {
      pattern: /\bfoam pillow\b/i,
      severity: "warn",
      message: "Show the finished covered pillow, not raw foam.",
      fixHint: "White quilted diamond-pattern cover, black mesh strip, dual-height contour.",
    },
  ],
};

// English ad-words that must NEVER be rendered as on-image text in a non-English market.
const BANNED_RENDERED_ENGLISH = [
  "COLLAGEN",
  "HYALURONIC",
  "BEFORE",
  "AFTER",
  "ENERGY",
  "BOOST",
  "SLEEP",
  "RESULTS",
  "PROVEN",
  "GUARANTEED",
];

function isNonEnglish(language?: string): boolean {
  return !!language && !language.toLowerCase().startsWith("en");
}

/** Pull candidate rendered-text strings: JSON text-ish fields + quoted substrings. */
function renderedTextCandidates(prompt: string): string[] {
  const out: string[] = [];
  try {
    const obj = JSON.parse(prompt);
    const walk = (v: unknown, key?: string) => {
      if (typeof v === "string") {
        if (key && /text|headline|overlay|caption|label|title|sign|copy|words/i.test(key)) out.push(v);
      } else if (Array.isArray(v)) {
        v.forEach((x) => walk(x, key));
      } else if (v && typeof v === "object") {
        for (const [k, val] of Object.entries(v)) walk(val, k);
      }
    };
    walk(obj);
  } catch {
    // not JSON - fall through to quoted-string scan
  }
  // Also scan double/single-quoted substrings (rendered text is usually quoted in prompts).
  const quoted = prompt.match(/["'“‘]([^"'”’]{2,60})["'”’]/g) || [];
  out.push(...quoted.map((q) => q.slice(1, -1)));
  return out;
}

/**
 * Lint an image prompt. Returns { pass, violations }. `pass` is false only if a "block"
 * violation exists (warnings don't block). Callers should auto-rewrite + re-lint on !pass.
 */
export function lintImagePrompt(prompt: string, ctx: LintContext = {}): LintResult {
  const violations: LintViolation[] = [];
  const slug = ctx.productSlug?.toLowerCase();

  // 1. Product-visual rules (scan the whole prompt).
  if (slug && VISUAL_RULES[slug]) {
    for (const rule of VISUAL_RULES[slug]) {
      const m = prompt.match(rule.pattern);
      if (m) {
        violations.push({
          rule: `visual:${slug}`,
          severity: rule.severity,
          message: rule.message,
          match: m[0],
          fixHint: rule.fixHint,
        });
      }
    }
  }

  // 2. Rendered-text language rule (non-English markets).
  if (isNonEnglish(ctx.language)) {
    const candidates = renderedTextCandidates(prompt);
    const seen = new Set<string>();
    for (const text of candidates) {
      for (const word of BANNED_RENDERED_ENGLISH) {
        const re = new RegExp(`\\b${word}\\b`, "i");
        if (re.test(text) && !seen.has(word)) {
          seen.add(word);
          violations.push({
            rule: "rendered-text:language",
            severity: "block",
            message: `English word "${word}" in rendered image text (market is ${ctx.language}).`,
            match: word,
            fixHint: `Translate the on-image text to ${ctx.language}; never render English ad-words.`,
          });
        }
      }
    }
  }

  // 3. Hard hyphen rule - en/em dashes in any rendered text.
  if (/[—–]/.test(prompt)) {
    violations.push({
      rule: "hyphen",
      severity: "warn",
      message: "Contains en/em dash - use a regular hyphen.",
      match: (prompt.match(/[—–]/) || [""])[0],
      fixHint: "Replace en/em dashes with regular hyphens.",
    });
  }

  return { pass: !violations.some((v) => v.severity === "block"), violations };
}

// Safe deterministic fixes for the visual block rules - string swaps that can't make things worse.
const VISUAL_FIXES: Array<{ pattern: RegExp; replace: string; slug: string }> = [
  { slug: "hydro13", pattern: /\bamber\b/gi, replace: "white" },
  { slug: "hydro13", pattern: /\b(glass|transparent|clear|brown|dark)\s+bottle\b/gi, replace: "white plastic bottle" },
  { slug: "hydro13", pattern: /\bshot\s*glass\b/gi, replace: "small 30ml espresso-size glass" },
  { slug: "hydro13", pattern: /\b(tall|large|full[- ]?size|regular)\s+(drinking\s+)?glass\b/gi, replace: "small 30ml espresso-size glass" },
];

/**
 * Apply safe deterministic fixes for the visual block rules + dash normalization. Returns the
 * fixed prompt and whether anything changed. Does NOT touch rendered-text language issues (those
 * can't be auto-translated safely - log + regenerate those instead).
 */
export function autoFixPrompt(prompt: string, ctx: LintContext = {}): { prompt: string; changed: boolean } {
  const slug = ctx.productSlug?.toLowerCase();
  let out = prompt;
  for (const fix of VISUAL_FIXES) {
    if (slug === fix.slug) out = out.replace(fix.pattern, fix.replace);
  }
  out = out.replace(/[—–]/g, "-");
  return { prompt: out, changed: out !== prompt };
}

/** One-line summary for logging/telemetry. */
export function summarizeLint(result: LintResult): string {
  if (!result.violations.length) return "lint: clean";
  return `lint: ${result.pass ? "warnings" : "BLOCKED"} - ` + result.violations.map((v) => `${v.rule}(${v.match})`).join(", ");
}
