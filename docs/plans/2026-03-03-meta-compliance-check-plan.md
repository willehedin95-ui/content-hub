# Meta Compliance Check — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an AI-powered advisory compliance check to the Preview & Push tab that analyzes ad copy text (via Claude) and static ad images (via GPT-4o vision) against Meta's advertising policies before pushing to Meta.

**Architecture:** New lib module `meta-compliance.ts` with two parallel analysis functions (text via Claude, images via GPT-4o vision). New API route triggers the check. New UI component on the Preview & Push tab shows results as advisory warnings. Results stored on `image_jobs.compliance_result` JSONB column.

**Tech Stack:** Anthropic Claude (text analysis), OpenAI GPT-4o vision (image analysis), Next.js API route, React component with Tailwind.

---

### Task 1: Add TypeScript types for compliance results

**Files:**
- Modify: `src/types/index.ts` — add after the existing `QualityAnalysis` interface (~line 318)

**Step 1: Add the compliance types**

Add these types after the existing `QualityAnalysis` interface:

```typescript
// Meta compliance check types
export interface ComplianceIssue {
  rule: string;
  detail: string;
  suggestion?: string;
}

export interface ComplianceTextResult {
  text: string;
  type: "primary" | "headline";
  verdict: "PASS" | "WARNING" | "REJECT";
  issues: ComplianceIssue[];
}

export interface ComplianceImageResult {
  image_url: string;
  verdict: "PASS" | "WARNING";
  issues: ComplianceIssue[];
}

export interface ComplianceResult {
  overall_verdict: "PASS" | "WARNING" | "REJECT";
  text_results: ComplianceTextResult[];
  image_results: ComplianceImageResult[];
  summary: string;
  checked_at: string;
}
```

**Step 2: Add `compliance_result` to ImageJob type**

In the `ImageJob` interface (around line 229-265), add after `ad_copy_translations`:

```typescript
compliance_result?: ComplianceResult | null;
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build passes with no type errors.

**Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add compliance check types"
```

---

### Task 2: Add database column for compliance results

**Step 1: Add `compliance_result` JSONB column to `image_jobs`**

Run via Supabase Management API:

```bash
curl -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "ALTER TABLE image_jobs ADD COLUMN IF NOT EXISTS compliance_result jsonb DEFAULT null;"}'
```

Expected: `200 OK`

**Step 2: Commit** (nothing to commit — DDL only)

---

### Task 3: Create the compliance analysis lib

**Files:**
- Create: `src/lib/meta-compliance.ts`

**Step 1: Write the compliance analysis module**

This is the core module. It has two functions:
- `analyzeTextCompliance()` — Claude analyzes ad copy text
- `analyzeImageCompliance()` — GPT-4o vision analyzes images
- `runComplianceCheck()` — orchestrator that runs both in parallel

```typescript
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  ComplianceResult,
  ComplianceTextResult,
  ComplianceImageResult,
} from "@/types";
import { calcClaudeCost, calcOpenAICost } from "@/lib/pricing";
import { OPENAI_MODEL } from "@/lib/constants";

const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

// ─── TEXT COMPLIANCE PROMPT ─────────────────────────────────────────

const TEXT_COMPLIANCE_SYSTEM_PROMPT = `You are a Meta Ads compliance reviewer specializing in health, wellness, and supplement advertising. Your job is to check ad copy against Meta's advertising policies and FTC guidelines.

IMPORTANT CALIBRATION:
- You are reviewing ads for health/wellness supplement products (sleep aids, hydration products) sold in Scandinavian markets (Sweden, Norway, Denmark).
- These are LEGITIMATE products with real benefits. The goal is effective advertising that stays within Meta's policies.
- Only flag issues that would ACTUALLY get an ad rejected by Meta's automated review system.
- When in doubt, PASS. Do NOT flag borderline phrasing that is common in the industry and routinely approved.
- Your role is to catch real violations, not to be a paranoid lawyer.

META ADVERTISING POLICY RULES:

1. PERSONAL ATTRIBUTES (HIGH RISK — most common rejection reason)
Meta prohibits content that asserts or implies personal attributes. This means you cannot use "you/your" + a body condition, health state, or personal characteristic.

