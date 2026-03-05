# AI UGC Video Generation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add AI UGC video generation to Content Hub — brainstorm video concepts, generate via Sora 2 Pro (Kie.ai), translate per language, push to Meta as video ads.

**Architecture:** Mirror Pattern — new parallel tables (video_jobs, source_videos, video_translations) and routes that follow the exact same patterns as the existing static ad pipeline. Extends the brainstorm system with a `video_ugc` mode. New Kie.ai video functions alongside existing image functions.

**Tech Stack:** Next.js App Router, Supabase (Postgres + Storage), Kie.ai API (Sora 2 Pro), Anthropic Claude API, Meta Marketing API v22.0.

**Design doc:** `docs/plans/2026-03-05-video-ugc-design.md`

---

## Task 1: Database Schema Migration

**Files:**
- No code files — DDL via Supabase Management API

**Step 1: Create video_jobs table**

```sql
CREATE TABLE video_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product text NOT NULL,
  concept_name text NOT NULL,
  concept_number int,
  hook_type text,
  script_structure text,
  format_type text,
  script text,
  sora_prompt text,
  character_description text,
  character_tag text,
  product_description text,
  duration_seconds int DEFAULT 12,
  target_languages text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft',
  brainstorm_session_id text,
  awareness_level text,
  style_notes text,
  ad_copy_primary text[] DEFAULT '{}',
  ad_copy_headline text[] DEFAULT '{}',
  landing_page_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_video_jobs_product ON video_jobs(product);
CREATE INDEX idx_video_jobs_status ON video_jobs(status);

-- Auto-increment concept_number per product
CREATE OR REPLACE FUNCTION set_video_concept_number()
RETURNS trigger AS $$
BEGIN
  IF NEW.concept_number IS NULL THEN
    SELECT COALESCE(MAX(concept_number), 0) + 1
    INTO NEW.concept_number
    FROM video_jobs
    WHERE product = NEW.product;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_video_concept_number
  BEFORE INSERT ON video_jobs
  FOR EACH ROW EXECUTE FUNCTION set_video_concept_number();

-- Auto-update updated_at
CREATE TRIGGER trg_video_jobs_updated
  BEFORE UPDATE ON video_jobs
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
```

Run via: `curl -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" -H "Content-Type: application/json" -d '{"query":"..."}'`

**Step 2: Create source_videos table**

```sql
CREATE TABLE source_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_job_id uuid NOT NULL REFERENCES video_jobs(id) ON DELETE CASCADE,
  video_url text,
  kie_task_id text,
  thumbnail_url text,
  duration_seconds numeric,
  resolution text DEFAULT '720x1280',
  model text DEFAULT 'sora-2-pro',
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  generation_params jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_source_videos_job ON source_videos(video_job_id);
```

**Step 3: Create video_translations table**

```sql
CREATE TABLE video_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_job_id uuid NOT NULL REFERENCES video_jobs(id) ON DELETE CASCADE,
  source_video_id uuid REFERENCES source_videos(id),
  language text NOT NULL,
  translated_script text,
  translated_sora_prompt text,
  video_url text,
  kie_task_id text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_video_translations_job ON video_translations(video_job_id);
CREATE INDEX idx_video_translations_lang ON video_translations(language);
```

**Step 4: Create video_characters and video_products tables**

```sql
CREATE TABLE video_characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sora_tag text,
  character_description text,
  reference_image_url text,
  product text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE video_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product text NOT NULL,
  sora_tag text,
  product_description text,
  reference_image_url text,
  animated_video_url text,
  created_at timestamptz DEFAULT now()
);
```

**Step 5: Add video_translation_id to meta_ads**

```sql
ALTER TABLE meta_ads ADD COLUMN video_translation_id uuid REFERENCES video_translations(id);
```

**Step 6: Create videos storage bucket**

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true);
```

**Step 7: Verify all tables**

```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'video%';
```

Expected: `video_jobs`, `video_translations`, `video_characters`, `video_products`, `source_videos`

**Step 8: Commit**

```bash
git commit --allow-empty -m "chore: create video_jobs, source_videos, video_translations tables in Supabase"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/constants.ts`

**Step 1: Add video types to `src/types/index.ts`**

Add at the end of the file, after the existing image types:

```typescript
// --- Video UGC Types ---

export type VideoJobStatus =
  | "draft"
  | "generating"
  | "generated"
  | "translating"
  | "translated"
  | "pushing"
  | "live"
  | "killed";

export type VideoTranslationStatus =
  | "pending"
  | "translating"
  | "generating"
  | "completed"
  | "failed";

export type SourceVideoStatus = "pending" | "generating" | "completed" | "failed";

export type HookType =
  | "problem_solution"
  | "promise"
  | "secret"
  | "discovery"
  | "social_proof"
  | "curiosity"
  | "confrontational";

export type ScriptStructure =
  | "testimonial"
  | "insider_secret"
  | "discovery"
  | "before_after"
  | "street_interview"
  | "podcast";

export type VideoFormatType =
  | "selfie_testimonial"
  | "street_interview"
  | "dorm_confessional"
  | "professor_lecture"
  | "grocery_store"
  | "grwm"
  | "podcast_clip";

export type DeliveryStyle =
  | "conversational"
  | "energetic"
  | "conspiratorial"
  | "emotional"
  | "authority";

export interface VideoJob {
  id: string;
  product: Product;
  concept_name: string;
  concept_number: number | null;
  hook_type: HookType | null;
  script_structure: ScriptStructure | null;
  format_type: VideoFormatType | null;
  script: string | null;
  sora_prompt: string | null;
  character_description: string | null;
  character_tag: string | null;
  product_description: string | null;
  duration_seconds: number;
  target_languages: Language[];
  status: VideoJobStatus;
  brainstorm_session_id: string | null;
  awareness_level: string | null;
  style_notes: string | null;
  ad_copy_primary: string[];
  ad_copy_headline: string[];
  landing_page_url: string | null;
  created_at: string;
  updated_at: string;
  source_videos?: SourceVideo[];
  video_translations?: VideoTranslation[];
}

export interface SourceVideo {
  id: string;
  video_job_id: string;
  video_url: string | null;
  kie_task_id: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  resolution: string;
  model: string;
  status: SourceVideoStatus;
  error_message: string | null;
  generation_params: Record<string, unknown> | null;
  created_at: string;
}

export interface VideoTranslation {
  id: string;
  video_job_id: string;
  source_video_id: string | null;
  language: Language;
  translated_script: string | null;
  translated_sora_prompt: string | null;
  video_url: string | null;
  kie_task_id: string | null;
  status: VideoTranslationStatus;
  error_message: string | null;
  created_at: string;
}

export interface VideoCharacter {
  id: string;
  name: string;
  sora_tag: string | null;
  character_description: string | null;
  reference_image_url: string | null;
  product: string | null;
  created_at: string;
}

export interface VideoProduct {
  id: string;
  product: string;
  sora_tag: string | null;
  product_description: string | null;
  reference_image_url: string | null;
  animated_video_url: string | null;
  created_at: string;
}

export interface VideoConceptProposal {
  concept_name: string;
  format_type: VideoFormatType;
  hook_type: HookType;
  script_structure: ScriptStructure;
  awareness_level: string;
  delivery_style: DeliveryStyle;
  script: string;
  character_description: string;
  sora_prompt: string;
  ad_copy_primary: string;
  ad_copy_headline: string;
}
```

**Step 2: Add video constants to `src/lib/constants.ts`**

```typescript
export const KIE_VIDEO_MODEL = "sora-2-pro";
export const VIDEO_STORAGE_BUCKET = "videos";

export const VIDEO_FORMATS = [
  { id: "selfie_testimonial", label: "Selfie Testimonial", description: "Single person, direct to camera, iPhone selfie in bedroom/car/bathroom" },
  { id: "street_interview", label: "Street Interview", description: "Two people, vox pop style, interviewer off-camera" },
  { id: "dorm_confessional", label: "Dorm Confessional", description: "Messy room, night, phone on desk, late-night realization" },
  { id: "professor_lecture", label: "Professor Lecture", description: "Lecture hall, student secretly filming, authority + curiosity gap" },
  { id: "grocery_store", label: "Grocery Store", description: "Grocery aisle, hidden camera style, organic discovery" },
  { id: "grwm", label: "GRWM", description: "Vanity/bathroom, ring light, beauty/wellness tutorial" },
  { id: "podcast_clip", label: "Podcast Clip", description: "Home studio, 2 hosts, professional camera, authority/education" },
] as const;

