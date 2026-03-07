# Pixar Talking Objects Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `pixar_animation` brainstorm mode that generates viral Pixar-style talking object video ad concepts, reusing the existing video job pipeline.

**Architecture:** New brainstorm mode with its own system/user prompt builders in `pixar-brainstorm.ts`. The API route gets a handler block (like `video_ugc`). Approved concepts create `video_jobs` with 1 shot each. All downstream pipeline (keyframe generation, VEO 3.1, translations, Meta push) is reused as-is.

**Tech Stack:** TypeScript, Next.js App Router, Anthropic Claude API (streaming), Supabase, Kie.ai (Nano Banana 2 + VEO 3.1)

**Design doc:** `docs/plans/2026-03-07-pixar-talking-objects-design.md`

---

### Task 1: Add `pixar_animation` to BrainstormMode type

**Files:**
- Modify: `src/types/index.ts:625` — BrainstormMode union type

**Step 1: Add the mode to the type**

In `src/types/index.ts` at line 625, add `"pixar_animation"` to the union:

```typescript
export type BrainstormMode = "from_scratch" | "from_organic" | "from_research" | "from_internal" | "unaware" | "from_template" | "from_competitor_ad" | "video_ugc" | "pixar_animation";
```

**Step 2: Add to SYSTEM_BUILDERS record**

In `src/lib/brainstorm.ts` at lines 1100–1121, add the pixar_animation entry using the same throw pattern as video_ugc:

```typescript
pixar_animation: () => {
  throw new Error("pixar_animation mode uses its own prompt builder — see pixar-brainstorm.ts");
},
```

**Step 3: Add case to buildBrainstormUserPrompt switch**

In `src/lib/brainstorm.ts` in the switch at line ~1152, add:

```typescript
case "pixar_animation": {
  // Handled by pixar-brainstorm.ts
  break;
}
```

**Step 4: Add to BRAINSTORM_MODES array**

In `src/lib/brainstorm.ts` at lines 1330–1384, add to the array:

```typescript
{
  value: "pixar_animation",
  label: "Pixar Animation",
  description: "Generate viral talking object/body part video ads in Pixar 3D animated style",
  icon: "Clapperboard",
},
```

**Step 5: Add to VALID_MODES in API route**

In `src/app/api/brainstorm/route.ts` at lines 20–29, add `"pixar_animation"` to the array.

**Step 6: Verify build**

Run: `cd /Users/williamhedin/Claude\ Code/content-hub && npx tsc --noEmit 2>&1 | head -30`

Fix any type errors. The SYSTEM_BUILDERS record is typed as `Record<BrainstormMode, ...>` so it MUST have entries for all modes.

**Step 7: Commit**

```bash
git add src/types/index.ts src/lib/brainstorm.ts src/app/api/brainstorm/route.ts
git commit -m "feat: add pixar_animation to BrainstormMode type and registries"
```

---

### Task 2: Create pixar-brainstorm.ts prompt builders

**Files:**
- Create: `src/lib/pixar-brainstorm.ts`

**Reference:** `src/lib/video-brainstorm.ts` (lines 114–335) for the pattern.

**Step 1: Create the system prompt builder**

Create `src/lib/pixar-brainstorm.ts` with:

```typescript
// Pixar Talking Objects brainstorm prompt builders
// Generates viral 3D animated talking object/body part video ad concepts

export function buildPixarAnimationSystemPrompt(
  product: string,
  productBrief: string,
  guidelines: string,
  learningsContext: string
): string {
  return `You are a creative director specializing in viral AI-animated video ads.

## YOUR TASK
Generate Pixar-style "talking object" video ad concepts for the product below. Each concept features an anthropomorphic 3D animated object or body part that speaks directly to the viewer with a punchy, relatable line about their problem.

## THE FORMAT
This is a viral format on TikTok, Instagram Reels, and Meta Ads. Key characteristics:
- An everyday object or body part is rendered in Pixar-style 3D animation
- The character has a face (eyes, eyebrows, mouth) and thin animated arms
- It speaks directly to the viewer in first person with personality
- The tone is sassy, slightly confrontational, humorous — but always relatable
- Each video is a single 8-second clip with 20-25 words of dialogue
- The character speaks AS ITSELF about the problem it experiences or causes

## CHARACTER LIBRARY

### Body Parts (speak about the problems they experience)
- **Spine/back** — posture pain, alignment issues, carrying tension, bad mattress support
- **Neck** — stiffness, wrong pillow height, folding at weird angles
- **Brain** — can't shut off, racing thoughts, blue light stimulation, cortisol
- **Eyes** — strained from screens, dry, blue light damage
- **Muscles** — tension, can't recover without proper sleep, stress damage
- **Heart** — elevated resting rate from poor sleep, working overtime
- **Gut/stomach** — digestion disrupted by stress and late eating

