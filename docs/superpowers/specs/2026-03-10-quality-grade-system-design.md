# Quality Grade System — Replace Numeric Scores with 3-Tier Grades

## Problem

GPT-4o's 0-100 quality scores for translation analysis cluster in the 82-86 range for all decent translations. The score doesn't help make publish/fix decisions. After clicking "Fix issues", the score barely changes. The number is meaningless.

## Solution

Replace the numeric score with a deterministic 3-tier grade derived from the issues GPT reports:

| Grade | Meaning | Color | Auto-fix? |
|-------|---------|-------|-----------|
| **Great** | No real issues | Green | No |
| **Good** | Minor issues, safe to publish | Amber | No |
| **Needs fixes** | Real problems found | Red | Yes |

The grade is computed from issue counts — not from GPT's subjective number.

## Grade Derivation Rules

### Pages (fluency_issues, grammar_issues, context_errors, name_localization)

```
needs_fixes:
  - Any context_errors, OR
  - Any name_localization errors, OR
  - 3+ grammar_issues

good:
  - 1-2 grammar_issues, OR
  - 3+ fluency_issues
  - (and no context_errors or name errors)

great:
  - 0 grammar_issues
  - 0 context_errors
  - 0 name_localization errors
  - ≤2 fluency_issues
```

### Images — vision (spelling_errors, grammar_issues, missing_text)

```
needs_fixes:
  - Any spelling_errors, OR
  - Any missing_text, OR
  - 3+ grammar_issues

good:
  - 1-2 grammar_issues
  - (and no spelling/missing)

great:
  - 0 issues across all categories
```

### Ad copy text (fluency_issues, grammar_issues, context_errors)

Same as pages but without name_localization.

## Changes

### 1. New utility: `src/lib/quality-grades.ts`

Exports:
- `type QualityGrade = "great" | "good" | "needs_fixes"`
- `derivePageGrade(analysis: PageQualityAnalysis): QualityGrade`
- `deriveImageGrade(analysis: QualityAnalysis): QualityGrade`
- `deriveCopyGrade(analysis): QualityGrade`
- `gradeConfig(grade): { label, color, bgColor, borderColor, icon }` — UI helper

### 2. GPT prompts — remove scoring

**Files:**
- `src/app/api/translate/analyze/route.ts` — remove scoring rubric, remove `quality_score` from JSON schema
- `src/lib/quality-analysis.ts` — remove scoring line from vision prompt
- `src/app/api/image-jobs/[id]/translate-copy/route.ts` — remove scoring from ad copy prompt

GPT still returns categorized issues + `suggested_corrections`. Just no numeric score.

### 3. Auto-fix loop — grade-based

**`src/components/pages/TranslationRow.tsx`:**
- Current: `if (currentAnalysis.quality_score >= settings.threshold) break`
- New: `if (derivePageGrade(currentAnalysis) !== "needs_fixes") break`

**`src/components/images/ImageJobDetail.tsx`:**
- Current: `if (analysis.quality_score >= threshold) break`
- New: `if (deriveImageGrade(analysis) !== "needs_fixes") break`

### 4. Settings page — remove threshold sliders

**Files:**
- `src/app/settings/tabs/PagesTab.tsx` — remove `pages_quality_threshold` slider
- `src/app/settings/tabs/StaticAdsTab.tsx` — remove `static_ads_quality_threshold` slider
- `src/app/settings/components.tsx` — remove threshold from type
- `src/lib/settings.ts` — remove threshold from `getPageQualitySettings()`, simplify to just `{ enabled: boolean }`

### 5. UI components — show grade badges

**`src/components/pages/TranslationRow.tsx`:**
- Replace `scoreColor()` / `scoreBg()` with grade-based colors
- Badge shows grade label + icon (e.g. green "Great" with check, red "Needs fixes" with warning)
- Remove "/ 85" threshold display
- "Fix" button only visible when grade is "needs_fixes"

**`src/components/builder/QualityPanel.tsx`:**
- Replace numeric score badge with grade badge
- Everything else (issues list, corrections) stays

**`src/components/images/QualityDetails.tsx`:**
- Replace "Quality: 84/100" with grade badge

**`src/components/images/ImagePreviewModal.tsx`:**
- Replace score color logic with grade-based colors

### 6. Database — backward compat

- Keep `quality_score` column in `translations` and `versions` tables
- Write a mapped value for backward compat: great=95, good=75, needs_fixes=40
- The actual grade is always derived from the analysis JSON, never stored separately
- `quality_analysis` JSONB column continues to store the full analysis (issues, corrections, assessment)

### 7. API response — remove quality_score

- `POST /api/translate/analyze` — still returns full analysis, but `quality_score` is no longer in GPT response. We add a mapped value before saving to DB.
- Score floor enforcement (`previous_context.previous_score`) becomes unnecessary — remove it.

## What stays the same

- GPT still analyzes and returns categorized issues + corrections
- `suggested_corrections` and the fix flow work identically
- Expand-to-see-issues UX stays
- Image vision analysis stays
- Usage logging stays
- `quality_analysis` JSONB storage stays

## Files to modify

1. `src/lib/quality-grades.ts` (NEW)
2. `src/app/api/translate/analyze/route.ts`
3. `src/app/api/translate/fix/route.ts` (minor — remove score floor logic reference)
4. `src/lib/quality-analysis.ts`
5. `src/app/api/image-jobs/[id]/translate-copy/route.ts`
6. `src/components/pages/TranslationRow.tsx`
7. `src/components/builder/QualityPanel.tsx`
8. `src/components/images/QualityDetails.tsx`
9. `src/components/images/ImagePreviewModal.tsx`
10. `src/components/images/ImageJobDetail.tsx`
11. `src/app/settings/tabs/PagesTab.tsx`
12. `src/app/settings/tabs/StaticAdsTab.tsx`
13. `src/app/settings/components.tsx`
14. `src/lib/settings.ts`
15. `src/types/index.ts`