export type VideoFormatId = (typeof VIDEO_FORMATS)[number]["id"];

export const HOOK_TYPES = [
  { id: "problem_solution", label: "Problem-Solution", description: "Opens with relatable complaint, pivots to fix" },
  { id: "promise", label: "Promise", description: "Opens with bold claim about a result" },
  { id: "secret", label: "Secret / Insider", description: "Opens with forbidden or insider knowledge" },
  { id: "discovery", label: "Discovery / Accident", description: "Opens like person just stumbled onto something" },
  { id: "social_proof", label: "Social Proof / Numbers", description: "Opens with statistics or social validation" },
  { id: "curiosity", label: "Curiosity Gap", description: "Opens with question that demands answer" },
  { id: "confrontational", label: "Confrontational", description: "Opens with controversial or provocative statement" },
] as const;

export const SCRIPT_STRUCTURES = [
  { id: "testimonial", label: "Testimonial" },
  { id: "insider_secret", label: "Insider Secret" },
  { id: "discovery", label: "Discovery / Unboxing" },
  { id: "before_after", label: "Before/After" },
  { id: "street_interview", label: "Street Interview" },
  { id: "podcast", label: "Podcast (Two-Host)" },
] as const;
```

**Step 3: Verify TypeScript compiles**

Run: `cd /Users/williamhedin/Claude\ Code/content-hub && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

**Step 4: Commit**

```bash
git add src/types/index.ts src/lib/constants.ts
git commit -m "feat: add video UGC TypeScript types and constants"
```

---

## Task 3: Kie.ai Video Generation Client

**Files:**
- Modify: `src/lib/kie.ts` — add video generation functions

**Step 1: Add video generation functions to `src/lib/kie.ts`**

Add after the existing `generateImage` function:

