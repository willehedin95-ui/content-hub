# Animated Ads Pipeline — Design Document

**Date:** 2026-03-08
**Status:** Approved
**Cost per ad:** ~$9-10 (all via Kie + ElevenLabs)

## Overview

Automate Franky Shaw's (FUTR Group) animated ad workflow within the Content Hub. The pipeline generates all creative assets (images, video clips, voiceover, music) — the user then takes them into CapCut for final editing.

**Workflow:** Brainstorm → Review Prompts → Generate Images (parallel) → Review → Generate Videos (parallel) → Review → Generate Audio (parallel) → Download for CapCut

**Approach:** Parallel Pipeline with Gates — parallel generation within each phase, human review gates between phases to avoid wasting credits on bad inputs.

## Styles (Initial)

- **Apple Realistic** — minimal studio, soft lighting, clean neutral tones, Apple keynote energy
- **Pixar** — 3D animated, whimsical, character-driven, colorful

Claymation and Sci-fi can be added later as additional style configs.

## Data Model

### `animated_ads` table

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| product | text | "happysleep" \| "hydro13" |
| concept_name | text | |
| style | text | "apple_realistic" \| "pixar" |
| status | text | See status enum below |
| target_duration_seconds | int | Default 60 |
| image_prompt_count | int | Default 18 |
| brainstorm_session_id | uuid | Nullable, links to brainstorm |
| voiceover_script | text | Nullable |
| voiceover_style | text | Nullable, e.g. "whimsical Pixar narrator" |
| music_style | text | Nullable, e.g. "European sophistication" |
| ad_copy_primary | text | Nullable |
| ad_copy_headline | text | Nullable |
| estimated_cost_usd | numeric | Accumulated cost |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Status enum:** `prompts_ready` → `generating_images` → `images_ready` → `generating_videos` → `videos_ready` → `generating_audio` → `complete` → `error`

### `animated_ad_frames` table

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| animated_ad_id | uuid | FK → animated_ads |
| frame_number | int | P1, P2, P3... |
| role | text | "hook" \| "body" \| "payoff" \| "end_frame" |
| prompt | text | NanoBananaPro prompt |
| image_url | text | Nullable, populated after generation |
| image_kie_task_id | text | Nullable |
| image_status | text | "pending" \| "generating" \| "completed" \| "failed" |
| error_message | text | Nullable |
| created_at | timestamptz | |

### `animated_ad_clips` table

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| animated_ad_id | uuid | FK → animated_ads |
| clip_number | int | V1, V2, V3... |
| start_frame_number | int | P1→P2 means start=1 |
| end_frame_number | int | P1→P2 means end=2 |
| animation_prompt | text | Style-specific Kling prompt |
| video_url | text | Nullable |
| video_kie_task_id | text | Nullable |
| video_status | text | "pending" \| "generating" \| "completed" \| "failed" |
| duration_seconds | int | 5 or 8 |
| error_message | text | Nullable |
| created_at | timestamptz | |

### `animated_ad_audio` table

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| animated_ad_id | uuid | FK → animated_ads |
| audio_type | text | "voiceover" \| "music" |
| audio_url | text | Nullable |
| task_id | text | Nullable (Kie task ID for Suno, ElevenLabs ID for voiceover) |
| status | text | "pending" \| "generating" \| "completed" \| "failed" |
| duration_seconds | int | Nullable |
| error_message | text | Nullable |
| created_at | timestamptz | |

## API Routes

All under `/api/animated-ads/`:

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/create` | Create animated_ad + frames from brainstorm output |
| GET | `/[id]/status` | Full state (frames, clips, audio) — client polls every 3s |
| POST | `/[id]/generate-images` | Fire all NanoBananaPro tasks in parallel |
| POST | `/[id]/regenerate-frame/[frameNumber]` | Regenerate single image |
| POST | `/[id]/generate-videos` | Pair frames, fire all Kling 3.0 tasks in parallel |
| POST | `/[id]/regenerate-clip/[clipNumber]` | Regenerate single video |
| POST | `/[id]/generate-audio` | Fire ElevenLabs + Suno in parallel |
| GET | `/[id]/download/[type]` | Download individual asset or ZIP |

**Fire-and-poll pattern:** API routes create Kie tasks, store task IDs in DB, return immediately. Client polls `/status` every 3s. Avoids Vercel 300s timeout entirely.

## UI

**Location:** `/video-ads/animated/[id]`

**Stepper at top:** `[1. Prompts] → [2. Images] → [3. Videos] → [4. Audio] → [5. Ready]`

### Phase 1: Prompts
- 18 prompt cards in a grid, editable
- "Generate All Images" button

### Phase 2: Images
- 18-card grid with loading → preview → error states
- Progress counter "12/18 images generated"
- Per-card "Regenerate" button
- "Generate All Videos" button when all done

### Phase 3: Videos
- 9-card grid labeled "V1: P1 → P2" with source frame thumbnails
- Inline video preview player per card
- Per-card "Regenerate" button
- "Generate Audio" button when all done

### Phase 4: Audio
- Two cards: voiceover (audio player) + music (audio player)
- Per-card "Regenerate" button

### Phase 5: Ready
- All assets visible with individual download buttons
- "Download All" ZIP button
- Cost summary card

**List view:** `/video-ads` gets an "Animated" tab showing all animated ads (name, style, status, date, cost).

## Integrations

### ElevenLabs (new)
- **File:** `src/lib/elevenlabs.ts`
- **Env var:** `ELEVENLABS_API_KEY`
- **Functions:** `designVoice(styleDescription)` → voiceId, `generateSpeech(voiceId, script)` → audio buffer
- **Storage:** Upload to Supabase Storage `animated-ads` bucket
- **Cost:** ~$0.17 per 60s voiceover (Starter plan $5/mo)

### Suno V5 (new, via Kie)
- **Location:** Added to `src/lib/kie.ts`
- **Endpoint:** `POST https://api.kie.ai/api/v1/generate` (different from `/jobs`)
- **Polling:** `GET https://api.kie.ai/api/v1/generate/record-info`
- **Functions:** `createSunoTask(params)`, `pollSunoResult(taskId)`
- **Cost:** $0.06 per generation

