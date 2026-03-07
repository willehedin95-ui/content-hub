# Video Ads Full Pipeline — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add full video ad support — automated captions (Gladia + FFmpeg), ad copy workflow, landing page selection, launchpad integration, separate Meta video campaigns (500 SEK/day each), and pipeline tracking.

**Architecture:** Extend existing `video_jobs` / `video_translations` tables and `meta-video-push.ts`. Add caption pipeline as new module. Make launchpad format-agnostic (image + video). Create separate Meta video campaigns per market with their own campaign mappings.

**Tech Stack:** Gladia API (transcription), FFmpeg via `execFile` (caption burn-in — NOT `exec`, use `execFileNoThrow` from `src/utils/execFileNoThrow.ts` to prevent command injection), Next.js API routes, Supabase, Meta Marketing API v22.0

---

## Task 1: Database Migrations — New Columns

**Files:**
- Create: `scripts/migrations/2026-03-07-video-ads-pipeline.sql` (reference only, executed via Supabase Management API)

**Step 1: Add columns to video_jobs**

Run via Supabase Management API:
```sql
ALTER TABLE video_jobs
  ADD COLUMN IF NOT EXISTS ad_copy_translations jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS landing_page_id uuid REFERENCES pages(id) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ab_test_id uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS launchpad_priority integer DEFAULT NULL;
```

**Step 2: Add columns to video_translations**

```sql
ALTER TABLE video_translations
  ADD COLUMN IF NOT EXISTS caption_style text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS caption_srt_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS captioned_video_url text DEFAULT NULL;
```

**Step 3: Add format column to meta_campaign_mappings**

```sql
ALTER TABLE meta_campaign_mappings
  ADD COLUMN IF NOT EXISTS format text DEFAULT 'image';

-- Backfill existing rows as image format
UPDATE meta_campaign_mappings SET format = 'image' WHERE format IS NULL;
```

**Step 4: Add type column to concept_lifecycle**

```sql
ALTER TABLE concept_lifecycle
  ADD COLUMN IF NOT EXISTS concept_type text DEFAULT 'image';
```

**Step 5: Verify migrations**

Run: `curl` query to check columns exist on each table.

**Step 6: Commit**

```bash
git add scripts/migrations/2026-03-07-video-ads-pipeline.sql
git commit -m "feat: add video ads pipeline DB migrations"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Update VideoJob interface**

At `src/types/index.ts:1012-1049`, add new fields to `VideoJob`:
```typescript
// Add after landing_page_url field (~line 1040):
ad_copy_translations?: ConceptCopyTranslations;
landing_page_id: string | null;
ab_test_id: string | null;
launchpad_priority: number | null;
```

**Step 2: Update VideoTranslation interface**

At `src/types/index.ts:1072-1085`, add caption fields:
```typescript
// Add after error_message field:
caption_style: 'highlight' | 'clean' | null;
caption_srt_url: string | null;
captioned_video_url: string | null;
```

**Step 3: Update MetaCampaignMapping interface**

At `src/types/index.ts:476-486`, add format field:
```typescript
// Add after template_adset_name:
format: 'image' | 'video';
```

**Step 4: Update ConceptLifecycle interface**

At `src/types/index.ts:720-729`, add concept_type:
```typescript
// Add after hypothesis:
concept_type: 'image' | 'video';
```

**Step 5: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: update types for video ads pipeline"
```

---

## Task 3: Create Meta Video Campaigns

**Files:**
- No new files — executed via Meta API calls and Supabase inserts

**Step 1: Create three video campaigns via Meta API**

Use the existing `createCampaign()` function from `src/lib/meta.ts:162-177`. Create campaigns:
- `SE - Video Ads - HappySleep` (OUTCOME_SALES, PAUSED)
- `NO - Video Ads - HappySleep` (OUTCOME_SALES, PAUSED)
- `DK - Video Ads - HappySleep` (OUTCOME_SALES, PAUSED)

Can be done via a one-off script or API call. Record the returned campaign IDs.

**Step 2: Set daily budget to 500 SEK per campaign**

Meta CBO budgets are set at campaign level. Use the Meta API to update each campaign with `daily_budget: 50000` (Meta uses cents).

**Step 3: Insert campaign mappings into Supabase**

For each campaign, insert into `meta_campaign_mappings`:
```sql
INSERT INTO meta_campaign_mappings (product, country, meta_campaign_id, meta_campaign_name, format)
VALUES
  ('happysleep', 'SE', '<se_campaign_id>', 'SE - Video Ads - HappySleep', 'video'),
  ('happysleep', 'NO', '<no_campaign_id>', 'NO - Video Ads - HappySleep', 'video'),
  ('happysleep', 'DK', '<dk_campaign_id>', 'DK - Video Ads - HappySleep', 'video');
```

