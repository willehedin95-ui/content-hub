# Pixar Talking Objects — Video Ad Mode

## Overview

New brainstorm mode `pixar_animation` that generates viral "talking object" video ads in the Pixar 3D animated style. An anthropomorphic object or body part speaks directly to camera with a punchy, relatable line about the viewer's problem — then the product is the implied solution.

**Why this format works:**
- Viral on both organic (TikTok/IG Reels) and paid (Meta Ads with 1000+ ROAS days)
- Eye-catching 3D animation stops the scroll
- Objects speaking "as themselves" creates emotional connection + humor
- Simple to produce: 1 keyframe image + 1 VEO video per clip

## Format Anatomy

Each talking object ad is a single 4-8 second clip:

1. **Character**: Anthropomorphic Pixar-style 3D object (body part, sleep object, health item)
2. **Personality**: Distinct mood — frustrated, smug, guilty, sassy, wise, panicked
3. **Dialogue**: 3 punchy lines (~10-15 words for 4s, ~20-25 words for 8s)
4. **Formula**: "I'm your [X]" → sassy truth about problem → implied solution

### Dialogue Examples (Sleep Niche)

**Spine (frustrated):**
> I've been holding you up for 35 years and THIS is the mattress you give me?

**Pillow (wise):**
> I'm not just a pillow — I'm spinal alignment. Your neck isn't meant to fold like a taco all night.

**Smartphone (guilty):**
> Blue light at midnight? Yeah... that's me wrecking your melatonin. Maybe put me down.

**Alarm Clock (annoyed):**
> You blame ME for mornings? Maybe blame the four hours of scrolling first.

## Technical Pipeline

### Step 1: Brainstorm (Claude)

New mode `pixar_animation` in the brainstorm system. Claude generates concepts with:

```typescript
interface PixarAnimationProposal {
  concept_name: string;              // e.g. "Frustrated Spine"
  character_object: string;          // e.g. "spine", "pillow", "alarm clock"
  character_category: "body_part" | "sleep_object" | "health_object" | "everyday_object";
  character_mood: string;            // e.g. "frustrated", "smug", "guilty"
  animation_style: "pixar" | "claymation" | "cartoon";  // default pixar
  dialogue: string;                  // The spoken lines (20-25 words for 8s)
  duration_seconds: 4 | 8;
  awareness_level: AwarenessLevel;
  hook_type: string;                 // "confrontational" | "confession" | "revelation" | "plea"

  // Generated prompts (Claude crafts these)
  character_image_prompt: string;    // Full Nano Banana prompt for keyframe
  veo_prompt: string;                // Simple: "[character] says: "[dialogue]""

  // Ad copy for Meta
  ad_copy_primary: string;
  ad_copy_headline: string;
}
```

### Step 2: Generate Keyframe Image (Nano Banana 2)

The `character_image_prompt` follows this template structure:

```
Pixar-style 3D render of [OBJECT] [LOCATION].

Facial Features:
- Eyes: [expression matching mood]
- Eyebrows: [emotion detail]
- Mouth: [expression matching dialogue delivery]

Arms & Gesture:
- [Thin animated arms doing relevant gesture]

Scene:
- [Cinematic lighting description]
- [Setting details matching the narrative]
- [Vertical 9:16 aspect ratio]
```

### Step 3: Generate Video (VEO 3.1)

Uses existing `FIRST_AND_LAST_FRAMES_2_VIDEO` mode:
- Input: keyframe image URL from Step 2
- Prompt: `[character] character says: "[dialogue]"`
- Model: `veo3` or `veo3_fast`
- Aspect ratio: 9:16

### Step 4: Review → Translate → Push to Meta

Reuses the existing video job pipeline entirely.

## System Prompt Design

The brainstorm system prompt includes:

### Character Library

**Body Parts** (speak about the problem they experience):
- Spine, neck, back muscles — posture/alignment pain
- Brain — can't shut off, racing thoughts, blue light
- Eyes — strained, dry, screen fatigue
- Lungs — shallow breathing from stress
- Heart — elevated resting rate from poor sleep
- Gut/stomach — digestion disrupted by late eating

**Sleep Objects** (speak about their role in sleep):
- Pillow — spinal alignment, neck support
- Mattress — pressure points, spring vs foam
- Alarm clock — morning struggle, snooze addiction
- Blanket/duvet — temperature regulation
- Sleep mask — light blocking

**Health/Everyday Objects** (speak about sleep-adjacent problems):
- Smartphone — blue light, doom scrolling
- Coffee cup — caffeine timing
- Melatonin bottle — natural sleep hormone
- Lavender spray — relaxation ritual

### Dialogue Rules

1. Character speaks AS ITSELF in first person
2. Tone: sassy, slightly confrontational, relatable humor
3. 4s video = 10-15 words, 8s video = 20-25 words
4. Structure: hook line → truth bomb → consequence/solution tease
5. Must relate to a real sleep/health problem the target audience has
6. Never mention the product by name — the ad copy does that
7. Each concept uses a DIFFERENT character + angle combination

### Hook Types

| Type | Example |
|------|---------|
| Confrontational | "I've been holding you up for 35 years and THIS is what you give me?" |
| Confession | "Yeah... that's me wrecking your melatonin every night." |
| Revelation | "I memorize your pressure points like a diary. Your springs gave up years ago." |
| Plea | "Please. Just give me proper support. I'm begging you." |
| Smug truth | "One spray and your brain remembers it's nighttime." |

## Integration with Existing Code

### New Files
- `src/lib/pixar-brainstorm.ts` — System + user prompt builders

### Modified Files
- `src/lib/brainstorm.ts` — Add `pixar_animation` to `BrainstormMode` type
- `src/app/api/brainstorm/route.ts` — Add handler block for `pixar_animation`
- `src/app/(dashboard)/brainstorm/page.tsx` — Add mode card to UI

### Reused As-Is
- `video_jobs` + `video_shots` tables
- Keyframe generation pipeline (Nano Banana 2)
- Video generation pipeline (VEO 3.1 `FIRST_AND_LAST_FRAMES_2_VIDEO`)
- Video job detail page UI
- Translation pipeline
- Meta push pipeline

### Approval → Video Job Mapping

When a Pixar concept is approved:
1. Create `video_job` with `job_type: "pixar_animation"`
2. Create 1 `video_shot` with:
   - `shot_description` = `character_image_prompt`
   - `veo_prompt` = `veo_prompt`
   - `duration_seconds` = concept duration

From there the existing pipeline handles everything.

## Future Extensions (Not in Scope)

- **Style variants**: claymation, cartoon (field exists in schema, just change prompt prefix)
- **Multi-object scenes**: 2-3 characters talking to each other
- **Product placement**: character holds or interacts with the actual product
- **Compilation reels**: stitch multiple 4s clips into a 30-60s reel
