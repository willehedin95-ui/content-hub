# AI UGC Video Generation — Design Document

> Adds AI-generated UGC video ads to Content Hub using Sora 2 Pro via Kie.ai API.

## Architecture Decision

**Approach A: Mirror Pattern** — Separate tables and routes for video that parallel the existing static ad pipeline. No changes to existing image tables.

## Architecture Decisions

| Decision | Choice |
|----------|--------|
| Video engine | Sora 2 Pro via Kie.ai |
| Data model | Separate video concepts (new tables) |
| Script generation | Full pipeline: Claude writes script + Sora 2 prompt |
| Formats | All formats, Claude picks based on product/angle |
| Audio | Sora 2 native audio (v1) |
| Languages | Separate video per language |
| Meta push | Full Meta video push from day 1 |

---

## 1. Database Schema

### `video_jobs` (mirrors `image_jobs`)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| product | text | "happysleep" / "hydro13" |
| concept_name | text | e.g. "Sleep expert podcast" |
| concept_number | int | Auto-increment per product |
| hook_type | text | problem_solution, promise, secret, discovery, social_proof, curiosity, confrontational |
| script_structure | text | testimonial, insider_secret, discovery, before_after, street_interview, podcast |
| format_type | text | selfie_testimonial, street_interview, dorm_confessional, professor_lecture, podcast_clip, etc. |
| script | text | Full UGC script (dialogue + delivery notes) |
| sora_prompt | text | Complete Sora 2 prompt (~5000 chars) |
| character_description | text | Extracted character block for reuse |
| character_tag | text | @username once Sora character created |
| product_description | text | 500-char product description for prompts |
| duration_seconds | int | 4, 8, or 12 |
| target_languages | text[] | ["sv", "no", "da"] |
| status | text | draft → generating → generated → translating → translated → pushing → live → killed |
| brainstorm_session_id | text | Links back to brainstorm that created it |
| awareness_level | text | problem_aware, solution_aware, product_aware, most_aware |
| style_notes | text | Delivery style: conversational, energetic, conspiratorial, emotional, authority |
| created_at / updated_at | timestamptz | |

### `source_videos` (mirrors `source_images`)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| video_job_id | uuid FK → video_jobs | |
| video_url | text | Kie.ai output URL |
| kie_task_id | text | For character creation later |
| thumbnail_url | text | First frame screenshot |
| duration_seconds | numeric | Actual generated duration |
| resolution | text | "720x1280" |
| model | text | "sora-2-pro" |
| status | text | pending → generating → completed → failed |
| generation_params | jsonb | Full API params sent to Kie.ai |
| created_at | timestamptz | |

### `video_translations` (mirrors `image_translations`)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| video_job_id | uuid FK → video_jobs | |
| source_video_id | uuid FK → source_videos | |
| language | text | "sv", "no", "da" |
| translated_script | text | Script in target language |
| translated_sora_prompt | text | Full prompt in target language |
| video_url | text | Generated translated video URL |
| kie_task_id | text | |
| status | text | pending → translating → generating → completed → failed |
| created_at | timestamptz | |

### `video_characters` (new — no image equivalent)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | Display name |
| sora_tag | text | @username for Sora |
| character_description | text | Full description block |
| reference_image_url | text | Nano Banana Pro generated face |
| product | text | Which product they represent |
| created_at | timestamptz | |

### `video_products` (new — product characters for Sora)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| product | text | "happysleep" / "hydro13" |
| sora_tag | text | @productname |
| product_description | text | 500-char description |
| reference_image_url | text | Product photo |
| animated_video_url | text | Seedance/Kling animation |
| created_at | timestamptz | |

### Extend existing `meta_ads` table

Add column: `video_translation_id uuid FK → video_translations` (nullable).

---

## 2. Brainstorm & Script Generation

### New Brainstorm Mode: `video_ugc`

Added to existing brainstorm system alongside the 7 current modes.

**Flow:**
1. User selects product + "Video UGC" mode on `/brainstorm`
2. Claude receives UGC knowledge base as system context (script frameworks, hook types, anti-AI rules, format types, master prompt template)
3. Claude generates 3 video concept proposals, each containing:
   - Concept name, format type, hook type, script structure, awareness level
   - Full script with delivery notes and filler words
   - Character brief (age, ethnicity, setting, clothing, tone)
   - Complete Sora 2 prompt (~5000 chars) using master template
4. User approves one → creates `video_job` row in `draft` status

**System prompt injects:**
- Master prompt template (`AI-UGC-MASTER-PROMPT-TEMPLATE.md`)
- Script frameworks (`AI-UGC-SCRIPT-FRAMEWORKS.md`)
- Anti-AI rules (7 rules from overview)
- Product bank data (description, guidelines, existing characters)
- Learnings context (from `concept_learnings`)
- Anti-copying rules

**Translation system:**
- Claude translates both script AND Sora 2 prompt per language
- Adapts filler words (NO: "liksom", "altsa" / DK: "altsa", "ikke" / SE: "liksom", "typ")
- Adjusts character ethnicity/appearance for target market
- Adjusts setting details (local stores, apartment style)
- Creates one `video_translation` row per language

