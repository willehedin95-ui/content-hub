# Session: 2026-05-14 (eftermiddag) - Before/After generator deep iteration

9 commits ute. Stort fokus på att fixa template/create mode efter förra sessionens regression, plus två nya zone-templates (nails + hair) baserat på faktisk kategori-research.

## What was done

### Skin templates (create mode) - poseregression fixad
- **`6b03b7e`** - Återställde L/R head tilts (raderade i `b71f348` för att fixa mirror-flip i swipe mode, men över-korrigerade create mode till alla "head straight on"-varianter). Mjukade upp `identity_lock` så pose inte blir clone, lade till `HAIR_ARRANGEMENTS` med per-half pickPair.
- **`a8d1e5d`** - Förebyggde mirror-flip från L+R head lean-pairing. Ny `pickHeadTilts()` som väljer side (straight/right/left) EN gång och paret kommer från kompatibla options. Lade till `BODY_ORIENTATIONS` picked once och shared mellan halvor.

### Mole/birthmark-bugg
- **`2614681`** - Låste permanenta hudfeatures via `subject.permanent_features_lock` + hard_constraint. Men..
- **`b17daee`** - ..priming-effekt: att lista "moles/birthmarks/scars/freckle patterns" i constraints fick modellen att lägga till dem i nästan alla bilder. Bytte till feature-agnostiskt språk ("whatever distinctive detail appears in one half must appear identically in the other"). Tog även bort "faint freckle" från sharedStyle.

### Nails template (helt ny)
- **`aff3fb0`** - Lade till `nails` body zone. `BODY_ZONE_PRESETS.nails`, `NAIL_INTENSITY_PROMPTS` (subtle/moderate/dramatic: ridged/short → smooth/longer naturlig fri kant), `isNails` branch i buildPrompt som byter ut skin_state mot nail_state + hoppar över face/outfit/hair-constraints. Genererade thumbnail via Higgsfield nano_banana_flash, konverterade PNG → webp via Python Pillow (cwebp finns ej, no homebrew på denna maskin), sparade i `public/images/body-zones/nails.webp` (1024x1024).
- **`e71e537`** - Lade till `NAIL_HAND_POSES` (6) + `NAIL_BACKGROUNDS` (7) med per-half pickPair efter feedback att halvor blev för identiska. Hard_constraints förbjuder identical pose/background men keeps hand identity.

### Generation artifacts (forehead tiling + limb vertical-flip)
- **`09642dc`** - Forehead-zonen renderade ibland som 2x2-grid (tiling). Arms/legs renderade ibland med byxbenet på fel sida (180° flip). Lade till:
  - `EXACTLY TWO PHOTOS IN OUTPUT`-constraint (båda branches)
  - `BODY PART ORIENTATION CONSISTENCY` med konkreta exempel för ben/arm (non-nails)
  - `HAND ORIENTATION CONSISTENCY` (nails)
  - Skärpte `format`-fältet med samma anti-tiling-wording

### Hair template (research-backed)
- **`5f261e6`** - Lade till `HAIR_INTENSITY_PROMPTS` + 4 hair-specifika hard_constraints. Baserat på research av Nutrafol/Viviscal/Vital Proteins/Vegamour-marknadsföring + Williams egna docs (renew-brand.md listar "Hair & Nails" som ad angle, hydro13-voc-testimonials.md har 5+ direkta Trustpilot-citat om tjockare/starkare hår).
  - Bännings-linjen narrowing är **THE** dominanta marketing-cuen i kategorin (per Wimpole Clinic + Nutrafol Results-sida)
  - Baby hairs är ENTYDIGT POSITIVT (Nutrafol listar bokstavligen "Baby Hairs Growing Out" som benefit)
  - Längd-ändring inte trovärdigt på 12 veckor (hår växer ~1cm/månad)

### UX
- **`ef333e9`** - Random age pool börjar nu på 46 (`RANDOM_AGE_POOL` filtrerar AGE_RANGES till min >= 46). Ger 6 grupper: 46-50/51-55/56-60/61-65/66-70/71-75. Manuell dropdown visar fortfarande alla 30-75 för specifika val.

### Side-effects / cleanup
- Notion-processer dödade (renderer förbrukade 129% CPU). `duetexpertd` (macOS Siri/Spotlight-daemon) spikade också men lämnades.
- Inga dev servers körde. Inga startade.

## Decisions made

1. **Swipe mode pausad.** William: "vi kanske ska skita i swipe-funktionen för den fungerar ju uppenbarligen inte". Fokus på create mode + templates istället. Swipe-koden ligger kvar men ej prioriterad.

