# Video Translate to Market + Concept Thumbnails

## Date: 2026-03-07

## Problem

Video concepts must be brainstormed from scratch for each market. No way to take an existing Swedish concept and translate its script/dialogue to NO/DA. Also, concept cards in the list show empty placeholders instead of generated keyframe thumbnails.

## Design

### Feature 1: Translate to Market

**UX model:** Same card, translation tabs. One concept = one card. Detail page shows SV/NO/DA tabs.

**Translation flow:**
1. User clicks "Translate to..." dropdown on concept detail page
2. Picks target language (NO or DA)
3. GPT-4o translates script, shot dialogue, ad copy (~2-3s)
4. Stored in existing `video_translations` table
5. Detail page shows language tabs to view/edit each translation

**Data model change:**
- Add `translated_shots JSONB` to `video_translations` — stores `[{ shot_number, translated_dialogue, translated_veo_prompt }]`
- No new tables

**Translation logic by format:**
- **Pixar Animation:** Translate dialogue in each shot + ad copy. Keep `character_image_prompt` and visual parts of `veo_prompt` in English. Replace only the dialogue text within veo_prompt.
- **Video UGC:** Translate full script + ad copy + dialogue within shot veo_prompts.

**Detail page changes:**
- Language tab bar below title
- Each tab shows translated script + per-shot dialogue
- Translated content is editable
- "Translate to..." button with dropdown for uncovered languages

**List card changes:**
- Show language pills based on `video_translations` + `target_languages`

### Feature 2: Thumbnails on Concept Cards

**Fallback chain:**
1. `video_shots[0]?.image_url` (generated keyframe)
2. `source_videos[0]?.thumbnail_url` (legacy)
3. Video icon placeholder (nothing generated yet)

**Rendering:** `<img>` with `object-cover`, video icon as small overlay badge.

## API

- `POST /api/video-jobs/[id]/translate` — accepts `{ language: "no" | "da" | "sv" }`, runs GPT-4o translation, creates `video_translations` row with `translated_shots` JSON
- `PATCH /api/video-jobs/[id]/translate/[translationId]` — update translated script/shots after manual edit

## Files to modify

- `src/types/index.ts` — extend `VideoTranslation` with `translated_shots`
- `src/components/video-ads/VideoJobDetail.tsx` — add language tabs, translate button
- `src/app/(dashboard)/video-ads/page.tsx` — thumbnails + language pills on cards
- `src/app/api/video-jobs/[id]/translate/route.ts` — new API route
- DB migration: add `translated_shots` column