VIOLATIONS: "your extra fat", "your belly", "your pain", "your insomnia", "your weight problem", "if you're overweight", "your aging skin"
COMPLIANT: "extra fat", "belly fat", "common sleep issues", "many people experience...", "those who struggle with..."

The word "you" is NOT banned — it's only a problem when combined with a negative personal attribute or health condition.
COMPLIANT uses of "you": "you can try", "you might enjoy", "what if you could sleep better", "discover how you can..."

2. NEGATIVE SELF-IMAGERY (MEDIUM RISK)
Avoid making people feel bad about themselves. Frame everything as positive transformation.

VIOLATIONS: "tired of being fat?", "sick of your ugly belly?", "stop being tired and worn out", "your body is holding on to flab"
COMPLIANT: "discover a more energized you", "support your wellness journey", "wake up feeling refreshed", "this program can help your body become fitter"

Note: Describing a problem is OK if done neutrally. "Many people struggle with poor sleep" is fine. "Are YOU struggling with YOUR terrible sleep?" is not.

3. FALSE PROMISES (MEDIUM RISK)
No absolute guarantees or unrealistic claims. Use hedging language.

VIOLATIONS: "guaranteed to work", "you WILL lose weight", "cure your insomnia", "permanent results", "works for everyone"
COMPLIANT: "can help support", "may improve", "designed to promote", "many users report", "supports healthy..."

4. FTC WEIGHT LOSS RED FLAGS (HIGH RISK if applicable)
- No claims of 2+ lbs/week loss without diet/exercise
- No "permanent weight loss" claims
- No "works no matter what you eat" claims
- No "blocks fat absorption" claims without clinical substantiation
- Testimonials must reflect typical results and disclose conditions

5. TESTIMONIALS (LOW RISK)
If testimonials are used, they should reflect typical experience. Specific numbers need context.

VIOLATIONS: "Jane lost 30 pounds in 30 days!"
COMPLIANT: "Jane lost 30 pounds over 12 weeks following this exercise and diet program"

6. MEDICAL CLAIMS (HIGH RISK)
Never use words like "cure", "treat", "diagnose", "prevent disease", "medical", "prescription", "FDA approved" (unless actually FDA approved).

COMPLIANT: "supports", "promotes", "helps maintain", "contributes to"

RESPONSE FORMAT:
Return a JSON object with this exact structure:
{
  "text_results": [
    {
      "text": "the exact text analyzed",
      "type": "primary" or "headline",
      "verdict": "PASS" or "WARNING" or "REJECT",
      "issues": [
        {
          "rule": "Personal Attributes",
          "detail": "Uses 'your belly fat' which implies a personal attribute",
          "suggestion": "Change to 'belly fat' or 'stubborn belly fat'"
        }
      ]
    }
  ],
  "summary": "Brief 1-2 sentence overall assessment"
}

VERDICT GUIDELINES:
- PASS: No policy issues found. This ad would be approved.
- WARNING: Minor concern that MIGHT trigger review but would likely pass. Worth noting but not blocking.
- REJECT: Clear policy violation that would very likely get the ad rejected. Must be fixed.

Only use REJECT for clear, unambiguous violations. WARNING is for borderline cases. PASS for everything else.`;

// ─── IMAGE COMPLIANCE PROMPT ────────────────────────────────────────

const IMAGE_COMPLIANCE_SYSTEM_PROMPT = `You are a Meta Ads image compliance reviewer for health/wellness product ads.

Check this ad image against Meta's image policies. Only flag REAL issues that would get the ad rejected.

RULES FOR IMAGES:
1. NO before/after side-by-side comparisons (even implied — e.g., split image with sad left / happy right)
2. NO images that focus on body imperfections (close-ups of fat, cellulite, stretch marks)
3. NO images showing unrealistic body transformations
4. NO excessive nudity or overly sexualized content
5. NO scales, measuring tapes, or calipers as the primary focal point (fine if incidental/background)
6. NO images showing someone in visible distress about their body
7. Images should generally show positive, aspirational states

WHAT IS FINE:
- Happy, healthy-looking people
- Product shots with lifestyle context
- People exercising, sleeping well, looking energized
- Before/after if shown as a journey (timeline, not side-by-side contrast)
- Scales/measuring items if they're not the central focus and shown positively
- Text overlays with benefits, ingredients, or offers
- Bold graphic design, editorial style imagery