2. **B/A halves SKA se olika ut.** Sparat som hard rule i `feedback_before_after_halves_should_differ.md` (pointer i MEMORY.md). William: "det är ju exakt så jag vill ha det på alla mina bilder? De ska INTE vara identiska". Real customer B/A photos har olika zoom/pose/background. Bara identitet (skin tone, hand size, face features) + no mirror-flip + no text behöver vara konstant.

3. **Hair B/A research-backed cues = parting-line narrowing + baby hairs.** Inte gissning. Drar från Nutrafol/Viviscal-pattern. Längd-ändring är overpromise/FDA-risk.

4. **Random demographic minimum age = 46.** Yngre subjects fortfarande tillgängliga via manuell selection.

5. **Hairfärger är ethnicity-låsta** (redan så i `ETHNICITY_PROFILES`). Säkert mot fantasi-färger (blå/lila).

## Current state

- B/A template generator betydligt förbättrad. Pose-regression, mirror-flip, mole-priming, tiling, vertical-flip alla strukturellt fixade.
- 12 body zones nu: full_face_front, face_profile, eye_area, forehead, neck_decolletage, chest_macro, cheek_closeup, arm_skin, leg_thigh, hands, nails, hair_scalp, + other
- 3 intensity prompts per zone-type: SKIN (default), NAIL, HAIR
- Random age pool >= 46
- Hårfärger ethnicity-låsta
- Alla 9 commits pushade till main, deployade till Vercel
- 1058 Higgsfield credits, marginellt nedgång efter nails-thumbnail generation

## Blockers / Open questions

1. **Swipe mode "near-clone" output ojusterad.** Lämnad in dåligt skick från förra sessionen. William har sagt att den är pausad, men borde komma tillbaka senare med antingen:
   - Higgsfield `medias` array med role-tagged references
   - Replicate InsightFace face-swap pipeline
   - Eller accepteras som "style inspiration only"

2. **Hair B/A inte testat live** efter `5f261e6` deploy. Williams nästa generation av hair_scalp-zone bör visa parting-line narrowing + baby hairs.

3. **Forehead/limb-artifact-fixen inte verifierad.** William testade troligen inte ny generation efter `09642dc`. Borde dyka upp i nästa session om de återkommer.

## Next up

(prioritetsordning)

1. **Verifiera nästa generation per zone** - vänta på Williams nästa B/A-batch (special: forehead, leg, arm för tiling/flip, hair för parting-line, eye/cheek för regression-check)
2. **Eventuellt fler zone-specifika prompts** om något inte landar (t.ex. chest_macro skin har sin egen tone)
3. **Resume swipe mode** när create mode är settled - prova Higgsfield role-tagged medias eller Replicate InsightFace
4. **Cleanup oanvänd `vision`-parameter i buildPrompt swipe branch** (var redan i backlog)

## Files modified

**`src/app/api/assets/before-after/route.ts`** - hela filen är den centrala arenan denna session. Nya konstanter: `RANDOM_AGE_POOL`, `STRAIGHT_HEAD_OPTIONS`, `pickHeadTilts()`, `BODY_ORIENTATIONS`, `HAIR_ARRANGEMENTS`, `HAIR_INTENSITY_PROMPTS`, `NAIL_INTENSITY_PROMPTS`, `NAIL_HAND_POSES`, `NAIL_BACKGROUNDS`. Nya branch-flaggor: `isNails`, `isHair`. Massivt utbyggda hard_constraints och format/instruction-fält.

**`src/components/assets/BeforeAfterGenerator.tsx`** - bara `nails` zone tillagd i `BODY_ZONES`.

**`public/images/body-zones/nails.webp`** - ny 1024x1024 thumbnail genererad via Higgsfield.

**Memory:**
- `feedback_before_after_halves_should_differ.md` - nytt
- `MEMORY.md` - pointer tillagd
- `before-after-tool.md` - uppdaterad med ny architecture (denna wrap-up)

## Key references for next Claude

- **Memory pointer**: `feedback_before_after_halves_should_differ.md` - HARD RULE, läs innan du ändrar B/A-prompt
- **Architecture doc**: `before-after-tool.md` - uppdaterad i denna wrap-up
- **Marketing research**: Nutrafol/Viviscal hair B/A pattern = parting-line narrowing + baby hairs. Sources: Wimpole Clinic, Vegamour blog.
- **Nano Banana JSON-spec technique**: `/Users/williamhedin/Claude Code/copywriting/AI UGC Videos/ox ROAS AI UGC content/NANO BANANA PRO PROMPT.pdf` (för swipe mode-revival)
