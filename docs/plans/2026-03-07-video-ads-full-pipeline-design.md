# Video Ads Full Pipeline Design

**Date:** 2026-03-07
**Approach:** Extend existing video_jobs pipeline (Approach A)

## Overview

Add full video ad support to content-hub: automated captions, ad copy workflow, landing page selection, launchpad integration, separate Meta video campaigns, and pipeline tracking. Builds on existing `video_jobs`, `source_videos`, `video_translations` tables and `meta-video-push.ts`.

## 1. Caption Pipeline

**Flow:** Video generated → extract audio → Gladia transcribes → word-level timestamps → FFmpeg burns captions into video

**Module:** `src/lib/captions.ts`

**Transcription:** Gladia API (free tier: 10 hrs/month, covers 50+ short videos). Upload audio extracted from video via FFmpeg, poll for result, get word-level timestamps in SRT format. Pass expected language as hint for accuracy.

**Two caption styles:**
- **"highlight"** — word-by-word highlight (TikTok/Reels style). Generated as ASS subtitle with per-word color timing.
- **"clean"** — full sentence, white text with dark outline. Standard SRT burn-in.

**Burn-in:** FFmpeg runs server-side (Railway has FFmpeg). Burns captions into video, outputs final MP4. Stored in Supabase Storage alongside original.

**New columns on `video_translations`:**
- `caption_style` text — "highlight" | "clean" | null
- `caption_srt_url` text — stored SRT/ASS file
- `captioned_video_url` text — final video with burned-in captions (pushed to Meta)

**When:** After video generation, before Meta push. User picks style in UI, hits "Generate Captions".

## 2. Video Concept Workflow (Step-based)

Same step-based flow as image concepts on `/video-ads/[id]`:

**Step 0: Video Generation** — existing, no changes

**Step 1: Captions** — pick style (highlight/clean) per language, generate, preview, re-generate if wrong (edit SRT → re-burn)

**Step 2: Ad Copy** — primary text + headlines in English, translate to target languages via GPT-4o, quality scores. Stored in `video_jobs.ad_copy_translations` (same JSON shape as `image_jobs.ad_copy_translations`)

**Step 3: Preview & Push** — select landing page or AB test, view campaign mappings, budget check, push to Meta in PAUSED state

**New/updated columns on `video_jobs`:**
- `ad_copy_translations` jsonb — per-language translations (new, same shape as image_jobs)
- `landing_page_id` uuid — FK to pages table (upgrade from `landing_page_url`)
- `ab_test_id` uuid — FK to ab_tests (new)
- `launchpad_priority` int — for launchpad ordering (new)

## 3. Launchpad Integration

Launchpad becomes format-agnostic. Both image and video concepts in the same queue.

- **Type filter tabs:** "All" | "Images" | "Videos" (default: "All")
- **Type badge** on each card ("Image" / "Video")
- Video cards show thumbnail with play icon overlay
- Reorder works across both types (priority is just a number)
- Push routes to correct handler (meta-push.ts vs meta-video-push.ts)
- Budget check uses correct campaign (video campaign for video concepts)

**API changes (`/api/launchpad`):**
- GET: query both `image_jobs` and `video_jobs` where `launchpad_priority > 0`, merge, sort by priority
- POST reorder: accepts `{id, type: "image"|"video", priority}[]`
- POST push: routes to correct handler based on type
- DELETE: accepts `{id, type}`

**Data shape:** `LaunchpadConcept` gets `type: "image" | "video"` field.

## 4. Meta Campaign Structure

Separate video campaigns per market, 500 SEK/day each:

| Campaign | Market | Budget |
|----------|--------|--------|
| SE - Video Ads - HappySleep | Sweden | 500 SEK/day CBO |
| NO - Video Ads - HappySleep | Norway | 500 SEK/day CBO |
| DK - Video Ads - HappySleep | Denmark | 500 SEK/day CBO |

**Ad set structure:** One ad set per video concept (`"SE #1 | video | [concept name]"`), `is_dynamic_creative: false`, one ad per ad set, created PAUSED.

**Campaign mappings:** `meta_campaign_mappings` gets `format` column ("image" | "video"). Current rows get `format = "image"`, new video campaigns get `format = "video"`.

## 5. Pipeline & Lifecycle Tracking

- `concept_lifecycle` gets `type: "image" | "video"` column
- `concept_metrics` syncs video ad performance (same fields: spend, CPA, CTR, ROAS)
- Kill/promote → `generateConceptLearning()` tagged as video
- `/pipeline` page shows video concepts with type badge
- Video learnings feed into brainstorm via `buildLearningsContext()`

## Tech Stack Summary

- **Transcription:** Gladia API (free tier, SE/NO/DK support, word-level timestamps)
- **Caption burn-in:** FFmpeg (server-side on Railway)
- **Caption styles:** ASS (highlight) / SRT (clean) via FFmpeg filters
- **Ad copy translation:** GPT-4o (existing pattern)
- **Meta push:** Existing `meta-video-push.ts` (non-dynamic creative)
- **Storage:** Supabase Storage (captioned videos, SRT/ASS files)