CALIBRATION: Most static ad images for supplements are compliant. Only flag genuinely problematic content.

Return JSON:
{
  "verdict": "PASS" or "WARNING",
  "issues": [
    {
      "rule": "Before/After",
      "detail": "Image appears to show a before/after comparison with contrasting body shapes"
    }
  ]
}

Use WARNING only when there's a real concern. Most images should PASS.`;

// ─── ANALYSIS FUNCTIONS ─────────────────────────────────────────────

export async function analyzeTextCompliance(
  primaryTexts: string[],
  headlines: string[]
): Promise<{
  results: ComplianceTextResult[];
  summary: string;
  inputTokens: number;
  outputTokens: number;
}> {
  const client = getAnthropicClient();

  const textsToCheck = [
    ...primaryTexts.filter((t) => t.trim()).map((t) => ({ text: t, type: "primary" as const })),
    ...headlines.filter((t) => t.trim()).map((t) => ({ text: t, type: "headline" as const })),
  ];

  if (textsToCheck.length === 0) {
    return { results: [], summary: "No text to check.", inputTokens: 0, outputTokens: 0 };
  }

  const userPrompt = `Please review these ad texts for Meta compliance:

${textsToCheck.map((t, i) => `${i + 1}. [${t.type.toUpperCase()}] "${t.text}"`).join("\n")}

Return your analysis as JSON.`;

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    system: TEXT_COMPLIANCE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  // Extract JSON from response (may be wrapped in markdown code block)
  let jsonStr = content.text;
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];

  const parsed = JSON.parse(jsonStr.trim());

  const results: ComplianceTextResult[] = (parsed.text_results || []).map(
    (r: ComplianceTextResult) => ({
      text: r.text || "",
      type: r.type || "primary",
      verdict: r.verdict || "PASS",
      issues: (r.issues || []).map((issue) => ({
        rule: issue.rule || "Unknown",
        detail: issue.detail || "",
        suggestion: issue.suggestion,
      })),
    })
  );

  return {
    results,
    summary: parsed.summary || "",
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

export async function analyzeImageCompliance(
  imageUrls: string[]
): Promise<{
  results: ComplianceImageResult[];
  inputTokens: number;
  outputTokens: number;
}> {
  if (imageUrls.length === 0) {
    return { results: [], inputTokens: 0, outputTokens: 0 };
  }

  const openai = getOpenAIClient();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const results: ComplianceImageResult[] = await Promise.all(
    imageUrls.map(async (url) => {
      try {
        const response = await openai.chat.completions.create({
          model: OPENAI_MODEL,
          max_tokens: 500,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: IMAGE_COMPLIANCE_SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: "Check this ad image for Meta compliance:" },
                { type: "image_url", image_url: { url, detail: "low" } },
              ],
            },
          ],
        });

        totalInputTokens += response.usage?.prompt_tokens ?? 0;
        totalOutputTokens += response.usage?.completion_tokens ?? 0;

        const content = response.choices[0]?.message?.content;
        if (!content) return { image_url: url, verdict: "PASS" as const, issues: [] };

        const parsed = JSON.parse(content);
        return {
          image_url: url,
          verdict: (parsed.verdict || "PASS") as "PASS" | "WARNING",
          issues: (parsed.issues || []).map((issue: ComplianceImageResult["issues"][0]) => ({
            rule: issue.rule || "Unknown",
            detail: issue.detail || "",
          })),
        };
      } catch (err) {
        console.error(`Image compliance check failed for ${url}:`, err);
        return { image_url: url, verdict: "PASS" as const, issues: [] };
      }
    })
  );

  return { results, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
}

// ─── ORCHESTRATOR ────────────────────────────────────────────────────