**Step 4: Verify campaigns exist in Meta**

Call `listCampaigns()` and confirm the three new campaigns appear.

**Step 5: Commit** (if script created)

---

## Task 4: Caption Pipeline — Gladia Integration

**Files:**
- Create: `src/lib/captions.ts`
- Create: `src/app/api/video-jobs/[id]/generate-captions/route.ts`

**Step 1: Create `src/lib/captions.ts`**

Module with these functions:

```typescript
// ── Gladia API ──────────────────────────────────────────────

/**
 * Upload audio to Gladia, poll for result, return word-level timestamps.
 * Gladia API: POST /v2/upload → POST /v2/transcription → GET /v2/transcription/:id
 * Free tier: 10 hrs/month. Returns word-level timestamps with SRT export.
 * Env var: GLADIA_API_KEY
 */
export async function transcribeAudio(
  audioUrl: string,
  language: string // "sv", "no", "da"
): Promise<TranscriptionResult>

/**
 * Convert Gladia word-level timestamps to SRT format (for "clean" style).
 */
export function wordsToSrt(words: GladiaWord[]): string

/**
 * Convert Gladia word-level timestamps to ASS format with per-word
 * highlight animation (for "highlight" style).
 * Uses word start/end times to color the active word differently.
 */
export function wordsToHighlightAss(words: GladiaWord[]): string

// ── FFmpeg burn-in ──────────────────────────────────────────
// IMPORTANT: Use execFile (NOT exec) to prevent command injection.
// Import execFileNoThrow from src/utils/execFileNoThrow.ts

/**
 * Extract audio from video URL (download → ffmpeg -i input.mp4 -vn audio.wav).
 * Returns path to temp audio file.
 */
export async function extractAudio(videoUrl: string): Promise<string>

/**
 * Burn SRT/ASS subtitles into video using FFmpeg via execFile.
 * For "clean": ffmpeg args ['-i', 'input.mp4', '-vf', 'subtitles=captions.srt:force_style=...', 'output.mp4']
 * For "highlight": ffmpeg args ['-i', 'input.mp4', '-vf', 'ass=captions.ass', 'output.mp4']
 * Returns path to output MP4.
 */
export async function burnCaptions(
  videoUrl: string,
  subtitleContent: string,
  style: 'highlight' | 'clean'
): Promise<string>

/**
 * Full pipeline: extract audio → transcribe → generate subtitles → burn in.
 * Uploads result to Supabase Storage. Returns URLs for subtitle file + captioned video.
 */
export async function generateCaptions(
  videoUrl: string,
  language: string,
  style: 'highlight' | 'clean'
): Promise<{ srtUrl: string; captionedVideoUrl: string }>
```

**Types:**
```typescript
interface GladiaWord {
  word: string;
  start: number; // seconds
  end: number;
  confidence: number;
}

interface TranscriptionResult {
  text: string;
  words: GladiaWord[];
  language: string;
}
```

**Step 2: Implement Gladia API integration**

Gladia flow:
1. `POST https://api.gladia.io/v2/upload` — upload audio file, get `audio_url`
2. `POST https://api.gladia.io/v2/transcription` — start transcription with `{ audio_url, language_behaviour: "manual", language: "sv" }`
3. `GET https://api.gladia.io/v2/transcription/:id` — poll until `status === "done"`, get `result.transcription.utterances[].words[]`

**Step 3: Implement SRT generation (clean style)**

Standard SRT format with ~3-5 words per group, timed by word boundaries. White text, 2-line max per subtitle block.

**Step 4: Implement ASS generation (highlight style)**

ASS (Advanced SubStation Alpha) with:
- Base style: white text, bold, centered bottom
- Active word: yellow/highlighted color
- Per-word timing using `\kf` karaoke tags or `{\1c&H00FFFF&}` color overrides with timing

**Step 5: Implement FFmpeg burn-in using execFile**

Use `execFileNoThrow` from `src/utils/execFileNoThrow.ts` to call FFmpeg safely (no shell injection). Download video to temp file, burn in subtitles, upload result to Supabase Storage.

**Step 6: Create API route `src/app/api/video-jobs/[id]/generate-captions/route.ts`**

```typescript
// POST: Generate captions for a video translation
// Body: { translationId: string, style: 'highlight' | 'clean' }
// 1. Load video_translation + source_video
// 2. Call generateCaptions(video_url, language, style)
// 3. Update video_translations with caption_style, caption_srt_url, captioned_video_url
// 4. Return { srtUrl, captionedVideoUrl }
```

**Step 7: Commit**

```bash
git add src/lib/captions.ts src/app/api/video-jobs/[id]/generate-captions/route.ts
git commit -m "feat: caption pipeline with Gladia transcription + FFmpeg burn-in"
```