```typescript
// --- Video Generation (Sora 2 Pro) ---

export interface VideoGenerationParams {
  model?: string;
  size?: string;
  seconds?: string;
  style?: string;
  stylize?: number;
}

const VIDEO_DEFAULTS: VideoGenerationParams = {
  model: "sora-2-pro",
  size: "720x1280",
  seconds: "12",
  style: "raw",
  stylize: 0,
};

export async function createVideoTask(
  prompt: string,
  params: VideoGenerationParams = {}
): Promise<string> {
  const merged = { ...VIDEO_DEFAULTS, ...params };
  const input: Record<string, unknown> = {
    prompt,
    size: merged.size,
    seconds: merged.seconds,
    style: merged.style,
    stylize: merged.stylize,
  };

  return withRetry(
    async () => {
      const res = await fetch(`${KIE_API_BASE}/createTask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify({
          model: merged.model,
          input,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Kie.ai createVideoTask failed (${res.status}): ${text}`);
      }

      const data: CreateTaskResponse = await res.json();
      if (data.code !== 200) {
        throw new Error(`Kie.ai createVideoTask error: ${data.msg}`);
      }

      return data.data.taskId;
    },
    { maxAttempts: 3, initialDelayMs: 2000, isRetryable: isTransientError }
  );
}

export async function generateVideo(
  prompt: string,
  params: VideoGenerationParams = {}
): Promise<{ urls: string[]; taskId: string; costTimeMs: number | null }> {
  const taskId = await createVideoTask(prompt, params);
  const result = await pollTaskResult(taskId);
  return { ...result, taskId };
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /Users/williamhedin/Claude\ Code/content-hub && npx tsc --noEmit 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/lib/kie.ts
git commit -m "feat: add Sora 2 Pro video generation to Kie.ai client"
```

---

## Task 4: Video Brainstorm System Prompt

**Files:**
- Create: `src/lib/video-brainstorm.ts`

**Step 1: Create the video brainstorm module**

This module builds the system prompt for Claude when generating video UGC concepts. It injects the UGC knowledge base (script frameworks, hook types, anti-AI rules, master prompt template) into the system prompt.

```typescript
import { createServerSupabase } from "./supabase";
import { buildLearningsContext, buildHookInspiration } from "./brainstorm";

// --- UGC Knowledge Base (embedded from reference docs) ---

const ANTI_AI_RULES = `## The 7 Anti-AI Rules (What Makes It Look Real)

1. **iPhone Aesthetics** — Specify exact device model (iPhone 15 Pro), front camera ~24mm, HDR auto-tone, filename "IMG_XXXX.MOV", "shot with an iPhone with imperfect lighting"
2. **Imperfect Framing** — Off-center composition, slightly cropped forehead/shoulder, handheld sway and micro-jitter, "too much headroom" or "slightly below eye level"
3. **Natural Lighting Only** — Window light, bathroom vanity, car dashboard daylight. Never studio lighting. Uneven lighting — one side brighter. Visible skin texture.
4. **Authentic Environments** — Messy bedrooms, parked cars, bathrooms, kitchen counters. Lived-in details: Starbucks cups, clutter, unmade beds.
5. **Hand Safety** — Keep hands below collarbone at all times. No gestures near lens or face. Fingers naturally curved and relaxed. No pointing or finger overlap.
6. **Real Skin & Texture** — Visible pores, no smoothing, no beauty filters. Natural shadows. Slight film grain. Real skin imperfections.
7. **Conversational Delivery** — Filler words: "um", "like", "you know". Natural pauses mid-thought. Direct eye contact. Not influencer cadence — real person cadence.`;

const HOOK_TYPES_REFERENCE = `## Hook Types (First 3 Seconds — 47% of ad performance)

1. **Problem-Solution** — Opens with relatable complaint, pivots to fix. "You know how you can never fall asleep at night?"
2. **Promise** — Opens with bold claim about result. "The 7-second trick to deep sleep."
3. **Secret/Insider** — Forbidden or insider knowledge. "Both my parents are neurologists, and they're probably gonna hate me for telling you this..."
4. **Discovery/Accident** — Stumbled onto something. "I just watched a video that changed the way I think."
5. **Social Proof/Numbers** — Statistics or social validation. "38,000 people fixed their sleep with this..."
6. **Curiosity Gap** — Question that demands answer. "Why is everyone complaining about their feet hurting?"
7. **Confrontational** — Controversial or provocative. "Most people aren't fat — they're just bloated."`;

const SCRIPT_STRUCTURES_REFERENCE = `## Script Structures

### Testimonial (10-15s) — Single person, direct to camera
[HOOK 0-3s] → [PROBLEM ACKNOWLEDGMENT 3-5s] → [SOLUTION INTRODUCTION 5-10s] → [CLOSING 10-12s, hard cut]
Key: Start talking BEFORE ready (mid-thought entry), pause mid-sentence, end abruptly.

### Insider Secret (10-15s) — Conspiratorial energy
[AUTHORITY ESTABLISHMENT 0-3s] → [THE SECRET 3-10s] → [TEASER/CTA 10-15s, clip cuts mid-sentence]
Key: Lean forward, lower voice on secret, intense eye contact, end mid-sentence.

### Discovery/Unboxing (10-15s) — High energy
[EXCITED OPENER 0-3s] → [SOCIAL PROOF 3-6s] → [PRODUCT REVEAL + OBJECTION 6-12s] → [BENEFIT PAYOFF 12-15s]
Key: Genuine enthusiasm not OTT, hold product when introducing, real skepticism before payoff.

### Before/After (10-15s) — Emotional
[VULNERABLE CONFESSION 0-5s] → [THE BEFORE 5-8s] → [THE AFTER 8-12s] → [EMOTIONAL CLOSE 12-15s]
Key: Slightly glossy eyes, hands stay LOW, soft intimate voice, genuine disbelief.

### Street Interview (12-15s) — Two people, vox pop
[APPROACH 0-3s, interviewer off-camera] → [REVEAL 3-8s] → [REACTION 8-12s] → [HUMBLE CLOSE 12-15s]
Key: Interviewer NEVER on camera, subject caught off guard but flattered, natural "um"s.

### Podcast (Two-Host)
HOST 1 (AUTHORITY): Expert positioning, delivers facts/statistics, serious measured tone.
HOST 2 (AUDIENCE PROXY): Asks questions viewers are thinking, genuine surprise/curiosity.
Keep each dialogue chunk under 20-25 words (8-second clip limit).`;

const DELIVERY_STYLES_REFERENCE = `## Delivery Styles

- **Conversational (Default)**: Natural rhythm, filler words, slight pauses, occasional glance away
- **Energetic**: Fast-paced but articulate, wider eyes, hand gestures, head nods
- **Conspiratorial**: Lower voice on reveals, lean forward, intense eye contact, knowing half-smile
- **Emotional**: Soft quiet voice, slightly glossy eyes, gentle smile, hands at midsection
- **Authority**: Clear measured tone, confident posture, deliberate emphasis, direct gaze`;

const MASTER_PROMPT_TEMPLATE = `## Sora 2 Prompt Template (Target ~5000 characters)

A casual, selfie-style IPHONE 15 PRO front-camera vertical video (9:16) filmed [LOCATION] titled "IMG_[XXXX].MOV".

Character: [NAME], a [AGE] [ETHNICITY] [GENDER] with [SPECIFIC_HAIR_DETAILS], [EYE_COLOR] [EYE_SHAPE] eyes [EYE_DETAILS], [DISTINCTIVE_FACIAL_FEATURES], [SKIN_TONE], [BUILD_DESCRIPTION], wearing [DETAILED_CLOTHING_DESCRIPTION], with [POSTURE_AND_MANNERISMS], [EMOTIONAL_BASELINE], [DISTINCTIVE_ACCESSORIES], [VOICE_CHARACTERISTICS].

[He/She] sits/stands [POSITION], casually holding phone at arm's length speaking directly to camera.
Tone is [TONE], delivering a [CONTENT TYPE] for [PRODUCT/TOPIC].
Atmosphere feels [MOOD] — like sharing a personal secret/venting to friend/giving insider advice.

Cinematography:
- Camera Shot: [SHOT TYPE] from [ANGLE], [FRAMING]
- Lens & DOF: iPhone 15 Pro front camera (~24mm), [DEPTH OF FIELD]
- Camera Motion: Subtle handheld sway and jitter consistent with selfie grip
- Lighting: [LIGHT SOURCE] illuminating face [LIGHTING STYLE]. [SHADOW DETAILS]
- Color & Grade: iPhone HDR auto-tone; [COLOR PALETTE]; natural skin texture; [FILTER]
- Resolution: 720x1280, 30fps, vertical. "IMG_[XXXX].MOV"

Actions:
- [Action 1 with timestamp]
- [Action 2]
- [Action 3]

Dialogue:
"[EXACT SCRIPT WITH FILLER WORDS, PAUSES, EMPHASIS. 3-8 SENTENCES.]"

Audio & Ambience:
iPhone mic — [AUDIO QUALITY]. [BACKGROUND SOUNDS]. No music, no cuts; one-take natural pacing.

UGC Authenticity Keywords:
smartphone selfie, handheld realism, [LOCATION], [LIGHTING], influencer-style monologue, direct-to-camera, raw unfiltered aesthetic, real voice, micro hand jitters, no jump cuts.

Quality Control Negatives:
subtitles, captions, watermark, text overlays, words on screen, logo, branding, poor lighting, blurry footage, low resolution, artifacts, distorted hands, artificial lighting, oversaturation.`;

const MARKET_ADAPTATION = `## Scandinavian Market Adaptation

When generating for specific markets, adapt:
- **Filler words**: NO: "liksom", "altså", "på en måte" / DK: "altså", "liksom", "ikke" / SE: "liksom", "alltså", "typ"
- **Settings**: Scandinavian apartments (lighter, minimalist), local stores (Coop, ICA, Meny)
- **Character**: Match local demographics, Scandinavian names and looks
- **Delivery**: More understated than US-style UGC, less hype
- **Language**: Translate script naturally, keep the conversational feel`;

export function buildVideoUgcSystemPrompt(
  product: string,
  productBrief: string,
  guidelines: string,
  hookInspiration: string,
  learningsContext: string,
  existingCharacters: string
): string {
  return `You are a world-class UGC video creative director specializing in AI-generated video ads. You create concepts for realistic, scroll-stopping UGC videos generated with Sora 2 Pro.

## Your Product
${productBrief}

## Copywriting Guidelines
${guidelines}

${existingCharacters ? `## Existing Characters (reuse when appropriate)\n${existingCharacters}\n` : ""}

## UGC Video Knowledge Base

${ANTI_AI_RULES}

${HOOK_TYPES_REFERENCE}

${SCRIPT_STRUCTURES_REFERENCE}

${DELIVERY_STYLES_REFERENCE}

${MASTER_PROMPT_TEMPLATE}

${MARKET_ADAPTATION}

## Hook Inspiration From Library
${hookInspiration || "No hooks in library yet."}

## Creative Learnings From Past Concepts
${learningsContext || "No learnings yet."}

## CRITICAL RULES

1. **ANTI-COPYING**: Never use example phrases from this document verbatim. Every hook, script line, and concept must be 100% original. Do not use "2 AM", "ceiling staring", "Okinawan", "Rockefeller", or any other common AI-generated cliche.
2. **HAND SAFETY**: All scripts must keep character hands below collarbone. No gestures near face or lens. No pointing.
3. **ONE IDEA**: Each video delivers exactly one message. Never combine multiple selling points.
4. **PRODUCT VISIBLE**: Product must appear within first 3 seconds. Label clearly visible, held at chest level.
5. **AUTHENTIC SPEECH**: Include natural filler words, pauses, self-corrections. Never write polished copy — write how real people actually talk.
6. **SORA PROMPT LENGTH**: Target ~5000 characters for the Sora 2 prompt. Be extremely detailed about character appearance, cinematography, and environment.

## Output Format

Return a JSON object with this exact structure:
\`\`\`json
{
  "proposals": [
    {
      "concept_name": "Short descriptive name",
      "format_type": "selfie_testimonial|street_interview|dorm_confessional|professor_lecture|grocery_store|grwm|podcast_clip",
      "hook_type": "problem_solution|promise|secret|discovery|social_proof|curiosity|confrontational",
      "script_structure": "testimonial|insider_secret|discovery|before_after|street_interview|podcast",
      "awareness_level": "problem_aware|solution_aware|product_aware|most_aware",
      "delivery_style": "conversational|energetic|conspiratorial|emotional|authority",
      "script": "Full script with delivery notes in brackets, filler words, pauses marked with ..., emotions in [brackets]",
      "character_description": "Detailed character block: age, ethnicity, gender, hair, eyes, facial features, skin tone, build, clothing, posture, mannerisms, emotional baseline, accessories, voice",
      "sora_prompt": "Complete ~5000 character Sora 2 prompt following the master template exactly",
      "ad_copy_primary": "The primary text that appears above the video in the Meta ad",
      "ad_copy_headline": "Short headline for the Meta ad"
    }
  ]
}
\`\`\`

Return ONLY valid JSON. No markdown fences. No explanation text.`;
}

export function buildVideoUgcUserPrompt(
  request: string,
  count: number,
  existingConcepts?: string[],
  rejectedConcepts?: string[]
): string {
  let prompt = `Generate ${count} unique UGC video concept${count > 1 ? "s" : ""} for this product.

User request: ${request || "Create fresh video concepts that will stop the scroll and convert."}`;

  if (existingConcepts?.length) {
    prompt += `\n\nExisting concepts (DO NOT duplicate these angles):\n${existingConcepts.map((c) => `- ${c}`).join("\n")}`;
  }

  if (rejectedConcepts?.length) {
    prompt += `\n\nRejected concepts (DO NOT use similar approaches):\n${rejectedConcepts.map((c) => `- ${c}`).join("\n")}`;
  }

  prompt += `\n\nEach concept MUST:
- Use a DIFFERENT format_type and hook_type from the others
- Have a completely original hook that doesn't repeat any example phrases
- Include a full script with natural speech patterns, filler words, and delivery notes
- Include a complete ~5000 character Sora 2 prompt following the master template
- Include ad copy (primary text + headline) for the Meta ad`;

  return prompt;
}

export async function loadVideoUgcContext(product: string): Promise<{
  productBrief: string;
  guidelines: string;
  hookInspiration: string;
  learningsContext: string;
  existingCharacters: string;
  existingConcepts: string[];
}> {
  const db = createServerSupabase();

  // Fetch product info, guidelines, and existing video characters in parallel
  const [productResult, guidelinesResult, charactersResult, conceptsResult, hookInspiration, learningsContext] =
    await Promise.all([
      db.from("products").select("*").eq("slug", product).single(),
      db.from("copywriting_guidelines").select("*").eq("product", product),
      db.from("video_characters").select("*").eq("product", product),
      db.from("video_jobs").select("concept_name, hook_type, format_type").eq("product", product).neq("status", "killed"),
      buildHookInspiration(product),
      buildLearningsContext(product),
    ]);

  const productData = productResult.data;
  const productBrief = productData
    ? `Product: ${productData.name}\nSlug: ${productData.slug}\nDescription: ${productData.description || "N/A"}\nBrand: ${productData.brand || "N/A"}`
    : `Product: ${product}`;

  const guidelines = (guidelinesResult.data || [])
    .map((g: { title: string; content: string }) => `### ${g.title}\n${g.content}`)
    .join("\n\n") || "No specific guidelines.";

  const existingCharacters = (charactersResult.data || [])
    .map((c: { name: string; sora_tag: string; character_description: string }) =>
      `- ${c.name} (${c.sora_tag}): ${c.character_description?.slice(0, 200)}...`
    )
    .join("\n") || "";

  const existingConcepts = (conceptsResult.data || [])
    .map((c: { concept_name: string; hook_type: string; format_type: string }) =>
      `${c.concept_name} (${c.hook_type}, ${c.format_type})`
    );

  return {
    productBrief,
    guidelines,
    hookInspiration,
    learningsContext,
    existingCharacters,
    existingConcepts,
  };
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /Users/williamhedin/Claude\ Code/content-hub && npx tsc --noEmit 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/lib/video-brainstorm.ts
git commit -m "feat: add video UGC brainstorm system prompt builder"
```

---

## Task 5: Video Brainstorm API Route

**Files:**
- Modify: `src/app/api/brainstorm/route.ts` — add `video_ugc` mode handling
- Modify: `src/lib/brainstorm.ts` — add `video_ugc` to BrainstormMode type

**Step 1: Add `video_ugc` to BrainstormMode type**

In `src/lib/brainstorm.ts`, find the `BrainstormMode` type (around line 623) and add `"video_ugc"`:

```typescript
// Before:
export type BrainstormMode = "from_scratch" | "from_organic" | "from_research" | "from_internal" | "unaware" | "from_template" | "from_competitor_ad";

// After:
export type BrainstormMode = "from_scratch" | "from_organic" | "from_research" | "from_internal" | "unaware" | "from_template" | "from_competitor_ad" | "video_ugc";
```

**Step 2: Add video_ugc handling in brainstorm API route**

In `src/app/api/brainstorm/route.ts`, add an early-return block for `video_ugc` mode (similar to the existing `from_competitor_ad` early-return block). Add it right after the competitor ad block, before the standard brainstorm flow:

```typescript
// --- Video UGC Mode ---
if (mode === "video_ugc") {
  const { buildVideoUgcSystemPrompt, buildVideoUgcUserPrompt, loadVideoUgcContext } =
    await import("@/lib/video-brainstorm");

  const ctx = await loadVideoUgcContext(product);

  const systemPrompt = buildVideoUgcSystemPrompt(
    product,
    ctx.productBrief,
    ctx.guidelines,
    ctx.hookInspiration,
    ctx.learningsContext,
    ctx.existingCharacters
  );

  const userPrompt = buildVideoUgcUserPrompt(
    body.request || "",
    count,
    ctx.existingConcepts,
    body.rejected_concepts
  );

  await emit({ step: "generating", message: "Generating video concepts..." });

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");

  await emit({ step: "parsing", message: "Parsing video concepts..." });

  // Strip markdown fences (Haiku quirk)
  const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "");
  const parsed = JSON.parse(cleaned);

  await emit({
    step: "done",
    proposals: parsed.proposals,
    type: "video_ugc",
    cost: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cost_usd:
        (response.usage.input_tokens * 3) / 1_000_000 +
        (response.usage.output_tokens * 15) / 1_000_000,
    },
  });

  // Log usage
  await db.from("usage_logs").insert({
    type: "video_brainstorm",
    model: CLAUDE_MODEL,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cost_usd:
      (response.usage.input_tokens * 3) / 1_000_000 +
      (response.usage.output_tokens * 15) / 1_000_000,
    metadata: { product, mode, count },
  });

  return;
}
```

**Step 3: Verify TypeScript compiles**

Run: `cd /Users/williamhedin/Claude\ Code/content-hub && npx tsc --noEmit 2>&1 | head -20`

**Step 4: Commit**

```bash
git add src/lib/brainstorm.ts src/app/api/brainstorm/route.ts
git commit -m "feat: add video_ugc mode to brainstorm API"
```

---

## Task 6: Video Jobs CRUD API

**Files:**
- Create: `src/app/api/video-jobs/route.ts` — GET (list) + POST (create)
- Create: `src/app/api/video-jobs/[id]/route.ts` — GET (detail) + PATCH (update)

**Step 1: Create list + create route**

`src/app/api/video-jobs/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const url = new URL(req.url);
  const product = url.searchParams.get("product");
  const status = url.searchParams.get("status");

  let query = db
    .from("video_jobs")
    .select("*, source_videos(*), video_translations(*)")
    .order("created_at", { ascending: false });

  if (product) query = query.eq("product", product);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return safeError(error, "Failed to fetch video jobs");

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const db = createServerSupabase();

  try {
    const body = await req.json();

    const { data, error } = await db
      .from("video_jobs")
      .insert({
        product: body.product,
        concept_name: body.concept_name,
        hook_type: body.hook_type,
        script_structure: body.script_structure,
        format_type: body.format_type,
        script: body.script,
        sora_prompt: body.sora_prompt,
        character_description: body.character_description,
        product_description: body.product_description,
        duration_seconds: body.duration_seconds || 12,
        target_languages: body.target_languages || [],
        status: "draft",
        awareness_level: body.awareness_level,
        style_notes: body.delivery_style || body.style_notes,
        ad_copy_primary: body.ad_copy_primary ? [body.ad_copy_primary] : [],
        ad_copy_headline: body.ad_copy_headline ? [body.ad_copy_headline] : [],
        landing_page_url: body.landing_page_url,
      })
      .select()
      .single();

    if (error) return safeError(error, "Failed to create video job");

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return safeError(err, "Invalid request body", 400);
  }
}
```

**Step 2: Create detail + update route**

`src/app/api/video-jobs/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  const { data, error } = await db
    .from("video_jobs")
    .select("*, source_videos(*), video_translations(*)")
    .eq("id", id)
    .single();

  if (error || !data) return safeError(error, "Video job not found", 404);

  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  try {
    const body = await req.json();

    // Only allow updating specific fields
    const allowed = [
      "concept_name", "script", "sora_prompt", "character_description",
      "character_tag", "product_description", "duration_seconds",
      "target_languages", "status", "style_notes", "awareness_level",
      "hook_type", "script_structure", "format_type",
      "ad_copy_primary", "ad_copy_headline", "landing_page_url",
    ];

    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data, error } = await db
      .from("video_jobs")
      .update(updates)
      .eq("id", id)
      .select("*, source_videos(*), video_translations(*)")
      .single();

    if (error) return safeError(error, "Failed to update video job");

    return NextResponse.json(data);
  } catch (err) {
    return safeError(err, "Invalid request body", 400);
  }
}
```

**Step 3: Verify TypeScript compiles**

Run: `cd /Users/williamhedin/Claude\ Code/content-hub && npx tsc --noEmit 2>&1 | head -20`

**Step 4: Commit**

```bash
git add src/app/api/video-jobs/route.ts src/app/api/video-jobs/\[id\]/route.ts
git commit -m "feat: add video jobs CRUD API routes"
```

---

## Task 7: Video Generation API Route

**Files:**
- Create: `src/app/api/video-jobs/[id]/generate/route.ts`

**Step 1: Create the generation route**

This route kicks off async video generation via Kie.ai, stores the result in Supabase Storage, and updates the source_video row.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { generateVideo } from "@/lib/kie";
import { safeError } from "@/lib/api-error";
import { VIDEO_STORAGE_BUCKET } from "@/lib/constants";

export const maxDuration = 300; // 5 minutes for Vercel

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  // 1. Fetch the video job
  const { data: job, error: jobError } = await db
    .from("video_jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (jobError || !job) return safeError(jobError, "Video job not found", 404);
  if (!job.sora_prompt) {
    return NextResponse.json({ error: "No Sora prompt set on this job" }, { status: 400 });
  }

  // 2. Create source_video row
  const generationParams = {
    model: "sora-2-pro",
    size: "720x1280",
    seconds: String(job.duration_seconds || 12),
    style: "raw",
    stylize: 0,
  };

  const { data: sourceVideo, error: svError } = await db
    .from("source_videos")
    .insert({
      video_job_id: id,
      status: "generating",
      resolution: "720x1280",
      model: "sora-2-pro",
      generation_params: generationParams,
    })
    .select()
    .single();

  if (svError) return safeError(svError, "Failed to create source video record");

  // 3. Update job status
  await db.from("video_jobs").update({ status: "generating" }).eq("id", id);

  // 4. Generate video (this blocks for up to ~5 minutes)
  try {
    const result = await generateVideo(job.sora_prompt, generationParams);

    if (!result.urls.length) {
      throw new Error("Kie.ai returned no video URLs");
    }

    const videoUrl = result.urls[0];

    // 5. Download video and upload to Supabase Storage
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) throw new Error(`Failed to download video: ${videoResponse.status}`);
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

    const storagePath = `${job.product}/${id}/source.mp4`;
    const { error: uploadError } = await db.storage
      .from(VIDEO_STORAGE_BUCKET)
      .upload(storagePath, videoBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    const { data: publicUrl } = db.storage
      .from(VIDEO_STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    // 6. Update source_video
    await db
      .from("source_videos")
      .update({
        status: "completed",
        video_url: publicUrl.publicUrl,
        kie_task_id: result.taskId,
        duration_seconds: job.duration_seconds,
      })
      .eq("id", sourceVideo.id);

    // 7. Update job status
    await db.from("video_jobs").update({ status: "generated" }).eq("id", id);

    // 8. Log usage
    await db.from("usage_logs").insert({
      type: "video_generation",
      model: "sora-2-pro",
      cost_usd: 0, // TODO: calculate from Kie credits
      metadata: {
        video_job_id: id,
        source_video_id: sourceVideo.id,
        task_id: result.taskId,
        cost_time_ms: result.costTimeMs,
      },
    });

    return NextResponse.json({
      source_video_id: sourceVideo.id,
      video_url: publicUrl.publicUrl,
      task_id: result.taskId,
    });
  } catch (err) {
    // Mark as failed
    const message = err instanceof Error ? err.message : "Unknown error";
    await db
      .from("source_videos")
      .update({ status: "failed", error_message: message })
      .eq("id", sourceVideo.id);
    await db.from("video_jobs").update({ status: "draft" }).eq("id", id);

    return safeError(err, "Video generation failed");
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /Users/williamhedin/Claude\ Code/content-hub && npx tsc --noEmit 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/app/api/video-jobs/\[id\]/generate/route.ts
git commit -m "feat: add video generation API route (Kie.ai Sora 2 Pro)"
```