### NanoBananaPro (extend existing)
- Same `createImageTask` in kie.ts, pass `nano-banana-pro` as model
- Resolution: 2K, aspect ratio: 9:16, output: PNG
- **Cost:** $0.09 per image × 18 = $1.62

### Kling 3.0 (existing)
- Uses existing `createKlingTask` from kie.ts
- Two images in `imageUrls` array (index 0 = start, index 1 = end)
- Duration: 5s (cheaper) or 8s, mode: `std`, sound: `true`
- **Cost:** $0.50-$0.80 per clip × 9 = $4.50-$7.20

### Animation Prompt Templates
- **File:** `src/lib/animated-ad-prompts.ts`
- Style-specific Kling prompts:
  - apple_realistic: "Seamless Apple-style cinematic transition. Minimal studio environment. Soft natural lighting. Clean, neutral tones. Ultra-clean. Minimal. Engineered. Apple keynote energy. Sound effects (no talking)"
  - pixar: "Create a seamless Pixar animated transition between the first shot and the second shot in a Pixar animation style with sound effects (no talking)"

## Brainstorm Mode

**New mode:** `animated_ad` added to brainstorm modes

**System prompt strategy:**
- Product context from Product Bank (description, guidelines, reference pages)
- Creative testing learnings via `buildLearningsContext()`
- Style-specific image prompt instructions
- Beginning/middle/end structure: frames 1-3 = hook, 4-12 = body, 13-17 = payoff, 18 = product shot
- Each frame prompt includes style + "9:16 portrait" suffix
- Anti-copying rules

**Output shape:**
```json
{
  "concept_name": "The Peptide Architects",
  "style": "pixar",
  "frame_count": 18,
  "frames": [
    { "frame_number": 1, "role": "hook", "nano_banana_prompt": "..." }
  ],
  "voiceover_script": "...",
  "voiceover_style": "...",
  "music_style": "...",
  "ad_copy_primary": "...",
  "ad_copy_headline": "..."
}
```

## Cost Breakdown Per Ad

| Step | Quantity | Unit Cost | Total |
|------|----------|-----------|-------|
| NanoBananaPro 2K | 18 images | $0.09 | $1.62 |
| Kling 3.0 std 5s | 9 clips | $0.50 | $4.50 |
| Suno V5 music | 1 | $0.06 | $0.06 |
| Claude API (brainstorm) | ~1 call | ~$0.10 | $0.10 |
| ElevenLabs voiceover | 1 | ~$0.17 | $0.17 |
| **Total** | | | **~$6.45** |

With 8s clips instead of 5s: ~$9.15. With regenerations, budget ~$10-12 per ad.

## Files to Create/Modify

**New files:**
- `src/lib/elevenlabs.ts` — ElevenLabs API wrapper
- `src/lib/animated-ad-prompts.ts` — Style templates + brainstorm system prompt
- `src/app/api/animated-ads/create/route.ts`
- `src/app/api/animated-ads/[id]/status/route.ts`
- `src/app/api/animated-ads/[id]/generate-images/route.ts`
- `src/app/api/animated-ads/[id]/regenerate-frame/[frameNumber]/route.ts`
- `src/app/api/animated-ads/[id]/generate-videos/route.ts`
- `src/app/api/animated-ads/[id]/regenerate-clip/[clipNumber]/route.ts`
- `src/app/api/animated-ads/[id]/generate-audio/route.ts`
- `src/app/api/animated-ads/[id]/download/[type]/route.ts`
- `src/app/(dashboard)/video-ads/animated/[id]/page.tsx`
- `src/components/animated-ads/FrameCard.tsx`
- `src/components/animated-ads/ClipCard.tsx`
- `src/components/animated-ads/AudioCard.tsx`
- `src/components/animated-ads/PipelineStepper.tsx`

**Modified files:**
- `src/lib/kie.ts` — Add Suno functions + NanoBananaPro model param
- `src/lib/brainstorm.ts` — Add `animated_ad` mode
- `src/app/api/brainstorm/route.ts` — Handle `animated_ad` mode
- `src/app/(dashboard)/video-ads/page.tsx` — Add Animated tab
- `src/components/layout/Sidebar.tsx` — Already has Video Ads link
- `src/types/index.ts` — Add AnimatedAd types