---

## Task 5: Video Ad Copy Translation

**Files:**
- Create: `src/app/api/video-jobs/[id]/translate-copy/route.ts`
- Modify: `src/lib/meta-push.ts` (reference `translateAdCopyBatch` at line 569)

**Step 1: Create translate-copy API route**

Reuse the same pattern as image jobs. Reference: `src/lib/meta-push.ts:569-626` (`translateAdCopyBatch`).

```typescript
// POST /api/video-jobs/[id]/translate-copy
// Body: { primaryTexts: string[], headlines: string[] }
// 1. Load video_job
// 2. For each target language, call translateAdCopyBatch()
// 3. Store result in video_jobs.ad_copy_translations (same ConceptCopyTranslations shape)
// 4. Return translations
```

**Step 2: Commit**

```bash
git add src/app/api/video-jobs/[id]/translate-copy/route.ts
git commit -m "feat: video ad copy translation endpoint"
```

---

## Task 6: Update Video Push Flow

**Files:**
- Modify: `src/lib/meta-video-push.ts` (lines 332-525)
- Modify: `src/app/api/video-jobs/[id]/push-to-meta/route.ts`

**Step 1: Update `pushVideoToMeta` to use campaign mappings**

Current flow at `src/lib/meta-video-push.ts:332` takes a hardcoded `adSetId`. Refactor to:
1. Look up `meta_campaign_mappings` for `(product, country, format='video')`
2. Auto-create ad set from template (or create new ad set in the video campaign)
3. Use `captioned_video_url` instead of raw `video_url` when available
4. Use translated ad copy from `ad_copy_translations` per language
5. Look up landing page URL from `landing_page_id` (same pattern as image push at `meta-push.ts:232`)
6. Auto-assign concept number with "video" prefix in ad set name: `"SE #1 | video | concept name"`

**Step 2: Update push API route**

Modify the existing route to:
- No longer require `adSetId` in body (resolved from campaign mappings)
- Accept optional `markets` filter
- Return per-language results

**Step 3: Commit**

```bash
git add src/lib/meta-video-push.ts src/app/api/video-jobs/[id]/push-to-meta/route.ts
git commit -m "feat: video push uses campaign mappings + captioned video + translated copy"
```

---

## Task 7: Launchpad — Support Video Concepts

**Files:**
- Modify: `src/lib/pipeline.ts` (lines 1267-1455: `calculateAvailableBudget`, `getLaunchpadConcepts`)
- Modify: `src/app/api/launchpad/route.ts`
- Modify: `src/app/api/launchpad/push/route.ts`
- Modify: `src/app/launchpad/LaunchpadClient.tsx`

**Step 1: Update `getLaunchpadConcepts` in `pipeline.ts:1382`**

