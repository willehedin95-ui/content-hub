# Session: 2026-05-12 - Quiz offer page A/B test (handover to next LLM)

**Active issue**: B variant of Maries Valpakademin offer page needs visual polish - see `.claude/journal/2026-05-12-offer-page-ab-test.md` for full handover doc with 6 specific fixes.

**Status**: Infrastructure live (variant group, runtime swap, test URLs working). Visual decisions need redo. Next LLM should:
1. Read `2026-05-12-offer-page-ab-test.md`
2. Read A variant HTML from DB to lift the original visual patterns (testimonials with before/after photos, gold guarantee badge, bonus images, full pricing-box value-stack)
3. Apply to B variant via PostgREST PATCH on offer step `step_1778588267757_offerb`
4. Republish via `scripts/publish-doginwork-quiz.ts`

**Test URLs (now exact-match working)**:
- A: https://quiz.doginwork.se/valpakademin/?goto=Offer%20page
- B: https://quiz.doginwork.se/valpakademin/?goto=Offer%20page%20(B%20variant)

---

## Earlier in this session (done)

Topic: Before/After image generator tool in /assets

## What was done

### New feature: Before/After generator (whole stack)
- Built fresh from scratch as a 4th tool in `/assets` (next to Swipe Image / Swipe Video)
- New API routes:
  - `src/app/api/assets/before-after/route.ts` - main generation, NDJSON streaming
  - `src/app/api/assets/before-after/regenerate/route.ts` - retry endpoint
  - `src/app/api/assets/before-after/detect-zone/route.ts` - Claude vision analysis of uploaded source
- New component: `src/components/assets/BeforeAfterGenerator.tsx`
- Sidebar/manager wiring: `AssetsSidebar.tsx`, `AssetManager.tsx`
- Design doc: `docs/superpowers/specs/2026-05-11-before-after-generator-design.md`

### Body zone system (11 zones with auto-generated thumbnails)
- Generated 11 thumbnail images via Higgsfield `nano_banana_flash` (full_face_front, face_profile, eye_area, forehead, neck_decolletage, cheek_closeup, arm_skin, hands, hair_scalp, leg_thigh, chest_macro)
- Stored as static webp assets in `public/images/body-zones/`
- Visual picker grid in component, auto-detected from source via Claude vision

### Demographic system
- `ETHNICITY_PROFILES` with 8 ethnicities (scandinavian default, north_european, mediterranean, east_asian, south_asian, latin, middle_eastern, african) - each with own hair/eye/skin color lists
- Age ranges 30-75 (expanded from 40-65)
- User overrides via "Customize person" panel (collapsible)
- Source-detected demographic stored separately as fallback
- Expression rule: BEFORE always neutral, AFTER may have subtle smile (40% chance)

### Source upload flow
- Auto-upload to /api/upload-temp on file/URL select
- Auto-trigger detect-zone (Claude vision analysis)
- Auto-trigger generation in swipe mode (no Generate button click needed)
- Done state shows side-by-side comparison, demographic, edit instructions, Save to Assets, Re-roll, Start Over

### Swipe mode UI (separate from free mode)
- When source uploaded, all controls collapse into single "Customize (optional)" panel
- Default view: just source preview + auto-generating
- No body zone picker, no intensity buttons in swipe mode (they don't apply)

### NANO BANANA PRO PROMPT spec technique (added end of session)
- Per `copywriting/AI UGC Videos/ox ROAS AI UGC content/NANO BANANA PRO PROMPT.pdf` and `Clone prompt chatgpt_gemini.pdf`
- detect-zone now extracts a 25+ field structured spec (subject/accessories/photography/background/pair_structure) instead of 5 simple fields
- Backend `buildSwipePromptFromSpec()` sends the spec AS-IS as the Nano Banana prompt
- `face.preserve_original: true` with `modification_note` for face variation (not false - false triggers free-regen)

### UGC realism docs integration
- Read and pulled from `nano-banana-ugc-prompts.md` (memory) and `AI-UGC-OVERVIEW.md` (copywriting/)
- Pulled canonical phrasings: "captured on iPhone 16 Pro using front camera at high resolution, with the typical computational look of a real smartphone photo", "raw handheld realism and the color science of an actual iPhone image"
- Added memory pointer: `ugc-prompting-docs-index.md`

### Other realism / framing fixes through iteration
- Per-half outfit/lighting/angle randomization in free mode (TOPS, LIGHTING_VARIANTS, HEAD_TILTS arrays)
- "60 days apart" framing for free mode (different lighting/outfit/angle per half)
- Mirror-flip prevention hard constraints
- Body zone descriptions softened from "EXTREME MACRO" medical-sounding wording to "lifestyle skincare close-up" for Google content policy
- Skincare/aging language softened to "tired vs rested" framing

## Decisions made

- **Two distinct modes**: swipe mode (source uploaded, near-clone) vs create mode (no source, template-based)
- **Source spec extraction via Claude vision** is the right architecture per the doc - not text-prompt-engineering
- **Demographic NOT auto-filled in UI** when source uploaded - user picks separately, source demographic is implicit backend fallback
- **Skip image-edit-mode rabbit hole** - per the doc, nano-banana-2 CAN do near-clone with right prompting (`preserve_original: true` + modification_note), don't need face-swap pipeline

## Current state

- Tool deployed on commit `8e3e674`. Build green. All routes registered.
- Quality of swipe output still not at "near-clone" level when last tested - generated still looks wider crop and AI-rendered compared to source
- Latest commit (`8e3e674`) is untested by user - implements the actual doc technique correctly (spec-as-prompt + preserve_original: true). User left frustrated.

## Blockers / Open questions

- **Swipe output still looks AI** despite multiple iterations. Last commit `8e3e674` should fix this per the doc but not yet tested.
- If `8e3e674` still produces AI-looking output, options remain:
  - Test Higgsfield's nano_banana with role-tagged reference images (memory says Higgsfield's `medias` array has a `role` field)
  - Build face-swap pipeline via Replicate InsightFace
  - Accept current output as "style inspiration" not "near-clone"

## Next up

1. **Test commit `8e3e674`** - this is the actual doc technique (preserve_original: true, spec is the prompt without wrapping). Should be the breakthrough or confirm we need a different model.
2. If `8e3e674` fails: try Higgsfield API for nano-banana with role-tagged media (better conditioning per Higgsfield docs)
3. If both fail: build Replicate face-swap pipeline
4. Add more body zone templates if needed (William mentioned wanting more variety after seeing the 48 competitor examples)

## Mistakes I made this session (lessons for next time)

- **Wasted hours blaming the model** before reading all available docs. William explicitly had a `NANO BANANA PRO PROMPT.pdf` describing the working technique that I didn't read until very late.
- **Misread user feedback multiple times** (e.g. interpreted "don't use reference for age/hair" as "don't match demographic at all" when he meant "don't auto-fill the UI dropdowns")
- **Made up problems that weren't in the source** (e.g. claimed Amanda had different outfits between halves when right half showed no outfit visible)
- **Over-engineered prompts** when the right answer was minimal spec-only (per doc)
- **Should have run /context and /journal more often** to load existing docs at session start