---

## Task 8: Video Translation API Routes

**Files:**
- Create: `src/app/api/video-jobs/[id]/create-translations/route.ts`
- Create: `src/app/api/video-jobs/[id]/generate-translations/route.ts`

**Step 1: Create translation creation route**

This route uses Claude to translate the script + Sora prompt for each target language, creating `video_translation` rows.

`src/app/api/video-jobs/[id]/create-translations/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "@/lib/constants";

const anthropic = new Anthropic();

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  // 1. Fetch video job with source videos
  const { data: job, error: jobError } = await db
    .from("video_jobs")
    .select("*, source_videos(*)")
    .eq("id", id)
    .single();

  if (jobError || !job) return safeError(jobError, "Video job not found", 404);
  if (!job.script || !job.sora_prompt) {
    return NextResponse.json({ error: "Job must have script and prompt before creating translations" }, { status: 400 });
  }

  const sourceVideo = job.source_videos?.find((sv: { status: string }) => sv.status === "completed");

  // 2. Translate for each target language
  const created: string[] = [];

  for (const lang of job.target_languages || []) {
    // Check if translation already exists
    const { data: existing } = await db
      .from("video_translations")
      .select("id")
      .eq("video_job_id", id)
      .eq("language", lang)
      .single();

    if (existing) continue;

    const langName = { sv: "Swedish", no: "Norwegian", da: "Danish", de: "German" }[lang] || lang;

    // Claude translates both script and Sora prompt
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      system: `You are a professional translator specializing in advertising copy. Translate UGC video scripts and Sora 2 prompts to ${langName}.