Currently queries only `image_jobs`. Change to:
1. Query `image_jobs` where `launchpad_priority IS NOT NULL` → map to `{ ...fields, type: 'image' }`
2. Query `video_jobs` where `launchpad_priority IS NOT NULL` → map to `{ ...fields, type: 'video' }`
3. Merge both arrays, sort by `launchpad_priority`
4. For video jobs, get thumbnail from `source_videos` (first video's `thumbnail_url`)

Return type changes: rename `imageJobId` → `conceptId`, add `type: 'image' | 'video'`.

**Step 2: Update `calculateAvailableBudget` in `pipeline.ts:1267`**

Currently groups by country only. Need to also account for video campaign budgets separately. The `meta_campaign_mappings` query at line 1274 should include `format` and calculate budgets for both image and video campaigns. Return shape adds format dimension:
```typescript
Record<string, {
  image: { canPush, campaignBudget, ... },
  video: { canPush, campaignBudget, ... }
}>
```

**Step 3: Update launchpad GET route (`src/app/api/launchpad/route.ts:6-12`)**

No changes needed — calls `getLaunchpadConcepts()` which now returns both types.

**Step 4: Update launchpad POST route (`src/app/api/launchpad/route.ts:14-82`)**

Currently accepts `{ imageJobId }`. Change to accept `{ conceptId, type: 'image' | 'video' }`:
- If type is `image`: same logic as before (query `image_jobs`, validate, set `launchpad_priority`)
- If type is `video`: query `video_jobs`, validate (has ad copy, has landing page, has captioned videos), set `launchpad_priority`
- For video: no `image_job_markets` equivalent exists, so create lifecycle entries keyed by `(video_job_id, country)` using the job's `target_languages` to derive markets

**Step 5: Update launchpad DELETE route (`src/app/api/launchpad/route.ts:84-112`)**

Accept `{ conceptId, type }`. Route to correct table.

**Step 6: Update launchpad push route (`src/app/api/launchpad/push/route.ts`)**

Accept `{ conceptId, type, markets }`:
- If `image`: call `pushConceptToMeta()` (existing)
- If `video`: call `pushVideoToMeta()` (updated in Task 6)
- Lifecycle transitions work the same either way

**Step 7: Update LaunchpadClient.tsx UI**

- Add type filter tabs: "All" | "Images" | "Videos"
- Add type badge on each concept card
- Video cards show play icon overlay on thumbnail
- Reorder handles mixed types
- Push button routes to correct push flow

**Step 8: Commit**

```bash
git add src/lib/pipeline.ts src/app/api/launchpad/ src/app/launchpad/LaunchpadClient.tsx
git commit -m "feat: launchpad supports both image and video concepts"
```

---

## Task 8: Video Job Detail Page — Step-Based Flow

**Files:**
- Modify: `src/components/video-ads/VideoJobDetail.tsx`

**Step 1: Add stepper UI**

Refactor `VideoJobDetail.tsx` to use a step-based layout matching image concepts:
- Step 0: Video Generation (existing content, reorganized into step)
- Step 1: Captions (new)
- Step 2: Ad Copy (new)
- Step 3: Preview & Push (new)

**Step 2: Step 1 — Captions UI**

- Caption style selector: "Word-by-word highlight" / "Clean subtitles"
- "Generate Captions" button per translation
- Shows progress (extracting audio → transcribing → burning in)
- Preview: video player showing captioned video
- "Re-generate" button if captions are wrong
- Optional: edit SRT text before re-burning

**Step 3: Step 2 — Ad Copy UI**

- Primary text textarea (English, 2-3 variations)
- Headlines textarea (English, 2-3 variations)
- "Translate" button → calls `/api/video-jobs/[id]/translate-copy`
- Shows per-language translations with quality scores
- Same component pattern as `ImageJobDetail.tsx` ad copy step

**Step 4: Step 3 — Landing Page & Push UI**

- Landing page dropdown (or AB test selector)
- Campaign mapping info per market
- Budget availability per market (video campaign)
- "Add to Launchpad" or direct "Push to Meta" button
- Shows push results per language

**Step 5: Commit**

```bash
git add src/components/video-ads/VideoJobDetail.tsx
git commit -m "feat: video job detail page with step-based flow"
```

---

## Task 9: Pipeline Tracking for Video Concepts

**Files:**
- Modify: `src/lib/pipeline.ts` (various functions that query concept_lifecycle, concept_metrics)
- Modify: pipeline page component (if it filters by type)

**Step 1: Update pipeline queries to include video concepts**

Functions in `pipeline.ts` that query `concept_lifecycle` and `concept_metrics` currently join through `image_job_markets`. For video concepts, the lifecycle entries use `concept_type = 'video'`. Update queries to handle both:
- When computing signals, check `concept_type` to determine which table to join for concept details
- Performance sync from Meta should pull data for video ad sets too

**Step 2: Update `generateConceptLearning` for video concepts**

When a video concept is killed or promoted, generate learnings tagged as video. Include video-specific context (format_type, hook_type, script_structure) in the learning.

**Step 3: Update pipeline page to show video concepts**

Add type badge (same as launchpad). Video concepts show in the pipeline alongside image concepts.

**Step 4: Commit**

```bash
git add src/lib/pipeline.ts
git commit -m "feat: pipeline tracking includes video concepts"
```

---

## Task 10: Environment Variables & Configuration

**Files:**
- Modify: `.env.local` (or Railway env vars)

**Step 1: Add Gladia API key**

```
GLADIA_API_KEY=<key>
```

Sign up at gladia.io, get API key from dashboard. Free tier: 10 hrs/month.

**Step 2: Verify FFmpeg is available on Railway**

Railway's default Node.js buildpack includes FFmpeg. Verify with:
```bash
which ffmpeg && ffmpeg -version
```

If not available, add to `nixpacks.toml` or use a Docker build.

**Step 3: Commit** (if config files changed)

---

## Execution Order

Tasks 1-3 are foundational and must be done first (sequential):
1. DB migrations
2. TypeScript types
3. Create Meta campaigns

Tasks 4-5 are independent and can be parallelized:
4. Caption pipeline (Gladia + FFmpeg)
5. Video ad copy translation

Task 6 depends on 4 + 5:
6. Update video push flow

Tasks 7-8 depend on 6:
7. Launchpad integration
8. Video job detail page

Task 9 depends on 7:
9. Pipeline tracking

Task 10 can be done anytime:
10. Environment setup

```
1 → 2 → 3 ──┬── 4 ──┐
             └── 5 ──┤
                     ├── 6 ──┬── 7 ── 9
                     │       └── 8
                     └── 10
```