export async function runComplianceCheck(
  primaryTexts: string[],
  headlines: string[],
  imageUrls: string[]
): Promise<{
  result: ComplianceResult;
  cost: { claudeCost: number; openaiCost: number; totalCost: number };
  tokens: { claudeInput: number; claudeOutput: number; openaiInput: number; openaiOutput: number };
}> {
  const [textAnalysis, imageAnalysis] = await Promise.all([
    analyzeTextCompliance(primaryTexts, headlines),
    analyzeImageCompliance(imageUrls),
  ]);

  // Determine overall verdict
  const allVerdicts = [
    ...textAnalysis.results.map((r) => r.verdict),
    ...imageAnalysis.results.map((r) => r.verdict),
  ];
  let overall_verdict: ComplianceResult["overall_verdict"] = "PASS";
  if (allVerdicts.includes("REJECT")) overall_verdict = "REJECT";
  else if (allVerdicts.includes("WARNING")) overall_verdict = "WARNING";

  const result: ComplianceResult = {
    overall_verdict,
    text_results: textAnalysis.results,
    image_results: imageAnalysis.results,
    summary: textAnalysis.summary,
    checked_at: new Date().toISOString(),
  };

  const claudeCost = calcClaudeCost(textAnalysis.inputTokens, textAnalysis.outputTokens);
  const openaiCost = calcOpenAICost(imageAnalysis.inputTokens, imageAnalysis.outputTokens);

  return {
    result,
    cost: { claudeCost, openaiCost, totalCost: claudeCost + openaiCost },
    tokens: {
      claudeInput: textAnalysis.inputTokens,
      claudeOutput: textAnalysis.outputTokens,
      openaiInput: imageAnalysis.inputTokens,
      openaiOutput: imageAnalysis.outputTokens,
    },
  };
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build passes.

**Step 3: Commit**

```bash
git add src/lib/meta-compliance.ts
git commit -m "feat: add meta compliance analysis lib (Claude text + GPT-4o vision images)"
```

---

### Task 4: Create the API route

**Files:**
- Create: `src/app/api/image-jobs/[id]/compliance-check/route.ts`

**Step 1: Write the API route**

Follow the exact pattern from `translate-copy/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { runComplianceCheck } from "@/lib/meta-compliance";
import { calcClaudeCost, calcOpenAICost } from "@/lib/pricing";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const db = createServerSupabase();

  try {
    // Load job with ad copy
    const { data: job, error: jobError } = await db
      .from("image_jobs")
      .select(
        "id, ad_copy_primary, ad_copy_headline, source_images(id, image_translations(translated_url, aspect_ratio, status, skip_translation, original_url))"
      )
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const primaryTexts: string[] = job.ad_copy_primary || [];
    const headlines: string[] = job.ad_copy_headline || [];

    // Collect completed 1:1 image URLs
    const imageUrls: string[] = [];
    for (const src of job.source_images || []) {
      for (const trans of src.image_translations || []) {
        if (trans.aspect_ratio !== "1:1") continue;
        if (trans.skip_translation) {
          if (trans.original_url) imageUrls.push(trans.original_url);
        } else if (trans.status === "completed" && trans.translated_url) {
          imageUrls.push(trans.translated_url);
        }
      }
    }

    // Deduplicate image URLs (same image may appear for multiple languages)
    const uniqueImageUrls = [...new Set(imageUrls)];

    // Run compliance check
    const { result, cost, tokens } = await runComplianceCheck(
      primaryTexts,
      headlines,
      uniqueImageUrls
    );

    // Store result on job
    await db
      .from("image_jobs")
      .update({ compliance_result: result })
      .eq("id", jobId);

    // Log usage
    if (tokens.claudeInput > 0) {
      await db.from("usage_logs").insert({
        type: "compliance_check",
        model: "claude-sonnet-4-5-20250929",
        input_tokens: tokens.claudeInput,
        output_tokens: tokens.claudeOutput,
        cost_usd: cost.claudeCost,
        metadata: { purpose: "compliance_text_check", job_id: jobId },
      });
    }

    if (tokens.openaiInput > 0) {
      await db.from("usage_logs").insert({
        type: "compliance_check",
        model: "gpt-4o",
        input_tokens: tokens.openaiInput,
        output_tokens: tokens.openaiOutput,
        cost_usd: cost.openaiCost,
        metadata: {
          purpose: "compliance_image_check",
          job_id: jobId,
          images_checked: uniqueImageUrls.length,
        },
      });
    }

    return NextResponse.json({ result, cost });
  } catch (err) {
    console.error("Compliance check failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Compliance check failed" },
      { status: 500 }
    );
  }
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build passes.

**Step 3: Commit**

```bash
git add src/app/api/image-jobs/[id]/compliance-check/route.ts
git commit -m "feat: add compliance check API route"
```

---

### Task 5: Create the ComplianceCheck UI component

**Files:**
- Create: `src/components/images/ComplianceCheck.tsx`

**Step 1: Write the component**

This component shows a "Run Compliance Check" button, displays results, and persists state across re-renders. Follow existing patterns from MetaAdPreview (Tailwind, lucide-react icons).

```typescript
"use client";

import { useState } from "react";
import { Shield, ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { ComplianceResult } from "@/types";

interface Props {
  jobId: string;
  complianceResult: ComplianceResult | null;
  onResultUpdate: (result: ComplianceResult) => void;
}

export default function ComplianceCheck({ jobId, complianceResult, onResultUpdate }: Props) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [cost, setCost] = useState<{ totalCost: number } | null>(null);

  const runCheck = async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/image-jobs/${jobId}/compliance-check`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Check failed");
      }
      const data = await res.json();
      onResultUpdate(data.result);
      setCost(data.cost);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setChecking(false);
    }
  };

  const verdictConfig = {
    PASS: { icon: ShieldCheck, color: "text-green-600", bg: "bg-green-50", border: "border-green-200", label: "All Clear" },
    WARNING: { icon: ShieldAlert, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", label: "Warnings Found" },
    REJECT: { icon: XCircle, color: "text-red-600", bg: "bg-red-50", border: "border-red-200", label: "Issues Found" },
  };

  const itemVerdictIcon = (verdict: string) => {
    if (verdict === "PASS") return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />;
    if (verdict === "WARNING") return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
    return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
  };

  const timeAgo = (dateStr: string) => {
    const mins = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    return `${Math.round(mins / 60)}h ago`;
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Compliance Check</span>
          {complianceResult && (
            <>
              <span className={`text-xs px-2 py-0.5 rounded-full ${verdictConfig[complianceResult.overall_verdict].bg} ${verdictConfig[complianceResult.overall_verdict].color}`}>
                {verdictConfig[complianceResult.overall_verdict].label}
              </span>
              <span className="text-xs text-gray-400">
                {timeAgo(complianceResult.checked_at)}
              </span>
            </>
          )}
        </div>
        <span className="text-xs text-gray-400">{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Run button */}
          <button
            onClick={(e) => { e.stopPropagation(); runCheck(); }}
            disabled={checking}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {checking ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking...</>
            ) : complianceResult ? (
              <><RefreshCw className="w-3.5 h-3.5" /> Re-run Check</>
            ) : (
              <><Shield className="w-3.5 h-3.5" /> Run Compliance Check</>
            )}
          </button>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          {/* Results */}
          {complianceResult && (
            <div className="space-y-2">
              {/* Summary */}
              {complianceResult.summary && (
                <p className="text-sm text-gray-600">{complianceResult.summary}</p>
              )}

              {/* Text results */}
              {complianceResult.text_results.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ad Copy</p>
                  {complianceResult.text_results.map((r, i) => (
                    <div key={i} className={`rounded-md border p-2.5 ${r.verdict === "PASS" ? "border-gray-100 bg-gray-50/50" : r.verdict === "WARNING" ? "border-amber-200 bg-amber-50/50" : "border-red-200 bg-red-50/50"}`}>
                      <div className="flex items-start gap-2">
                        {itemVerdictIcon(r.verdict)}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-400 uppercase">{r.type}</span>
                          </div>
                          <p className="text-sm text-gray-700 mt-0.5 line-clamp-2">"{r.text}"</p>
                          {r.issues.map((issue, j) => (
                            <div key={j} className="mt-1.5 text-xs">
                              <span className={`font-medium ${r.verdict === "REJECT" ? "text-red-700" : "text-amber-700"}`}>
                                {issue.rule}:
                              </span>{" "}
                              <span className="text-gray-600">{issue.detail}</span>
                              {issue.suggestion && (
                                <p className="text-gray-500 mt-0.5 italic">Suggestion: {issue.suggestion}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Image results */}
              {complianceResult.image_results.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Images</p>
                  {complianceResult.image_results.filter(r => r.verdict !== "PASS").length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle2 className="w-4 h-4" />
                      All {complianceResult.image_results.length} images passed
                    </div>
                  ) : (
                    complianceResult.image_results.filter(r => r.verdict !== "PASS").map((r, i) => (
                      <div key={i} className="rounded-md border border-amber-200 bg-amber-50/50 p-2.5">
                        <div className="flex items-start gap-2">
                          {itemVerdictIcon(r.verdict)}
                          <div className="min-w-0 flex-1">
                            {r.issues.map((issue, j) => (
                              <div key={j} className="text-xs">
                                <span className="font-medium text-amber-700">{issue.rule}:</span>{" "}
                                <span className="text-gray-600">{issue.detail}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Cost */}
              {cost && (
                <p className="text-xs text-gray-400 text-right">
                  Check cost: ${cost.totalCost.toFixed(4)}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build passes.

**Step 3: Commit**

```bash
git add src/components/images/ComplianceCheck.tsx
git commit -m "feat: add ComplianceCheck UI component"
```

---

### Task 6: Integrate ComplianceCheck into MetaAdPreview

**Files:**
- Modify: `src/components/images/MetaAdPreview.tsx`

**Step 1: Add import**

Add at the top with other imports:

```typescript
import ComplianceCheck from "./ComplianceCheck";
```

**Step 2: Add compliance state**

The component receives `job` which has `compliance_result`. Add local state to track updates:

```typescript
const [complianceResult, setComplianceResult] = useState<ComplianceResult | null>(
  job.compliance_result ?? null
);
```

Also import `ComplianceResult` from `@/types` and `useState` if not already imported.

**Step 3: Insert ComplianceCheck component**

Place it between the ad preview mockup section and the readiness checklist section (before the readiness checklist div). Find the section boundary and add:

```tsx
<ComplianceCheck
  jobId={job.id}
  complianceResult={complianceResult}
  onResultUpdate={setComplianceResult}
/>
```

**Step 4: Add compliance to readiness checklist**

In the readiness checklist section (where it maps over languages and shows ReadinessItem components), add a new non-language-specific item after the existing items:

```tsx
{/* Compliance check status */}
{complianceResult && complianceResult.overall_verdict === "REJECT" && (
  <div className="flex items-center gap-2 text-xs text-red-600 mt-2">
    <AlertTriangle className="w-3.5 h-3.5" />
    <span>Compliance issues detected — review before publishing</span>
  </div>
)}
{complianceResult && complianceResult.overall_verdict === "WARNING" && (
  <div className="flex items-center gap-2 text-xs text-amber-600 mt-2">
    <AlertTriangle className="w-3.5 h-3.5" />
    <span>Compliance warnings — review recommended</span>
  </div>
)}
```

Import `AlertTriangle` from lucide-react if not already imported. Import `ComplianceResult` from `@/types`.

**Step 5: Verify build**

Run: `npm run build`
Expected: Build passes.

**Step 6: Commit**

```bash
git add src/components/images/MetaAdPreview.tsx
git commit -m "feat: integrate compliance check into Preview & Push tab"
```

---

### Task 7: Load compliance_result when fetching image job

**Files:**
- Check and modify: the page/component that loads the image job data and passes it to MetaAdPreview

**Step 1: Find where image_jobs are fetched for the concept detail page**

Search for the Supabase query that fetches the image job for the concept detail page (likely in a server component or API route). The `compliance_result` column needs to be included in the select query.

Look at: `src/app/concepts/[id]/page.tsx` or similar, and any API route that loads image jobs for the detail view (e.g., `/api/image-jobs/[id]`).

Add `compliance_result` to the `.select()` call wherever image jobs are fetched for the concept detail/preview page.

**Step 2: Verify build**

Run: `npm run build`
Expected: Build passes.

**Step 3: Commit**

```bash
git add <modified files>
git commit -m "feat: include compliance_result in image job queries"
```

---

### Task 8: Final verification and manual test

**Step 1: Run build**

```bash
npm run build
```
Expected: Clean build, no errors.

**Step 2: Start dev server and test manually**

```bash
npm run dev
```

1. Navigate to a concept with ad copy and images
2. Go to the Preview & Push tab
3. Verify the "Compliance Check" section appears
4. Click "Run Compliance Check"
5. Verify results appear with verdicts
6. Verify the check is advisory (publish button still works)

**Step 3: Commit any fixes**

If any fixes were needed, commit them.

**Step 4: Final commit**

```bash
git add -A  # Only if no sensitive files — otherwise stage specific files
git commit -m "feat: meta compliance check complete"
```