### Sleep Objects (speak about their role)
- **Pillow** — spinal alignment, neck support, foam vs feather
- **Mattress** — pressure points, springs giving up, memory foam
- **Alarm clock** — morning struggle, snooze addiction
- **Blanket/duvet** — temperature regulation, too hot/cold
- **Sleep mask** — light blocking, REM protection

### Everyday Objects (speak about sleep-adjacent problems)
- **Smartphone** — blue light, doom scrolling, melatonin disruption
- **Coffee cup** — caffeine timing, afternoon crashes
- **Melatonin bottle** — natural sleep hormone, supplement dependency
- **Lavender spray** — relaxation ritual, calming scent

## DIALOGUE RULES
1. Character speaks in FIRST PERSON as itself ("I'm your spine..." or "I'm not just a pillow...")
2. 8-second video = 20-25 words maximum. Count carefully.
3. Structure: hook line → truth bomb → consequence or solution tease
4. Tone: sassy, confrontational, funny, OR wise and knowing — pick one per concept
5. NEVER mention the product by name in the dialogue — the ad copy handles that
6. Each concept MUST use a DIFFERENT character + angle combination
7. The dialogue must relate to a REAL problem the target audience has with sleep/health

## HOOK TYPES
- **Confrontational**: "I've been holding you up for 35 years and THIS is what you give me?"
- **Confession**: "Yeah... that's me wrecking your melatonin every night."
- **Revelation**: "I memorize your pressure points like a diary. Your springs gave up years ago."
- **Plea**: "Please. Just give me proper support. I'm literally begging you."
- **Smug truth**: "One spray and your brain remembers it's nighttime."

## IMAGE PROMPT FORMAT
Generate a complete Nano Banana Pro image prompt following this exact structure:

\`\`\`
A highly detailed Pixar-style 3D animated [OBJECT] character [POSE] [LOCATION].

Facial Features:
- Eyes: [expression matching character mood]
- Eyebrows: [emotion detail]
- Mouth: [expression matching dialogue delivery style]

Arms & Gesture:
- [Thin, animated arms doing a gesture relevant to the character's message]

Scene:
- [Cinematic Pixar-style lighting description]
- [Setting that matches the narrative context]
- Vertical 9:16 aspect ratio
\`\`\`

## VIDEO PROMPT FORMAT
Keep the VEO prompt extremely simple. This exact format:
\`[character name] character says: "[exact dialogue]"\`

Example: \`spine character says: "I've been holding you up for 35 years and THIS is the mattress you give me?"\`

## OUTPUT FORMAT
Return a JSON object with a "proposals" array. Each proposal:

\`\`\`json
{
  "proposals": [
    {
      "concept_name": "Frustrated Spine",
      "character_object": "spine",
      "character_category": "body_part",
      "character_mood": "frustrated",
      "dialogue": "I've been holding you up for 35 years and THIS is the mattress you give me?",
      "duration_seconds": 8,
      "awareness_level": "problem_aware",
      "hook_type": "confrontational",
      "character_image_prompt": "A highly detailed Pixar-style 3D animated spine character standing angrily on a sagging old mattress...",
      "veo_prompt": "spine character says: \\"I've been holding you up for 35 years and THIS is the mattress you give me?\\"",
      "ad_copy_primary": "Your spine has been silently suffering every night. HappySleep's ergonomic pillow keeps your neck and spine perfectly aligned — so you wake up without the aches. Try it risk-free.",
      "ad_copy_headline": "Your Back Deserves Better"
    }
  ]
}
\`\`\`

IMPORTANT: Return ONLY valid JSON. No markdown fences. No commentary outside the JSON.

${learningsContext ? `\n## CREATIVE TESTING LEARNINGS\n${learningsContext}` : ""}

## PRODUCT KNOWLEDGE
Product: ${product}

${productBrief}