Rules:
- Keep the conversational, authentic tone — this is UGC, not formal copy
- Replace English filler words with natural ${langName} equivalents (${lang === "no" ? '"liksom", "altså", "på en måte"' : lang === "da" ? '"altså", "liksom", "ikke"' : lang === "sv" ? '"liksom", "alltså", "typ"' : '"also", "sozusagen"'})
- Adapt character ethnicity/name to match ${langName}-speaking market
- Adapt setting details (local stores, apartment style) to ${langName} market
- Keep the Sora prompt structure identical — only translate the dialogue, character name, and setting details
- Keep all technical cinematography terms in English
- Delivery style notes in [brackets] should remain in English

Return JSON:
{
  "translated_script": "...",
  "translated_sora_prompt": "..."
}

Return ONLY valid JSON. No markdown fences.`,
      messages: [
        {
          role: "user",
          content: `Translate this UGC video concept to ${langName}:

SCRIPT:
${job.script}

SORA PROMPT:
${job.sora_prompt}`,
        },
      ],
    });

    const text = response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");

    const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "");
    const parsed = JSON.parse(cleaned);

    const { error: insertError } = await db.from("video_translations").insert({
      video_job_id: id,
      source_video_id: sourceVideo?.id || null,
      language: lang,
      translated_script: parsed.translated_script,
      translated_sora_prompt: parsed.translated_sora_prompt,
      status: "pending",
    });

    if (!insertError) created.push(lang);

    // Log usage
    await db.from("usage_logs").insert({
      type: "video_translation",
      model: CLAUDE_MODEL,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cost_usd:
        (response.usage.input_tokens * 3) / 1_000_000 +
        (response.usage.output_tokens * 15) / 1_000_000,
      metadata: { video_job_id: id, language: lang },
    });
  }

  // Update job status
  if (created.length > 0) {
    await db.from("video_jobs").update({ status: "translating" }).eq("id", id);
  }

  return NextResponse.json({ created: created.length, languages: created });
}
```

**Step 2: Create translation generation route**

This route generates translated videos for all pending translations.

`src/app/api/video-jobs/[id]/generate-translations/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { generateVideo } from "@/lib/kie";
import { safeError } from "@/lib/api-error";
import { VIDEO_STORAGE_BUCKET } from "@/lib/constants";

export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  // 1. Fetch job + pending translations
  const { data: job, error: jobError } = await db
    .from("video_jobs")
    .select("*, video_translations(*)")
    .eq("id", id)
    .single();

  if (jobError || !job) return safeError(jobError, "Video job not found", 404);

  const pending = (job.video_translations || []).filter(
    (t: { status: string; translated_sora_prompt: string | null }) =>
      t.status === "pending" && t.translated_sora_prompt
  );

  if (pending.length === 0) {
    return NextResponse.json({ message: "No pending translations to generate" });
  }

  const results: Array<{ language: string; status: string; video_url?: string }> = [];

  // 2. Generate sequentially (rate limit safety)
  for (const translation of pending) {
    await db
      .from("video_translations")
      .update({ status: "generating" })
      .eq("id", translation.id);

    try {
      const result = await generateVideo(translation.translated_sora_prompt, {
        seconds: String(job.duration_seconds || 12),
      });

      if (!result.urls.length) throw new Error("No video URLs returned");

      // Download and upload to storage
      const videoResponse = await fetch(result.urls[0]);
      if (!videoResponse.ok) throw new Error(`Download failed: ${videoResponse.status}`);
      const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

      const storagePath = `${job.product}/${id}/${translation.language}.mp4`;
      await db.storage.from(VIDEO_STORAGE_BUCKET).upload(storagePath, videoBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

      const { data: publicUrl } = db.storage
        .from(VIDEO_STORAGE_BUCKET)
        .getPublicUrl(storagePath);

      await db
        .from("video_translations")
        .update({
          status: "completed",
          video_url: publicUrl.publicUrl,
          kie_task_id: result.taskId,
        })
        .eq("id", translation.id);

      results.push({ language: translation.language, status: "completed", video_url: publicUrl.publicUrl });

      // Rate limit: 2s delay between generations
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await db
        .from("video_translations")
        .update({ status: "failed", error_message: message })
        .eq("id", translation.id);

      results.push({ language: translation.language, status: "failed" });
    }
  }

  // 3. Check if all translations are done
  const { data: allTranslations } = await db
    .from("video_translations")
    .select("status")
    .eq("video_job_id", id);

  const allDone = (allTranslations || []).every(
    (t: { status: string }) => t.status === "completed" || t.status === "failed"
  );

  if (allDone) {
    await db.from("video_jobs").update({ status: "translated" }).eq("id", id);
  }

  return NextResponse.json({ results });
}
```