---

## 3. Video Generation Pipeline (Kie.ai API)

### New module: `src/lib/kie.ts`

| Function | Purpose |
|----------|---------|
| `generateVideo(prompt, params)` | Submit generation job |
| `checkVideoStatus(taskId)` | Poll for completion |
| `getVideoUrl(taskId)` | Retrieve output URL |
| `createCharacter(taskId, timestamps, username)` | Create reusable Sora character |
| `generateWithCharacter(prompt, characterTag)` | Generate using @character tag |

**Default parameters:**
```json
{
  "model": "sora-2-pro",
  "size": "720x1280",
  "seconds": "12",
  "style": "raw",
  "stylize": 0
}
```

### Generation Flow

```
User approves concept → video_job "generating" → source_video "pending"
  → Kie.ai API call → Poll every 10s
  → Download → Upload to Supabase Storage → source_video "completed"
  → video_job "generated" → User reviews
  → Approve → Trigger translations
  → Per language: Claude translates → Kie.ai generates → Poll → Store
  → video_job "translated"
```

### Polling Pattern

Same as static ads — DB is source of truth, client polls every 3s. No SSE.

- `POST /api/video-jobs/[id]/generate` — kicks off async generation
- `GET /api/video-jobs/[id]` — client polls for updates
- `POST /api/video-jobs/[id]/create-translations` — triggers translation + generation

### Storage

Supabase Storage bucket `videos/`:
```
videos/{product}/{video_job_id}/source.mp4
videos/{product}/{video_job_id}/{language}.mp4
videos/{product}/{video_job_id}/thumbnail.jpg
```

### Error Handling

- Kie.ai timeout: 5 min max poll, then mark `failed`
- Rate limiting: Sequential generation with 2s delay between calls
- Failed generation: User retries from UI, creates new `source_video` row

---

## 4. Meta Push for Video Ads

### New module: `src/lib/meta-video-push.ts`

Per target language:

1. **Duplicate template ad set** (`isDynamicCreative: false` — video ads don't use dynamic creative)
   - Naming: `"{COUNTRY} #{number} | video | {concept_name}"`
2. **Upload video** to Meta via `POST /act_{ad_account}/advideos`
3. **Poll for processing** — `GET /{video_id}?fields=status` until `processing_phase === "complete"`
4. **Create ad creative** with `object_story_spec.video_data` (video_id, title, message, CTA, thumbnail)
5. **Create ad** linking to ad set + creative, status `PAUSED`
6. **Update `meta_ads`** row with `video_translation_id` + ad_id

### Key Differences from Static Push

| Aspect | Static Ads | Video Ads |
|--------|-----------|-----------|
| Dynamic creative | `isDynamicCreative: true` | `isDynamicCreative: false` |
| Asset spec | `asset_feed_spec` with multiple images | `video_data` with single video |
| Upload | Image hash via `/adimages` | Video file via `/advideos` |
| Processing | Instant | Async — poll for video encoding |
| Ratios | 4:5 + 9:16 | Single 9:16 vertical |
| Ad set naming | `"...statics..."` | `"...video..."` |

---

## 5. UI & Pages

### Sidebar Addition

In "Ads" group:
```
Ads
  ├── Brainstorm          (existing)
  ├── Ad Concepts         (existing)
  ├── Video Ads           ← NEW
  ├── Hook Bank           (existing)
  └── Learnings           (existing)
```

### `/video-ads` — List Page

Card grid of all `video_jobs`. Each card shows:
- Concept name + number, product badge, format type pill
- Status badge, thumbnail preview
- Target languages with per-language status
- Created date

Filters: product, status, format type. Sort: newest first.

### `/video-ads/[id]` — Detail Page

Three sections:

1. **Script & Prompt Panel** — Full script, collapsible Sora prompt, character description, metadata pills, edit button
2. **Video Preview Panel** — HTML5 video player, generate/regenerate buttons, status indicator
3. **Translations Panel** — Language cards with translated script, video player, status, push-to-Meta buttons

### Brainstorm Integration

"Video UGC" added as new mode on `/brainstorm`. Output renders as video concept cards. "Approve" creates `video_job` and navigates to `/video-ads/[id]`.

---

## Reference Documents

All UGC knowledge base files in `/copywriting/AI UGC Videos/`:
- `AI-UGC-OVERVIEW.md` — Pipeline, anti-AI rules, format types
- `AI-UGC-MASTER-PROMPT-TEMPLATE.md` — Sora 2 prompt template + all variants
- `AI-UGC-PROMPT-EXAMPLES.md` — 9 complete example prompts by format
- `AI-UGC-TOOLS-AND-TECHNIQUES.md` — Tool guide with settings
- `AI-UGC-SCRIPT-FRAMEWORKS.md` — Hook types, script structures, delivery styles

## Future (v2+)

- Lipsync pipeline (Kling animation → ElevenLabs voice → Sync.so)
- VEO 3.1 podcast format support
- Character library management UI
- Product character management UI
- Post-production automation (Topaz upscale, color correction)
- Video performance tracking + learnings