${guidelines ? `## COPYWRITING GUIDELINES\n${guidelines}` : ""}
`;
}

export function buildPixarAnimationUserPrompt(
  count: number,
  existingConcepts?: string[],
  rejectedConcepts?: string[],
  direction?: string
): string {
  const parts: string[] = [];

  parts.push(`Generate ${count} Pixar-style talking object video ad concept(s).`);
  parts.push("Each concept must use a DIFFERENT character and angle combination.");
  parts.push("Return valid JSON with a 'proposals' array.");

  if (direction) {
    parts.push(`\n## CREATIVE DIRECTION\n${direction}`);
  }

  if (existingConcepts && existingConcepts.length > 0) {
    parts.push(`\n## EXISTING CONCEPTS (avoid similar ideas)\n${existingConcepts.map(c => `- ${c}`).join("\n")}`);
  }

  if (rejectedConcepts && rejectedConcepts.length > 0) {
    parts.push(`\n## REJECTED CONCEPTS (avoid these directions)\n${rejectedConcepts.map(c => `- ${c}`).join("\n")}`);
  }

  return parts.join("\n");
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/lib/pixar-brainstorm.ts
git commit -m "feat: add pixar-brainstorm.ts prompt builders"
```

---

### Task 3: Add API route handler for pixar_animation

**Files:**
- Modify: `src/app/api/brainstorm/route.ts` — Add handler block

**Reference:** The `video_ugc` handler block at lines 356–548. The pixar_animation handler follows the same NDJSON streaming pattern but is simpler (no character lookups, no multi-pass translation).

**Step 1: Add the handler block**

In `src/app/api/brainstorm/route.ts`, add a new `if (mode === "pixar_animation")` block BEFORE the generic brainstorm flow (but after the from_competitor_ad block). Pattern:

```typescript
if (mode === "pixar_animation") {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  async function emit(data: object) {
    await writer.write(encoder.encode(JSON.stringify(data) + "\n"));
  }

  (async () => {
    try {
      await emit({ step: "generating", message: "Building Pixar animation prompt..." });

      // Build prompts
      const systemPrompt = buildPixarAnimationSystemPrompt(
        productFull.name,
        productFull.brief || "",
        guidelines.map(g => g.content).join("\n"),
        learningsContext
      );

      const userPrompt = buildPixarAnimationUserPrompt(
        count,
        existingConcepts?.map(c => `${c.name} (${c.angle})`),
        rejectedConcepts?.map(c => c.concept_description || ""),
        body.direction
      );

      await emit({ step: "generating", message: "Generating talking object concepts..." });

      // Call Claude
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const text = response.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map(b => b.text)
        .join("");

      // Parse JSON (strip markdown fences if present — Claude Haiku quirk)
      const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      const proposals = parsed.proposals || parsed;

      // Log usage
      await supabase.from("usage_logs").insert({
        type: "claude_brainstorm",
        model: "claude-sonnet-4-5-20250929",
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        metadata: { mode: "pixar_animation", product: productFull.slug, count },
      });

      await emit({ step: "done", proposals });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("Pixar animation brainstorm error:", msg);
      await emit({ step: "error", message: msg });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
```

**Step 2: Add import at top of file**

```typescript
import { buildPixarAnimationSystemPrompt, buildPixarAnimationUserPrompt } from "@/lib/pixar-brainstorm";
```

**Step 3: Verify build**

Run: `npx tsc --noEmit 2>&1 | head -20`

**Step 4: Commit**

```bash
git add src/app/api/brainstorm/route.ts
git commit -m "feat: add pixar_animation handler in brainstorm API route"
```

---

### Task 4: Add UI support in BrainstormGenerate component

**Files:**
- Modify: `src/components/brainstorm/BrainstormGenerate.tsx`
- Modify: `src/lib/brainstorm.ts` (if icon mapping exists there)

**Step 1: Add icon mapping**

In `BrainstormGenerate.tsx`, find the `MODE_ICONS` record (around line 85–94) and add:

```typescript
pixar_animation: Clapperboard,
```

Also add the Lucide import at the top if not already present:

```typescript
import { ..., Clapperboard } from "lucide-react";
```

**Step 2: Add mode-specific UI fields**

Find where `video_ugc` has its mode-specific form fields. Add a similar section for `pixar_animation` with a simple textarea for creative direction:

```typescript
{mode === "pixar_animation" && (
  <div className="space-y-3">
    <div>
      <label className="text-sm font-medium text-zinc-300">Creative Direction (optional)</label>
      <textarea
        value={direction}
        onChange={(e) => setDirection(e.target.value)}
        placeholder="e.g. Focus on body parts that suffer from bad sleep posture, use confrontational tone..."
        className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
        rows={3}
      />
    </div>
  </div>
)}
```

Check if `direction` state already exists (it may be shared with other modes). If not, add:

```typescript
const [direction, setDirection] = useState("");
```

**Step 3: Handle Pixar proposal approval**

Find how `video_ugc` proposals are converted to video jobs on approval. For pixar_animation, the approval flow should create a video_job with:
- `pipeline_mode: "single_clip"`
- `max_shots: 1`
- `format_type: "pixar_animation"`
- `script` = the dialogue
- `character_description` = character_image_prompt (for the keyframe)
- `sora_prompt` = veo_prompt
- `duration_seconds` = from proposal

Look at the existing `handleApproveVideo` or similar function and add a `handleApprovePixar` variant, OR extend the existing video approval to handle pixar proposals.

**Step 4: Pass direction to API request**

In the brainstorm submit handler, when mode is `pixar_animation`, include the direction field in the request body:

```typescript
if (mode === "pixar_animation") {
  requestBody.direction = direction;
}
```

**Step 5: Verify build + dev server**

Run: `npx tsc --noEmit 2>&1 | head -20`

Then start dev server and manually test the brainstorm page shows the new mode card.

**Step 6: Commit**

```bash
git add src/components/brainstorm/BrainstormGenerate.tsx
git commit -m "feat: add Pixar Animation mode UI in brainstorm page"
```

---

### Task 5: Wire approval flow — Pixar concept → video_job + video_shot

**Files:**
- Modify: `src/components/brainstorm/BrainstormGenerate.tsx` (or wherever proposal approval lives)
- Check: `src/app/api/video-jobs/route.ts` for the POST handler

**Step 1: Create video job from approved Pixar proposal**

When user approves a Pixar proposal, POST to `/api/video-jobs` with:

```typescript
const videoJobPayload = {
  product: product.slug,
  concept_name: proposal.concept_name,
  hook_type: proposal.hook_type,
  format_type: "pixar_animation",
  script: proposal.dialogue,
  character_description: proposal.character_image_prompt,
  sora_prompt: proposal.veo_prompt,
  duration_seconds: proposal.duration_seconds || 8,
  awareness_level: proposal.awareness_level,
  ad_copy_primary: proposal.ad_copy_primary,
  ad_copy_headline: proposal.ad_copy_headline,
  style_notes: JSON.stringify({
    character_object: proposal.character_object,
    character_category: proposal.character_category,
    character_mood: proposal.character_mood,
    animation_style: proposal.animation_style || "pixar",
  }),
  pipeline_mode: "single_clip",
  max_shots: 1,
  reuse_first_frame: true,
};
```

**Step 2: Create the video_shot row**

After the video_job is created, insert a single `video_shot`:

```typescript
await supabase.from("video_shots").insert({
  video_job_id: videoJob.id,
  shot_number: 1,
  shot_description: proposal.character_image_prompt,  // Nano Banana keyframe prompt
  veo_prompt: proposal.veo_prompt,                    // VEO animation prompt
  duration_seconds: proposal.duration_seconds || 8,
  image_status: "pending",
  video_status: "pending",
});
```

Check if the existing video_jobs POST endpoint already creates shots, or if this needs to happen client-side or via a separate API call.

**Step 3: Redirect to video job detail page**

After creation, navigate to `/video-jobs/[id]` where the existing UI handles keyframe generation, video generation, etc.

**Step 4: Verify end-to-end flow**

1. Open brainstorm page
2. Select "Pixar Animation" mode
3. Generate concepts
4. Approve one
5. Verify video_job and video_shot rows are created in Supabase
6. Verify redirect to video job detail page

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire Pixar concept approval to video job creation"
```

---

### Task 6: End-to-end test — generate a real Pixar talking object video

**Files:** None — this is a manual verification task

**Step 1: Generate concepts**

1. Go to brainstorm page, select "Pixar Animation"
2. Select HappySleep as product
3. Generate 3 concepts
4. Verify each has: concept_name, character_object, dialogue, character_image_prompt, veo_prompt, ad_copy

**Step 2: Approve and generate keyframe**

1. Approve one concept
2. On the video job page, click "Generate Keyframe" (or equivalent)
3. Wait for Nano Banana to generate the Pixar-style character image
4. Verify the image looks like a proper Pixar 3D animated character

**Step 3: Generate video**

1. Click "Generate Video" to send keyframe + veo_prompt to VEO 3.1
2. Wait for video generation
3. Verify the character talks with lip sync matching the dialogue

**Step 4: Fix any issues**

If the image or video quality is off, iterate on the prompt templates in `pixar-brainstorm.ts`. Common issues:
- Character doesn't look Pixar enough → strengthen "Pixar-style 3D" language
- Mouth not open for talking → add "mouth slightly open, mid-speech" to image prompt
- VEO doesn't animate properly → ensure veo_prompt uses exact `character says: "..."` format

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete Pixar talking objects video ad mode"
```