**Step 3: Verify TypeScript compiles**

Run: `cd /Users/williamhedin/Claude\ Code/content-hub && npx tsc --noEmit 2>&1 | head -20`

**Step 4: Commit**

```bash
git add src/app/api/video-jobs/\[id\]/create-translations/route.ts src/app/api/video-jobs/\[id\]/generate-translations/route.ts
git commit -m "feat: add video translation creation and generation routes"
```

---

## Task 9: Meta Video Push Module

**Files:**
- Create: `src/lib/meta-video-push.ts`

**Step 1: Create the Meta video push module**

Reference `src/lib/meta-push.ts` for patterns but use video-specific Meta API calls.

```typescript
import { createServerSupabase } from "./supabase";

const META_API_BASE = "https://graph.facebook.com/v22.0";

function getToken(): string {
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) throw new Error("META_SYSTEM_USER_TOKEN is not set");
  return token;
}

function getAdAccountId(): string {
  const id = process.env.META_AD_ACCOUNT_ID;
  if (!id) throw new Error("META_AD_ACCOUNT_ID is not set");
  return id;
}

function getPageId(): string {
  const id = process.env.META_PAGE_ID;
  if (!id) throw new Error("META_PAGE_ID is not set");
  return id;
}

async function metaFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${META_API_BASE}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${getToken()}`,
    },
  });
}

async function metaJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await metaFetch(path, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta API error (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

// Upload video to Meta (returns video_id)
async function uploadVideo(videoUrl: string): Promise<string> {
  const accountId = getAdAccountId();

  // Download video first
  const videoResponse = await fetch(videoUrl);
  if (!videoResponse.ok) throw new Error(`Failed to download video: ${videoResponse.status}`);
  const videoBlob = await videoResponse.blob();

  // Upload as multipart form
  const formData = new FormData();
  formData.append("source", videoBlob, "video.mp4");

  const res = await metaFetch(`/act_${accountId}/advideos`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta video upload failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { id: string };
  return data.id;
}

// Poll until Meta finishes processing the video
async function waitForVideoProcessing(videoId: string, maxWaitMs = 120_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const data = await metaJson<{
      status: { processing_phase: { status: string } };
    }>(`/${videoId}?fields=status`);

    const phase = data.status?.processing_phase?.status;
    if (phase === "complete") return;
    if (phase === "error") throw new Error("Meta video processing failed");

    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("Meta video processing timed out");
}

// Upload thumbnail image and get hash
async function uploadThumbnail(thumbnailUrl: string): Promise<string> {
  const accountId = getAdAccountId();

  const imgResponse = await fetch(thumbnailUrl);
  if (!imgResponse.ok) throw new Error(`Failed to download thumbnail: ${imgResponse.status}`);
  const imgBlob = await imgResponse.blob();

  const formData = new FormData();
  formData.append("filename", imgBlob, "thumbnail.jpg");

  const data = await metaJson<{ images: Record<string, { hash: string }> }>(
    `/act_${accountId}/adimages`,
    { method: "POST", body: formData }
  );

  const hashes = Object.values(data.images);
  if (!hashes.length) throw new Error("No image hash returned from Meta");
  return hashes[0].hash;
}

// Create video ad creative
async function createVideoCreative(opts: {
  videoId: string;
  thumbnailHash: string;
  primaryText: string;
  headline: string;
  linkUrl: string;
}): Promise<string> {
  const accountId = getAdAccountId();
  const pageId = getPageId();

  const data = await metaJson<{ id: string }>(`/act_${accountId}/adcreatives`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `Video creative ${opts.videoId}`,
      object_story_spec: {
        page_id: pageId,
        video_data: {
          video_id: opts.videoId,
          message: opts.primaryText,
          title: opts.headline,
          call_to_action: {
            type: "SHOP_NOW",
            value: { link: opts.linkUrl },
          },
          image_hash: opts.thumbnailHash,
        },
      },
    }),
  });

  return data.id;
}

// Create ad
async function createAd(opts: {
  adSetId: string;
  creativeId: string;
  name: string;
}): Promise<string> {
  const accountId = getAdAccountId();

  const data = await metaJson<{ id: string }>(`/act_${accountId}/ads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: opts.name,
      adset_id: opts.adSetId,
      creative: { creative_id: opts.creativeId },
      status: "PAUSED",
    }),
  });

  return data.id;
}

export interface VideoPushResult {
  language: string;
  adSetId: string;
  adId: string;
  videoId: string;
  creativeId: string;
}

export async function pushVideoToMeta(
  videoJobId: string,
  adSetId: string,
  opts?: { languages?: string[] }
): Promise<VideoPushResult[]> {
  const db = createServerSupabase();

  // Fetch job with translations
  const { data: job, error } = await db
    .from("video_jobs")
    .select("*, video_translations(*), source_videos(*)")
    .eq("id", videoJobId)
    .single();

  if (error || !job) throw new Error("Video job not found");

  // Update status
  await db.from("video_jobs").update({ status: "pushing" }).eq("id", videoJobId);

  const translations = (job.video_translations || []).filter(
    (t: { status: string; video_url: string | null; language: string }) =>
      t.status === "completed" &&
      t.video_url &&
      (!opts?.languages || opts.languages.includes(t.language))
  );

  const results: VideoPushResult[] = [];

  for (const translation of translations) {
    try {
      // 1. Upload video to Meta
      const videoId = await uploadVideo(translation.video_url);

      // 2. Wait for processing
      await waitForVideoProcessing(videoId);

      // 3. Upload thumbnail
      const sourceVideo = job.source_videos?.[0];
      let thumbnailHash = "";
      if (sourceVideo?.thumbnail_url) {
        thumbnailHash = await uploadThumbnail(sourceVideo.thumbnail_url);
      }

      // 4. Create creative
      const primaryText = job.ad_copy_primary?.[0] || job.concept_name;
      const headline = job.ad_copy_headline?.[0] || "";
      const linkUrl = job.landing_page_url || "https://example.com";

      const creativeId = await createVideoCreative({
        videoId,
        thumbnailHash,
        primaryText,
        headline,
        linkUrl,
      });

      // 5. Create ad
      const langMap: Record<string, string> = { sv: "SE", no: "NO", da: "DK", de: "DE" };
      const country = langMap[translation.language] || translation.language.toUpperCase();
      const adName = `${country} #${job.concept_number} | video | ${job.concept_name}`;

      const adId = await createAd({
        adSetId,
        creativeId,
        name: adName,
      });

      // 6. Record in meta_ads
      await db.from("meta_ads").insert({
        ad_id: adId,
        creative_id: creativeId,
        video_translation_id: translation.id,
        adset_id: adSetId,
        status: "active",
        name: adName,
      });

      results.push({
        language: translation.language,
        adSetId,
        adId,
        videoId,
        creativeId,
      });

      // Rate limit
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`Failed to push ${translation.language} video to Meta:`, err);
    }
  }

  // Update job status
  await db
    .from("video_jobs")
    .update({ status: results.length > 0 ? "live" : "translated" })
    .eq("id", videoJobId);

  return results;
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /Users/williamhedin/Claude\ Code/content-hub && npx tsc --noEmit 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/lib/meta-video-push.ts
git commit -m "feat: add Meta video push module (upload, creative, ad creation)"
```

---

## Task 10: Meta Video Push API Route

**Files:**
- Create: `src/app/api/video-jobs/[id]/push-to-meta/route.ts`

**Step 1: Create the push route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { pushVideoToMeta } from "@/lib/meta-video-push";
import { safeError } from "@/lib/api-error";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  try {
    const body = await req.json();
    const { ad_set_id, languages } = body;

    if (!ad_set_id) {
      return NextResponse.json({ error: "ad_set_id is required" }, { status: 400 });
    }

    const results = await pushVideoToMeta(id, ad_set_id, { languages });

    return NextResponse.json({ results, pushed: results.length });
  } catch (err) {
    return safeError(err, "Failed to push video to Meta");
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/video-jobs/\[id\]/push-to-meta/route.ts
git commit -m "feat: add Meta video push API route"
```

---

## Task 11: Sidebar Update

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1: Add Video Ads entry to Ads group**

Find the `children` array inside the "Ads" group (around line 45) and add Video Ads after Concepts:

