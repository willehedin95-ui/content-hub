# Quality Grade System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace meaningless 0-100 quality scores with deterministic Great/Good/Needs-fixes grades derived from issue counts.

**Architecture:** New `quality-grades.ts` utility derives grades from analysis objects. GPT prompts drop numeric scoring. All UI surfaces show grade badges instead of numbers. Auto-fix loops use grade instead of threshold.

**Tech Stack:** TypeScript, React, Next.js, OpenAI API (GPT-4o)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/quality-grades.ts` | CREATE | Grade derivation logic + UI config helper |
| `src/types/index.ts` | MODIFY | Update `PageQualityAnalysis` type, add `QualityGrade` type |
| `src/app/api/translate/analyze/route.ts` | MODIFY | Remove scoring rubric from prompt, derive grade |
| `src/lib/quality-analysis.ts` | MODIFY | Remove scoring from image vision prompt |
| `src/app/api/image-jobs/[id]/translate-copy/route.ts` | MODIFY | Remove scoring from ad copy prompt |
| `src/lib/settings.ts` | MODIFY | Remove threshold from `getPageQualitySettings()` |
| `src/app/settings/components.tsx` | MODIFY | Remove threshold fields from Settings type |
| `src/app/settings/page.tsx` | MODIFY | Remove threshold defaults |
| `src/app/settings/tabs/PagesTab.tsx` | MODIFY | Remove threshold slider |
| `src/app/settings/tabs/StaticAdsTab.tsx` | MODIFY | Remove threshold slider |
| `src/components/pages/TranslationRow.tsx` | MODIFY | Grade badge, grade-based fix loop |
| `src/components/builder/QualityPanel.tsx` | MODIFY | Grade badge instead of score |
| `src/components/builder/BuilderContext.tsx` | MODIFY | Store grade instead of score |
| `src/components/builder/BuilderStatusBar.tsx` | MODIFY | Grade badge in status bar |
| `src/components/builder/BuilderTopBar.tsx` | MODIFY | Grade badge in top bar |
| `src/components/images/QualityDetails.tsx` | MODIFY | Grade badge instead of score/100 |
| `src/components/images/ImagePreviewModal.tsx` | MODIFY | Grade badge in version tabs |
| `src/components/images/ImageJobDetail.tsx` | MODIFY | Grade-based retry loop |
| `src/components/images/ConceptAdCopyStep.tsx` | MODIFY | Grade badge for copy quality |
| `src/components/video-ads/VideoJobDetail.tsx` | MODIFY | Grade badge for copy quality |

---

## Chunk 1: Core utility + types + API prompts

### Task 1: Create quality-grades.ts utility

**Files:**
- Create: `src/lib/quality-grades.ts`

- [ ] **Step 1: Create the grade utility file**

```typescript
// src/lib/quality-grades.ts

export type QualityGrade = "great" | "good" | "needs_fixes";

interface GradeConfig {
  label: string;
  color: string;       // text color class
  bg: string;          // background + border classes
  icon: "check" | "minus" | "alert";
}

const GRADE_CONFIG: Record<QualityGrade, GradeConfig> = {
  great: {
    label: "Great",
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
    icon: "check",
  },
  good: {
    label: "Good",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
    icon: "minus",
  },
  needs_fixes: {
    label: "Needs fixes",
    color: "text-red-700",
    bg: "bg-red-50 border-red-200",
    icon: "alert",
  },
};

export function gradeConfig(grade: QualityGrade): GradeConfig {
  return GRADE_CONFIG[grade];
}

/**
 * Derive grade for page translations.
 * Uses: fluency_issues, grammar_issues, context_errors, name_localization
 */
export function derivePageGrade(analysis: {
  fluency_issues?: string[];
  grammar_issues?: string[];
  context_errors?: string[];
  name_localization?: string[];
}): QualityGrade {
  const context = analysis.context_errors?.length ?? 0;
  const names = analysis.name_localization?.length ?? 0;
  const grammar = analysis.grammar_issues?.length ?? 0;
  const fluency = analysis.fluency_issues?.length ?? 0;

  if (context > 0 || names > 0 || grammar >= 3) return "needs_fixes";
  if (grammar > 0 || fluency > 2) return "good";
  return "great";
}