```typescript
// Find:
{ href: "/images", label: "Concepts", icon: Image },

// Add after:
{ href: "/video-ads", label: "Video Ads", icon: Video },
```

Also add the `Video` import at the top with the other lucide-react imports:

```typescript
import { Video } from "lucide-react";
```

**Step 2: Verify it renders**

Run: `cd /Users/williamhedin/Claude\ Code/content-hub && npx tsc --noEmit 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: add Video Ads to sidebar navigation"
```

---

## Task 12: Video Ads List Page

**Files:**
- Create: `src/app/(dashboard)/video-ads/page.tsx`

**Step 1: Create the list page**

This is a server component that fetches video jobs and renders them as a card grid. Follow the same pattern as the existing `/images` (Ad Concepts) page.

```typescript
import { createServerSupabase } from "@/lib/supabase";
import { VideoJob } from "@/types";
import Link from "next/link";
import { VIDEO_FORMATS, HOOK_TYPES } from "@/lib/constants";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    generating: "bg-yellow-100 text-yellow-700",
    generated: "bg-blue-100 text-blue-700",
    translating: "bg-purple-100 text-purple-700",
    translated: "bg-green-100 text-green-700",
    pushing: "bg-orange-100 text-orange-700",
    live: "bg-emerald-100 text-emerald-700",
    killed: "bg-red-100 text-red-700",
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[status] || "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}

function ProductBadge({ product }: { product: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
      {product}
    </span>
  );
}

export default async function VideoAdsPage() {
  const db = createServerSupabase();

  const { data: jobs, error } = await db
    .from("video_jobs")
    .select("*, source_videos(*), video_translations(*)")
    .order("created_at", { ascending: false });

  if (error) {
    return <div className="p-6 text-red-500">Error loading video jobs: {error.message}</div>;
  }

  const videoJobs = (jobs || []) as VideoJob[];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Video Ads</h1>
          <p className="text-sm text-gray-500 mt-1">
            AI UGC video concepts generated with Sora 2 Pro
          </p>
        </div>
        <Link
          href="/brainstorm"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
        >
          + New Video Concept
        </Link>
      </div>

      {videoJobs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No video concepts yet</p>
          <p className="text-sm mt-2">
            Go to Brainstorm and select &quot;Video UGC&quot; mode to create your first video concept.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {videoJobs.map((job) => {
            const sourceVideo = job.source_videos?.find((sv) => sv.status === "completed");
            const formatLabel = VIDEO_FORMATS.find((f) => f.id === job.format_type)?.label || job.format_type;
            const hookLabel = HOOK_TYPES.find((h) => h.id === job.hook_type)?.label || job.hook_type;
            const completedTranslations = (job.video_translations || []).filter((t) => t.status === "completed").length;
            const totalTranslations = (job.video_translations || []).length;

            return (
              <Link
                key={job.id}
                href={`/video-ads/${job.id}`}
                className="block bg-white border rounded-lg overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Thumbnail or placeholder */}
                <div className="aspect-[9/16] max-h-48 bg-gray-100 flex items-center justify-center overflow-hidden">
                  {sourceVideo?.thumbnail_url || sourceVideo?.video_url ? (
                    <video
                      src={sourceVideo.video_url || ""}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <span className="text-gray-400 text-sm">No video yet</span>
                  )}
                </div>

                <div className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <ProductBadge product={job.product} />
                    <StatusBadge status={job.status} />
                  </div>

                  <h3 className="font-semibold text-sm">
                    #{job.concept_number} {job.concept_name}
                  </h3>

                  <div className="flex flex-wrap gap-1">
                    {formatLabel && (
                      <span className="px-1.5 py-0.5 bg-gray-50 text-gray-600 rounded text-xs">
                        {formatLabel}
                      </span>
                    )}
                    {hookLabel && (
                      <span className="px-1.5 py-0.5 bg-gray-50 text-gray-600 rounded text-xs">
                        {hookLabel}
                      </span>
                    )}
                  </div>

                  {totalTranslations > 0 && (
                    <div className="text-xs text-gray-500">
                      Translations: {completedTranslations}/{totalTranslations}
                    </div>
                  )}

                  <div className="text-xs text-gray-400">
                    {new Date(job.created_at).toLocaleDateString()}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify it renders**

Run: `cd /Users/williamhedin/Claude\ Code/content-hub && npx tsc --noEmit 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/app/\(dashboard\)/video-ads/page.tsx
git commit -m "feat: add Video Ads list page"
```

---

## Task 13: Video Ads Detail Page

**Files:**
- Create: `src/app/(dashboard)/video-ads/[id]/page.tsx`
- Create: `src/components/video-ads/VideoJobDetail.tsx`

**Step 1: Create the server page component**

`src/app/(dashboard)/video-ads/[id]/page.tsx`:

```typescript
import { createServerSupabase } from "@/lib/supabase";
import { VideoJob } from "@/types";
import { notFound } from "next/navigation";
import VideoJobDetail from "@/components/video-ads/VideoJobDetail";

export default async function VideoJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = createServerSupabase();

  const { data: job, error } = await db
    .from("video_jobs")
    .select("*, source_videos(*), video_translations(*)")
    .eq("id", id)
    .single();

  if (error || !job) return notFound();

  return <VideoJobDetail initialJob={job as VideoJob} />;
}
```

**Step 2: Create the client detail component**

`src/components/video-ads/VideoJobDetail.tsx`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { VideoJob } from "@/types";
import { VIDEO_FORMATS, HOOK_TYPES, SCRIPT_STRUCTURES } from "@/lib/constants";
import Link from "next/link";

interface Props {
  initialJob: VideoJob;
}

export default function VideoJobDetail({ initialJob }: Props) {
  const [job, setJob] = useState<VideoJob>(initialJob);
  const [generating, setGenerating] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll for updates when generating
  const isGenerating = job.status === "generating" || job.status === "translating";

  const refreshJob = useCallback(async () => {
    const res = await fetch(`/api/video-jobs/${job.id}`);
    if (res.ok) {
      const data = await res.json();
      setJob(data);
    }
  }, [job.id]);

  useEffect(() => {
    if (!isGenerating) return;
    const interval = setInterval(refreshJob, 3000);
    return () => clearInterval(interval);
  }, [isGenerating, refreshJob]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/video-jobs/${job.id}/generate`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Generation failed");
      }
      await refreshJob();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCreateTranslations() {
    setTranslating(true);
    setError(null);
    try {
      // Create translations (Claude translates scripts)
      const createRes = await fetch(`/api/video-jobs/${job.id}/create-translations`, { method: "POST" });
      if (!createRes.ok) throw new Error("Failed to create translations");

      // Generate translated videos
      const genRes = await fetch(`/api/video-jobs/${job.id}/generate-translations`, { method: "POST" });
      if (!genRes.ok) throw new Error("Failed to generate translations");

      await refreshJob();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Translation failed");
    } finally {
      setTranslating(false);
    }
  }

  const sourceVideo = job.source_videos?.find((sv) => sv.status === "completed");
  const formatLabel = VIDEO_FORMATS.find((f) => f.id === job.format_type)?.label || job.format_type;
  const hookLabel = HOOK_TYPES.find((h) => h.id === job.hook_type)?.label || job.hook_type;
  const structureLabel = SCRIPT_STRUCTURES.find((s) => s.id === job.script_structure)?.label || job.script_structure;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/video-ads" className="text-sm text-gray-500 hover:text-gray-700">
            &larr; Back to Video Ads
          </Link>
          <h1 className="text-2xl font-bold mt-1">
            #{job.concept_number} {job.concept_name}
          </h1>
          <div className="flex gap-2 mt-2">
            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
              {job.product}
            </span>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
              {job.status}
            </span>
            {formatLabel && (
              <span className="px-2 py-0.5 bg-gray-50 text-gray-600 rounded text-xs">
                {formatLabel}
              </span>
            )}
            {hookLabel && (
              <span className="px-2 py-0.5 bg-gray-50 text-gray-600 rounded text-xs">
                {hookLabel}
              </span>
            )}
            {structureLabel && (
              <span className="px-2 py-0.5 bg-gray-50 text-gray-600 rounded text-xs">
                {structureLabel}
              </span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Script & Prompt */}
        <div className="space-y-4">
          <div className="bg-white border rounded-lg p-4">
            <h2 className="font-semibold mb-3">Script</h2>
            <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono bg-gray-50 p-3 rounded max-h-96 overflow-y-auto">
              {job.script || "No script yet"}
            </pre>
          </div>

          <div className="bg-white border rounded-lg p-4">
            <button
              onClick={() => setShowPrompt(!showPrompt)}
              className="font-semibold text-sm flex items-center gap-1 hover:text-indigo-600"
            >
              {showPrompt ? "▼" : "▶"} Sora 2 Prompt
            </button>
            {showPrompt && (
              <pre className="whitespace-pre-wrap text-xs text-gray-600 font-mono bg-gray-50 p-3 rounded mt-2 max-h-96 overflow-y-auto">
                {job.sora_prompt || "No prompt yet"}
              </pre>
            )}
          </div>

          {job.character_description && (
            <div className="bg-white border rounded-lg p-4">
              <h2 className="font-semibold text-sm mb-2">Character</h2>
              <p className="text-sm text-gray-600">{job.character_description}</p>
              {job.character_tag && (
                <p className="text-xs text-indigo-600 mt-1">Tag: {job.character_tag}</p>
              )}
            </div>
          )}
        </div>

        {/* Right: Video Preview */}
        <div className="space-y-4">
          <div className="bg-white border rounded-lg p-4">
            <h2 className="font-semibold mb-3">Video Preview</h2>

            {sourceVideo?.video_url ? (
              <video
                src={sourceVideo.video_url}
                controls
                className="w-full max-w-sm mx-auto rounded"
                playsInline
              />
            ) : (
              <div className="aspect-[9/16] max-w-sm mx-auto bg-gray-100 rounded flex items-center justify-center">
                <span className="text-gray-400 text-sm">
                  {job.status === "generating" ? "Generating..." : "No video yet"}
                </span>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              {(job.status === "draft" || job.status === "generated") && (
                <button
                  onClick={handleGenerate}
                  disabled={generating || job.status === "generating"}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
                >
                  {generating ? "Generating..." : job.status === "generated" ? "Regenerate" : "Generate Video"}
                </button>
              )}

              {job.status === "generated" && job.target_languages.length > 0 && (
                <button
                  onClick={handleCreateTranslations}
                  disabled={translating}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
                >
                  {translating ? "Translating..." : "Generate Translations"}
                </button>
              )}
            </div>
          </div>

          {/* Translations */}
          {(job.video_translations || []).length > 0 && (
            <div className="bg-white border rounded-lg p-4">
              <h2 className="font-semibold mb-3">Translations</h2>
              <div className="space-y-3">
                {(job.video_translations || []).map((t) => {
                  const langName: Record<string, string> = { sv: "Swedish", no: "Norwegian", da: "Danish", de: "German" };
                  return (
                    <div key={t.id} className="border rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">
                          {langName[t.language] || t.language}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          t.status === "completed" ? "bg-green-100 text-green-700" :
                          t.status === "failed" ? "bg-red-100 text-red-700" :
                          t.status === "generating" ? "bg-yellow-100 text-yellow-700" :
                          "bg-gray-100 text-gray-700"
                        }`}>
                          {t.status}
                        </span>
                      </div>

                      {t.video_url && (
                        <video
                          src={t.video_url}
                          controls
                          className="w-full max-w-xs rounded"
                          playsInline
                        />
                      )}

                      {t.translated_script && (
                        <details className="mt-2">
                          <summary className="text-xs text-gray-500 cursor-pointer">
                            Translated script
                          </summary>
                          <pre className="whitespace-pre-wrap text-xs text-gray-600 mt-1 bg-gray-50 p-2 rounded">
                            {t.translated_script}
                          </pre>
                        </details>
                      )}

                      {t.error_message && (
                        <p className="text-xs text-red-500 mt-1">{t.error_message}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Verify TypeScript compiles**

Run: `cd /Users/williamhedin/Claude\ Code/content-hub && npx tsc --noEmit 2>&1 | head -20`

**Step 4: Commit**

```bash
git add src/app/\(dashboard\)/video-ads/\[id\]/page.tsx src/components/video-ads/VideoJobDetail.tsx
git commit -m "feat: add Video Ads detail page with generation and translation UI"
```

---

## Task 14: Brainstorm UI — Add Video UGC Mode

**Files:**
- Modify: The brainstorm page component (likely `src/app/(dashboard)/brainstorm/page.tsx` or a client component it renders)

**Step 1: Find the brainstorm page and mode selector**

Search for where `BrainstormMode` or the mode options are rendered in the brainstorm page UI.

Run: `grep -rn "from_scratch\|BrainstormMode\|mode.*selector" src/app/\(dashboard\)/brainstorm/ src/components/brainstorm/ --include="*.tsx" | head -20`

**Step 2: Add `video_ugc` to the mode options**

In the mode selector component, add the Video UGC option. The exact location depends on Step 1's findings. Add alongside existing modes:

```typescript
{ value: "video_ugc", label: "Video UGC", description: "AI-generated UGC video concepts for Sora 2 Pro" }
```

**Step 3: Handle video_ugc response in brainstorm results**

The brainstorm results component needs to handle the `type: "video_ugc"` response differently. When `step === "done"` and `type === "video_ugc"`:
- Render proposals as video concept cards (show script preview, format/hook pills)
- "Approve" button calls `POST /api/video-jobs` to create the job
- Redirect to `/video-ads/[id]` after approval

Add an approval handler:

```typescript
async function handleApproveVideo(proposal: VideoConceptProposal) {
  const res = await fetch("/api/video-jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      product,
      concept_name: proposal.concept_name,
      hook_type: proposal.hook_type,
      script_structure: proposal.script_structure,
      format_type: proposal.format_type,
      script: proposal.script,
      sora_prompt: proposal.sora_prompt,
      character_description: proposal.character_description,
      duration_seconds: 12,
      target_languages: ["sv", "no", "da"],
      awareness_level: proposal.awareness_level,
      delivery_style: proposal.delivery_style,
      ad_copy_primary: proposal.ad_copy_primary,
      ad_copy_headline: proposal.ad_copy_headline,
    }),
  });

  if (res.ok) {
    const job = await res.json();
    router.push(`/video-ads/${job.id}`);
  }
}
```

**Step 4: Verify and commit**

Run: `cd /Users/williamhedin/Claude\ Code/content-hub && npx tsc --noEmit 2>&1 | head -20`

```bash
git add src/app/\(dashboard\)/brainstorm/ src/components/brainstorm/
git commit -m "feat: add Video UGC mode to brainstorm page UI"
```

---

## Task 15: End-to-End Smoke Test

**Step 1: Start dev server**

```bash
cd /Users/williamhedin/Claude\ Code/content-hub && npm run dev
```

**Step 2: Verify pages load**

- Navigate to `/video-ads` — should show empty state with "No video concepts yet"
- Navigate to `/brainstorm` — should show "Video UGC" as a mode option
- Sidebar should show "Video Ads" under the Ads group

**Step 3: Test the brainstorm flow**

1. Select product (happysleep)
2. Select "Video UGC" mode
3. Click generate
4. Verify 3 proposals appear with script + Sora prompt
5. Approve one → should redirect to `/video-ads/[id]`

**Step 4: Test generation (requires Kie.ai credits)**

1. On the detail page, click "Generate Video"
2. Verify polling updates status
3. Verify video appears when complete

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: smoke test fixes for video UGC pipeline"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Database schema | DDL via Supabase API |
| 2 | TypeScript types | `src/types/index.ts`, `src/lib/constants.ts` |
| 3 | Kie.ai video client | `src/lib/kie.ts` |
| 4 | Video brainstorm prompts | `src/lib/video-brainstorm.ts` |
| 5 | Brainstorm API route | `src/app/api/brainstorm/route.ts`, `src/lib/brainstorm.ts` |
| 6 | Video jobs CRUD | `src/app/api/video-jobs/route.ts`, `[id]/route.ts` |
| 7 | Video generation route | `src/app/api/video-jobs/[id]/generate/route.ts` |
| 8 | Translation routes | `create-translations/route.ts`, `generate-translations/route.ts` |
| 9 | Meta video push module | `src/lib/meta-video-push.ts` |
| 10 | Meta push route | `src/app/api/video-jobs/[id]/push-to-meta/route.ts` |
| 11 | Sidebar | `src/components/layout/Sidebar.tsx` |
| 12 | List page | `src/app/(dashboard)/video-ads/page.tsx` |
| 13 | Detail page | `src/app/(dashboard)/video-ads/[id]/page.tsx`, `VideoJobDetail.tsx` |
| 14 | Brainstorm UI | Brainstorm page components |
| 15 | Smoke test | Manual E2E verification |