/**
 * Derive grade for image vision analysis.
 * Uses: spelling_errors, grammar_issues, missing_text
 */
export function deriveImageGrade(analysis: {
  spelling_errors?: string[];
  grammar_issues?: string[];
  missing_text?: string[];
}): QualityGrade {
  const spelling = analysis.spelling_errors?.length ?? 0;
  const missing = analysis.missing_text?.length ?? 0;
  const grammar = analysis.grammar_issues?.length ?? 0;

  if (spelling > 0 || missing > 0 || grammar >= 3) return "needs_fixes";
  if (grammar > 0) return "good";
  return "great";
}

/**
 * Derive grade for ad copy text analysis.
 * Uses: fluency_issues, grammar_issues, context_errors
 */
export function deriveCopyGrade(analysis: {
  fluency_issues?: string[];
  grammar_issues?: string[];
  context_errors?: string[];
}): QualityGrade {
  const context = analysis.context_errors?.length ?? 0;
  const grammar = analysis.grammar_issues?.length ?? 0;
  const fluency = analysis.fluency_issues?.length ?? 0;

  if (context > 0 || grammar >= 3) return "needs_fixes";
  if (grammar > 0 || fluency > 2) return "good";
  return "great";
}

/** Map grade to a backward-compat numeric score for DB storage */
export function gradeToNumeric(grade: QualityGrade): number {
  switch (grade) {
    case "great": return 95;
    case "good": return 80;
    case "needs_fixes": return 40;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/quality-grades.ts
git commit -m "feat: add quality grade derivation utility"
```

---

### Task 2: Update types

**Files:**
- Modify: `src/types/index.ts:62-70` (PageQualityAnalysis)

- [ ] **Step 1: Make quality_score optional in PageQualityAnalysis**

In `src/types/index.ts`, change line 63 from:
```typescript
  quality_score: number;
```
to:
```typescript
  quality_score?: number;
```

This makes the field optional since GPT will no longer return it.

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: make quality_score optional in PageQualityAnalysis"
```

---

### Task 3: Update page translation analysis API prompt

**Files:**
- Modify: `src/app/api/translate/analyze/route.ts`

- [ ] **Step 1: Remove scoring from GPT prompt and response**

In the system prompt (lines 75-120), make these changes:

1. Remove `"quality_score": <0-100>,` from the JSON response schema (line 87)
2. Remove the entire scoring guide block (lines 111-115):
```
Scoring guide:
- 90-100: Reads naturally as native ${langLabel} content. No grammar errors. Character names match the original.
- 75-89: Good quality with minor issues. A few awkward phrases but generally fluent.
- 50-74: Noticeable problems. Multiple unnatural phrases, grammar errors, or changed character names.
- 0-49: Poor quality. Reads like a machine translation. Significant issues.
```

3. Remove the score floor enforcement (lines 177-183):
```typescript
    if (previous_context?.previous_score != null && analysis.quality_score < previous_context.previous_score) {
      ...
      analysis.quality_score = previous_context.previous_score;
    }
```

4. Remove scoring constraint from the re-analysis context (line 147):
```
SCORING: The previous score was ${previous_context.previous_score}. Since corrections were applied...
```

5. After parsing the GPT response, derive the grade and write a mapped numeric score:

```typescript
    import { derivePageGrade, gradeToNumeric } from "@/lib/quality-grades";

    // ... after JSON.parse ...

    const grade = derivePageGrade(analysis);
    analysis.quality_score = gradeToNumeric(grade);
```

6. Save to DB stays the same — `quality_score` gets the mapped numeric, `quality_analysis` gets the full analysis JSON.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/translate/analyze/route.ts
git commit -m "feat: remove numeric scoring from page quality prompt, derive grade"
```

---

### Task 4: Update image vision analysis prompt

**Files:**
- Modify: `src/lib/quality-analysis.ts:29-33`

- [ ] **Step 1: Remove scoring from vision prompt**

In the system prompt (line 29-32), change the JSON schema to remove `"quality_score":<0-100>,` and remove the scoring line:
```
Scoring: 90-100 perfect, 70-89 minor issues, 50-69 noticeable problems, 0-49 major errors. Be strict — one misspelled word reduces score.
```

After parsing the response, derive the grade and set a mapped score:

```typescript
import { deriveImageGrade, gradeToNumeric } from "@/lib/quality-grades";

// ... after parsing ...

const grade = deriveImageGrade(analysis);
analysis.quality_score = gradeToNumeric(grade);
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/quality-analysis.ts
git commit -m "feat: remove numeric scoring from image vision prompt, derive grade"
```

---

### Task 5: Update ad copy translation quality prompt

**Files:**
- Modify: `src/app/api/image-jobs/[id]/translate-copy/route.ts:133-149`

- [ ] **Step 1: Remove scoring from ad copy prompt**

In the system prompt, remove `"quality_score": <0-100>,` from the JSON schema and remove the "Be strict" scoring instructions.

After parsing:
```typescript
import { deriveCopyGrade, gradeToNumeric } from "@/lib/quality-grades";

// ... after JSON.parse ...

const grade = deriveCopyGrade(analysis);
analysis.quality_score = gradeToNumeric(grade);
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/image-jobs/[id]/translate-copy/route.ts
git commit -m "feat: remove numeric scoring from ad copy prompt, derive grade"
```

---

## Chunk 2: Settings cleanup

### Task 6: Remove threshold from settings

**Files:**
- Modify: `src/lib/settings.ts:7,16,47-52`
- Modify: `src/app/settings/components.tsx:16-17`
- Modify: `src/app/settings/page.tsx:39,41`
- Modify: `src/app/settings/tabs/PagesTab.tsx:27-46`
- Modify: `src/app/settings/tabs/StaticAdsTab.tsx:29-48`

- [ ] **Step 1: Simplify getPageQualitySettings in settings.ts**

Change `getPageQualitySettings()` (lines 47-53) from:
```typescript
export function getPageQualitySettings(): { enabled: boolean; threshold: number } {
  const settings = getSettings();
  return {
    enabled: settings.pages_quality_enabled ?? true,
    threshold: settings.pages_quality_threshold ?? 85,
  };
}
```
to:
```typescript
export function getPageQualitySettings(): { enabled: boolean } {
  const settings = getSettings();
  return {
    enabled: settings.pages_quality_enabled ?? true,
  };
}
```

Remove `pages_quality_threshold` from the `Settings` interface (line 16) and `static_ads_quality_threshold` (line 7).

- [ ] **Step 2: Remove threshold from Settings type in components.tsx**

In `src/app/settings/components.tsx`, remove lines:
```typescript
  pages_quality_threshold: number;
  static_ads_quality_threshold: number;
```

- [ ] **Step 3: Remove threshold defaults in settings page**

In `src/app/settings/page.tsx`, remove:
```typescript
    pages_quality_threshold: 85,
    static_ads_quality_threshold: 80,
```

- [ ] **Step 4: Remove threshold slider from PagesTab**

In `src/app/settings/tabs/PagesTab.tsx`, remove the entire `<RowDivider />` + threshold `<Row>` block (lines 27-46), keeping only the quality analysis toggle.

- [ ] **Step 5: Remove threshold slider from StaticAdsTab**

In `src/app/settings/tabs/StaticAdsTab.tsx`, remove the `<RowDivider />` + threshold `<Row>` block (lines 29-48).

- [ ] **Step 6: Commit**

```bash
git add src/lib/settings.ts src/app/settings/components.tsx src/app/settings/page.tsx src/app/settings/tabs/PagesTab.tsx src/app/settings/tabs/StaticAdsTab.tsx
git commit -m "feat: remove quality threshold settings (replaced by grade system)"
```

---

## Chunk 3: Page translation UI (TranslationRow + Builder)

### Task 7: Update TranslationRow with grade badges and grade-based fix loop

**Files:**
- Modify: `src/components/pages/TranslationRow.tsx`

- [ ] **Step 1: Replace score helpers with grade-based logic**

At the top of the file, add import:
```typescript
import { derivePageGrade, gradeConfig, QualityGrade } from "@/lib/quality-grades";
```

Remove the `scoreColor()` and `scoreBg()` helper functions (lines 41-51).

- [ ] **Step 2: Update the quality state**

Change quality state from `{ score: number | null, analysis }` to `{ grade: QualityGrade | null, analysis }`. Update all `setQuality` calls:

Where it currently does:
```typescript
setQuality({ score: currentAnalysis.quality_score, analysis: currentAnalysis });
```
Change to:
```typescript
setQuality({ grade: derivePageGrade(currentAnalysis), analysis: currentAnalysis });
```

- [ ] **Step 3: Update auto-fix loop condition**

Change line 361 from:
```typescript
if (currentAnalysis.quality_score >= settings.threshold) {
```
to:
```typescript
if (derivePageGrade(currentAnalysis) !== "needs_fixes") {
```

Remove `settings.threshold` usage since `getPageQualitySettings()` no longer returns it.

- [ ] **Step 4: Update quality badge UI**

Replace the score badge block (lines 768-798) with grade-based badge:

```tsx
{quality.grade !== null && !isProcessing && (
  <div className="flex items-center gap-1.5 shrink-0">
    {progress.elapsedSeconds > 0 && (
      <span className="text-xs text-gray-400">{formatElapsed(progress.elapsedSeconds)}</span>
    )}
    <button
      onClick={() => setShowDetails((d) => !d)}
      className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${gradeConfig(quality.grade).bg} ${gradeConfig(quality.grade).color}`}
    >
      {quality.grade === "great" && <CheckCircle2 className="w-3.5 h-3.5" />}
      {quality.grade === "needs_fixes" && <AlertCircle className="w-3.5 h-3.5" />}
      <span>{gradeConfig(quality.grade).label}</span>
      {showDetails ? (
        <ChevronUp className="w-3 h-3 text-gray-400" />
      ) : (
        <ChevronDown className="w-3 h-3 text-gray-400" />
      )}
    </button>
    {quality.grade === "needs_fixes" && hasSuggestedCorrections && (
      <button
        onClick={() => { handleFixQuality(); }}
        disabled={progress.loading !== null}
        className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded-full transition-colors disabled:opacity-40"
      >
        <RefreshCw className="w-3 h-3" />
        Fix
      </button>
    )}
  </div>
)}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/pages/TranslationRow.tsx
git commit -m "feat: grade badges + grade-based fix loop in TranslationRow"
```

---

### Task 8: Update BuilderContext to use grades

**Files:**
- Modify: `src/components/builder/BuilderContext.tsx`

- [ ] **Step 1: Replace qualityScore with qualityGrade**

Add import:
```typescript
import { derivePageGrade, QualityGrade } from "@/lib/quality-grades";
```

Change the context interface (line 133):
```typescript
qualityScore: number | null;
```
to:
```typescript
qualityGrade: QualityGrade | null;
```

Change state (line 419-420):
```typescript
const [qualityScore, setQualityScore] = useState<number | null>(
  translation.quality_score ?? null
);
```
to:
```typescript
const [qualityGrade, setQualityGrade] = useState<QualityGrade | null>(
  translation.quality_analysis ? derivePageGrade(translation.quality_analysis) : null
);
```

Update `runQualityAnalysis` (line 1411):
```typescript
setQualityScore(data.quality_score ?? null);
```
to:
```typescript
setQualityGrade(data ? derivePageGrade(data) : null);
```

Update `handleFixQuality` (line 1448):
```typescript
setQualityScore(null);
```
to:
```typescript
setQualityGrade(null);
```

Update `doRetranslate` (line 1467):
```typescript
setQualityScore(null);
```
to:
```typescript
setQualityGrade(null);
```

Update the context value (line 2089):
```typescript
qualityScore,
```
to:
```typescript
qualityGrade,
```

- [ ] **Step 2: Commit**

```bash
git add src/components/builder/BuilderContext.tsx
git commit -m "feat: replace qualityScore with qualityGrade in BuilderContext"
```

---

### Task 9: Update QualityPanel in builder

**Files:**
- Modify: `src/components/builder/QualityPanel.tsx`

- [ ] **Step 1: Replace score with grade**

Add import:
```typescript
import { gradeConfig } from "@/lib/quality-grades";
```

Change the destructured context value from `qualityScore` to `qualityGrade`.

Replace the scoreColor/scoreBg logic (lines 25-37) with:
```typescript
const gc = qualityGrade ? gradeConfig(qualityGrade) : null;
```

Replace the score badge in the header (lines 73-77):
```tsx
<span className={`text-sm font-bold px-2 py-0.5 rounded-full ${gc?.bg} ${gc?.color}`}>
  {gc?.label}
</span>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/builder/QualityPanel.tsx
git commit -m "feat: grade badge in builder QualityPanel"
```

---

### Task 10: Update BuilderStatusBar

**Files:**
- Modify: `src/components/builder/BuilderStatusBar.tsx`

- [ ] **Step 1: Replace score with grade in status bar**

Add import:
```typescript
import { gradeConfig } from "@/lib/quality-grades";
```

Change destructured value from `qualityScore` to `qualityGrade`.

Replace the qualityColor logic (lines 17-24) with:
```typescript
const gc = qualityGrade ? gradeConfig(qualityGrade) : null;
```

Replace the badge (lines 46-52):
```tsx
{gc && (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${gc.bg} ${gc.color}`}>
    {gc.label}
  </span>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/builder/BuilderStatusBar.tsx
git commit -m "feat: grade badge in BuilderStatusBar"
```

---

### Task 11: Update BuilderTopBar

**Files:**
- Modify: `src/components/builder/BuilderTopBar.tsx`

- [ ] **Step 1: Replace score with grade in top bar**

Add import:
```typescript
import { gradeConfig } from "@/lib/quality-grades";
```

Change destructured value from `qualityScore` to `qualityGrade`.

Replace qualityColor logic (lines 49-55) with:
```typescript
const gc = qualityGrade ? gradeConfig(qualityGrade) : null;
```

Replace badge (lines 129-136):
```tsx
{gc && (
  <button
    onClick={() => setShowQualityDetails(!showQualityDetails)}
    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${gc.bg} ${gc.color} transition-colors`}
    title="Translation quality"
  >
    {gc.label}
  </button>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/builder/BuilderTopBar.tsx
git commit -m "feat: grade badge in BuilderTopBar"
```

---

## Chunk 4: Image + ad copy UI

### Task 12: Update image QualityDetails

**Files:**
- Modify: `src/components/images/QualityDetails.tsx`

- [ ] **Step 1: Replace score with grade badge**

Rewrite the component:
```tsx
"use client";

import { useState } from "react";
import { Version } from "@/types";
import { deriveImageGrade, gradeConfig } from "@/lib/quality-grades";

export default function QualityDetails({ version }: { version: Version }) {
  const [expanded, setExpanded] = useState(false);
  const analysis = version.quality_analysis;
  if (!analysis) return null;

  const grade = deriveImageGrade(analysis);
  const gc = gradeConfig(grade);

  return (
    <div className="px-5 pt-2 shrink-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${gc.bg} ${gc.color} hover:opacity-80 transition-opacity`}
      >
        {gc.label}
        <span className="text-xs ml-0.5">{expanded ? "\u25B2" : "\u25BC"}</span>
      </button>

      {expanded && analysis.overall_assessment && (
        <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs">
          <p className="text-gray-700">{analysis.overall_assessment}</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/images/QualityDetails.tsx
git commit -m "feat: grade badge in image QualityDetails"
```

---

### Task 13: Update ImagePreviewModal version tabs

**Files:**
- Modify: `src/components/images/ImagePreviewModal.tsx:275-281`

- [ ] **Step 1: Replace score colors with grade**

Add import:
```typescript
import { deriveImageGrade, gradeConfig } from "@/lib/quality-grades";
```

Replace the score display (lines 275-281):
```tsx
{v.quality_score != null && (
  <span className={`ml-1 ${
    v.quality_score >= 80 ? "text-emerald-600" :
    v.quality_score >= 60 ? "text-yellow-600" : "text-red-600"
  }`}>
    {Math.round(v.quality_score)}
  </span>
)}
```

With:
```tsx
{v.quality_analysis && (
  <span className={`ml-1 ${gradeConfig(deriveImageGrade(v.quality_analysis)).color}`}>
    {gradeConfig(deriveImageGrade(v.quality_analysis)).label}
  </span>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/images/ImagePreviewModal.tsx
git commit -m "feat: grade badge in ImagePreviewModal version tabs"
```

---

### Task 14: Update ImageJobDetail retry loop

**Files:**
- Modify: `src/components/images/ImageJobDetail.tsx:886,924`

- [ ] **Step 1: Replace threshold-based retry with grade-based**

Add import:
```typescript
import { deriveImageGrade } from "@/lib/quality-grades";
```

Remove the threshold variable (line 886):
```typescript
const threshold = settings.static_ads_quality_threshold ?? DEFAULT_QUALITY_THRESHOLD;
```

Change line 924 from:
```typescript
if (analysis.quality_score >= threshold) break;
```
to:
```typescript
if (deriveImageGrade(analysis) !== "needs_fixes") break;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/images/ImageJobDetail.tsx
git commit -m "feat: grade-based retry loop in ImageJobDetail"
```

---

### Task 15: Update QualityBadge in ConceptAdCopyStep

**Files:**
- Modify: `src/components/images/ConceptAdCopyStep.tsx:24-36`

- [ ] **Step 1: Replace score-based QualityBadge with grade-based**

Add import:
```typescript
import { deriveCopyGrade, gradeConfig } from "@/lib/quality-grades";
```

Replace the `QualityBadge` function:
```tsx
function QualityBadge({ score }: { score: number }) {
  ...
}
```
with:
```tsx
function QualityBadge({ analysis }: { analysis: { fluency_issues?: string[]; grammar_issues?: string[]; context_errors?: string[] } }) {
  const grade = deriveCopyGrade(analysis);
  const gc = gradeConfig(grade);
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${gc.bg} ${gc.color}`}>
      {gc.label}
    </span>
  );
}
```

Update the call site (line 381) from:
```tsx
<QualityBadge score={ct.quality_score} />
```
to:
```tsx
{ct.quality_analysis && <QualityBadge analysis={ct.quality_analysis} />}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/images/ConceptAdCopyStep.tsx
git commit -m "feat: grade badge in ConceptAdCopyStep"
```

---

### Task 16: Update QualityBadge in VideoJobDetail

**Files:**
- Modify: `src/components/video-ads/VideoJobDetail.tsx:87-99,1406-1407`

- [ ] **Step 1: Replace score-based QualityBadge with grade-based**

Add import:
```typescript
import { deriveCopyGrade, gradeConfig } from "@/lib/quality-grades";
```

Replace the `QualityBadge` function (lines 87-99):
```tsx
function QualityBadge({ analysis }: { analysis: { fluency_issues?: string[]; grammar_issues?: string[]; context_errors?: string[] } }) {
  const grade = deriveCopyGrade(analysis);
  const gc = gradeConfig(grade);
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${gc.bg} ${gc.color}`}>
      {gc.label}
    </span>
  );
}
```

Update the call site (line 1407) from:
```tsx
<QualityBadge score={ct.quality_score} />
```
to:
```tsx
{ct.quality_analysis && <QualityBadge analysis={ct.quality_analysis} />}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/video-ads/VideoJobDetail.tsx
git commit -m "feat: grade badge in VideoJobDetail"
```

---

## Chunk 5: Verify and final commit

### Task 17: Build verification

- [ ] **Step 1: Run TypeScript check**

```bash
cd /Users/williamhedin/Claude\ Code/content-hub && npx tsc --noEmit
```

Expected: No type errors. If there are errors, they'll likely be from stale `qualityScore` references — fix any remaining references.

- [ ] **Step 2: Run build**

```bash
cd /Users/williamhedin/Claude\ Code/content-hub && npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Fix any issues and commit**

If build passes clean, no action needed. If there are issues, fix them and commit:
```bash
git add -A && git commit -m "fix: resolve build issues from quality grade migration"
```
