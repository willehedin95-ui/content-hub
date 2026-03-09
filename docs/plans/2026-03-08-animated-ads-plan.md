# Animated Ads Pipeline — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an automated animated ad pipeline that generates NanoBananaPro images, Kling 3.0 video transitions, ElevenLabs voiceovers, and Suno music — all orchestrated from the Content Hub.

**Architecture:** New brainstorm mode (`animated_ad`) feeds into a phased pipeline (prompts → images → videos → audio) with parallel generation within each phase and human review gates between phases. Data stored in 4 new Supabase tables. UI at `/video-ads/animated/[id]`.

**Tech Stack:** Next.js 15, Supabase (DDL via Management API), Kie AI (NanoBananaPro + Kling 3.0 + Suno V5), ElevenLabs API, Claude Sonnet 4.5, Tailwind CSS.

---

## Task 1: Database Schema

**Files:**
- No files — run DDL via Supabase Management API

**Step 1: Create the 4 tables**

Run this SQL via the Supabase Management API (`curl -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query"` with `Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4`):

```sql
-- Animated Ads: main job table
CREATE TABLE animated_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product text NOT NULL CHECK (product IN ('happysleep', 'hydro13')),
  concept_name text NOT NULL,
  style text NOT NULL CHECK (style IN ('apple_realistic', 'pixar')),
  status text NOT NULL DEFAULT 'prompts_ready'
    CHECK (status IN ('prompts_ready', 'generating_images', 'images_ready', 'generating_videos', 'videos_ready', 'generating_audio', 'complete', 'error')),
  target_duration_seconds int NOT NULL DEFAULT 60,
  image_prompt_count int NOT NULL DEFAULT 18,
  brainstorm_session_id uuid,
  voiceover_script text,
  voiceover_style text,
  music_style text,
  ad_copy_primary text,
  ad_copy_headline text,
  estimated_cost_usd numeric(8, 4) DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Animated Ad Frames: one row per NanoBananaPro image
CREATE TABLE animated_ad_frames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animated_ad_id uuid NOT NULL REFERENCES animated_ads(id) ON DELETE CASCADE,
  frame_number int NOT NULL,
  role text NOT NULL DEFAULT 'body' CHECK (role IN ('hook', 'body', 'payoff', 'end_frame')),
  prompt text NOT NULL,
  image_url text,
  image_kie_task_id text,
  image_status text NOT NULL DEFAULT 'pending'
    CHECK (image_status IN ('pending', 'generating', 'completed', 'failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (animated_ad_id, frame_number)
);

-- Animated Ad Clips: one row per Kling 3.0 video transition
CREATE TABLE animated_ad_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animated_ad_id uuid NOT NULL REFERENCES animated_ads(id) ON DELETE CASCADE,
  clip_number int NOT NULL,
  start_frame_number int NOT NULL,
  end_frame_number int NOT NULL,
  animation_prompt text NOT NULL,
  video_url text,
  video_kie_task_id text,
  video_status text NOT NULL DEFAULT 'pending'
    CHECK (video_status IN ('pending', 'generating', 'completed', 'failed')),
  duration_seconds int NOT NULL DEFAULT 5,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (animated_ad_id, clip_number)
);

-- Animated Ad Audio: voiceover + music
CREATE TABLE animated_ad_audio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animated_ad_id uuid NOT NULL REFERENCES animated_ads(id) ON DELETE CASCADE,
  audio_type text NOT NULL CHECK (audio_type IN ('voiceover', 'music')),
  audio_url text,
  task_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
  duration_seconds int,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (animated_ad_id, audio_type)
);

-- Enable RLS
ALTER TABLE animated_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE animated_ad_frames ENABLE ROW LEVEL SECURITY;
ALTER TABLE animated_ad_clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE animated_ad_audio ENABLE ROW LEVEL SECURITY;

-- Permissive policies (same pattern as other tables — auth users can do everything)
CREATE POLICY "auth_all" ON animated_ads FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON animated_ad_frames FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON animated_ad_clips FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON animated_ad_audio FOR ALL USING (auth.role() = 'authenticated');

-- Updated_at trigger for animated_ads
CREATE TRIGGER set_updated_at BEFORE UPDATE ON animated_ads
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
```

**Step 2: Create Supabase Storage bucket**

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('animated-ads', 'animated-ads', true)
  ON CONFLICT (id) DO NOTHING;
```

**Step 3: Verify tables exist**

Query `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'animated_ad%';` — expect 4 rows.

**Step 4: Commit** — no file changes, but note schema is applied.

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/types/index.ts` (append after line ~1169)

**Step 1: Add animated ad types**

Add after the `PixarAnimationProposal` interface (end of file):

```typescript
// --- Animated Ads (Franky-style animated ad pipeline) ---

export type AnimatedAdStyle = "apple_realistic" | "pixar";

export type AnimatedAdStatus =
  | "prompts_ready"
  | "generating_images"
  | "images_ready"
  | "generating_videos"
  | "videos_ready"
  | "generating_audio"
  | "complete"
  | "error";

export type AnimatedAdFrameStatus = "pending" | "generating" | "completed" | "failed";
export type AnimatedAdClipStatus = "pending" | "generating" | "completed" | "failed";
export type AnimatedAdAudioStatus = "pending" | "generating" | "completed" | "failed";
export type AnimatedAdFrameRole = "hook" | "body" | "payoff" | "end_frame";

export interface AnimatedAd {
  id: string;
  product: Product;
  concept_name: string;
  style: AnimatedAdStyle;
  status: AnimatedAdStatus;
  target_duration_seconds: number;
  image_prompt_count: number;
  brainstorm_session_id: string | null;
  voiceover_script: string | null;
  voiceover_style: string | null;
  music_style: string | null;
  ad_copy_primary: string | null;
  ad_copy_headline: string | null;
  estimated_cost_usd: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  // Joined relations
  frames?: AnimatedAdFrame[];
  clips?: AnimatedAdClip[];
  audio?: AnimatedAdAudio[];
}

export interface AnimatedAdFrame {
  id: string;
  animated_ad_id: string;
  frame_number: number;
  role: AnimatedAdFrameRole;
  prompt: string;
  image_url: string | null;
  image_kie_task_id: string | null;
  image_status: AnimatedAdFrameStatus;
  error_message: string | null;
  created_at: string;
}

export interface AnimatedAdClip {
  id: string;
  animated_ad_id: string;
  clip_number: number;
  start_frame_number: number;
  end_frame_number: number;
  animation_prompt: string;
  video_url: string | null;
  video_kie_task_id: string | null;
  video_status: AnimatedAdClipStatus;
  duration_seconds: number;
  error_message: string | null;
  created_at: string;
}

export interface AnimatedAdAudio {
  id: string;
  animated_ad_id: string;
  audio_type: "voiceover" | "music";
  audio_url: string | null;
  task_id: string | null;
  status: AnimatedAdAudioStatus;
  duration_seconds: number | null;
  error_message: string | null;
  created_at: string;
}

export interface AnimatedAdProposal {
  concept_name: string;
  style: AnimatedAdStyle;
  frame_count: number;
  frames: {
    frame_number: number;
    role: AnimatedAdFrameRole;
    nano_banana_prompt: string;
  }[];
  voiceover_script: string;
  voiceover_style: string;
  music_style: string;
  ad_copy_primary: string;
  ad_copy_headline: string;
}
```

Also add `"animated_ad"` to the `BrainstormMode` type. Find the existing type (likely a union) and extend it.

**Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add animated ad types"
```

---

## Task 3: Animation Prompt Templates + Pricing Constants

**Files:**
- Create: `src/lib/animated-ad-prompts.ts`
- Modify: `src/lib/constants.ts` (add animated ad constants)
- Modify: `src/lib/pricing.ts` (add animated ad cost constants)

**Step 1: Create animation prompt templates**

Create `src/lib/animated-ad-prompts.ts`:

```typescript
import type { AnimatedAdStyle } from "@/types";

// Kling 3.0 animation prompts per style (used when creating video clips)
export const ANIMATION_PROMPTS: Record<AnimatedAdStyle, string> = {
  apple_realistic:
    "Seamless Apple-style cinematic transition. Minimal studio environment. Soft natural lighting. Clean, neutral tones. Ultra-clean. Minimal. Engineered. Apple keynote energy. Sound effects (no talking)",
  pixar:
    "Create a seamless Pixar animated transition between the first shot and the second shot in a Pixar animation style with sound effects (no talking)",
};

// Kling 3.0 generation defaults
export const KLING_DEFAULTS = {
  duration: 5 as const, // 5s clips — cheaper, speed-mapped 2.5x in CapCut
  mode: "std" as const, // Standard quality (Pro is 1.35x cost)
  sound: true,
  aspectRatio: "9:16",
} as const;

// NanoBananaPro defaults for animated ads
export const ANIMATED_IMAGE_DEFAULTS = {
  model: "nano-banana-pro" as const,
  resolution: "2K" as const,
  aspectRatio: "9:16" as const,
  outputFormat: "png" as const,
} as const;

// Style metadata for UI
export const ANIMATED_AD_STYLES = [
  {
    id: "apple_realistic" as const,
    label: "Apple Realistic",
    description: "Minimal studio, soft lighting, clean neutral tones, Apple keynote energy",
    voiceDefault: "Professional, warm, confident narrator. Clean and minimal delivery. Think Apple keynote presenter — articulate, measured, authoritative but approachable.",
    musicDefault: "Minimal electronic, soft piano, clean production, subtle build. Think Apple product launch — elegant, restrained, modern.",
  },
  {
    id: "pixar" as const,
    label: "Pixar",
    description: "3D animated, whimsical, character-driven, colorful",
    voiceDefault: "Warm, whimsical narrator voice. Think Pixar opening monologue — playful but knowledgeable. European sophistication with childlike wonder.",
    musicDefault: "Whimsical orchestral, light pizzicato strings, gentle xylophone, European sophistication with childlike wonder. Think Pixar short film opening.",
  },
] as const;
```

**Step 2: Add constants to `src/lib/constants.ts`**

Append to `src/lib/constants.ts`:

```typescript
// --- Animated Ads Constants ---
export const KIE_PRO_IMAGE_MODEL = "nano-banana-pro";
export const ANIMATED_ADS_STORAGE_BUCKET = "animated-ads";
```

**Step 3: Add pricing to `src/lib/pricing.ts`**

Append to `src/lib/pricing.ts`:

```typescript
// Animated ads pricing (per unit)
export const KIE_PRO_IMAGE_COST = 0.09; // NanoBananaPro at 2K ($0.09 per image)
export const KIE_KLING_STD_5S_COST = 0.50; // Kling 3.0 standard, 5s, no audio
export const KIE_KLING_STD_8S_COST = 0.80; // Kling 3.0 standard, 8s, no audio
export const KIE_SUNO_COST = 0.06; // Suno V5 per generation
export const ELEVENLABS_VOICEOVER_COST = 0.17; // ~60s voiceover on Starter plan
```

**Step 4: Commit**

```bash
git add src/lib/animated-ad-prompts.ts src/lib/constants.ts src/lib/pricing.ts
git commit -m "feat: add animated ad prompt templates and pricing constants"
```

---

## Task 4: Extend Kie API — Suno + NanoBananaPro model param

**Files:**
- Modify: `src/lib/kie.ts`

**Step 1: Add model parameter to `createImageTask`**

Change `createImageTask` signature to accept an optional `model` parameter. Currently it uses `KIE_MODEL` (nano-banana-2) from constants. We need it to optionally use `nano-banana-pro`:

In `src/lib/kie.ts`, change the `createImageTask` function:

```typescript
export async function createImageTask(
  prompt: string,
  imageUrls: string[],
  aspectRatio: string = "2:3",
  resolution: string = "1K",
  model?: string // NEW: optional model override
): Promise<string> {
```

And in the body, replace `model: KIE_MODEL` with `model: model ?? KIE_MODEL`.

**Step 2: Add Suno V5 integration**

Append to `src/lib/kie.ts`:

```typescript
// --- Suno V5 (Music Generation via Kie) ---

const SUNO_API_BASE = "https://api.kie.ai/api/v1";

export interface SunoParams {
  prompt: string; // Lyrics or description (max 5000 chars for V5)
  style: string; // Music style tags (max 1000 chars)
  title: string; // Song title (max 80 chars)
  instrumental?: boolean; // No vocals if true
}

export async function createSunoTask(params: SunoParams): Promise<string> {
  const { prompt, style, title, instrumental = true } = params;

  return withRetry(
    async () => {
      const res = await fetch(`${SUNO_API_BASE}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify({
          prompt,
          customMode: true,
          instrumental,
          model: "V5",
          style,
          title,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Kie.ai Suno createTask failed (${res.status}): ${text}`);
      }

      const data = await res.json();
      if (data.code !== 200) {
        throw new Error(`Kie.ai Suno createTask error: ${data.msg}`);
      }

      return data.data.taskId;
    },
    { maxAttempts: 3, initialDelayMs: 2000, isRetryable: isTransientError }
  );
}

export async function pollSunoResult(taskId: string): Promise<{
  audioUrl: string;
  duration: number | null;
}> {
  const startTime = Date.now();
  let pollInterval = POLL_INITIAL_MS;

  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    const res = await fetch(
      `${SUNO_API_BASE}/generate/record-info?taskId=${taskId}`,
      { headers: { Authorization: `Bearer ${getApiKey()}` } }
    );

    if (!res.ok) {
      throw new Error(`Kie.ai Suno poll failed (${res.status})`);
    }

    const data = await res.json();

    // Suno uses callbackType: "complete" when done
    if (data.data?.status === "complete" || data.data?.state === "success") {
      const tracks = data.data?.data || data.data?.response;
      if (Array.isArray(tracks) && tracks.length > 0) {
        return {
          audioUrl: tracks[0].audio_url,
          duration: tracks[0].duration ?? null,
        };
      }
      // Try parsing resultJson like market models
      if (data.data?.resultJson) {
        const result = JSON.parse(data.data.resultJson);
        if (result.data?.[0]?.audio_url) {
          return {
            audioUrl: result.data[0].audio_url,
            duration: result.data[0].duration ?? null,
          };
        }
      }
      throw new Error("Suno task completed but no audio URL found in response");
    }

    if (data.data?.state === "fail" || data.data?.status === "failed") {
      throw new Error(`Kie.ai Suno task failed: ${data.data?.failMsg || data.data?.errorMessage || "Unknown error"}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    pollInterval = Math.min(pollInterval * 2, POLL_MAX_MS);
  }

  throw new Error("Kie.ai Suno task timed out after 5 minutes");
}
```

**Step 3: Commit**

```bash
git add src/lib/kie.ts
git commit -m "feat: add Suno V5 integration and model param to createImageTask"
```

---

## Task 5: ElevenLabs Integration

**Files:**
- Create: `src/lib/elevenlabs.ts`

**Step 1: Install no SDK — use raw fetch (keeps it simple)**

No npm install needed. We use the REST API directly, matching the project's pattern for Kie.

**Step 2: Create `src/lib/elevenlabs.ts`**

```typescript
import { withRetry, isTransientError } from "./retry";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  return key;
}

/**
 * Design a custom voice from a text description.
 * Returns a voice ID that can be used for text-to-speech.
 */
export async function designVoice(
  styleDescription: string,
  previewText: string = "This is a preview of the voice."
): Promise<{ voiceId: string }> {
  return withRetry(
    async () => {
      // Generate voice previews
      const res = await fetch(`${ELEVENLABS_API_BASE}/text-to-voice/create-previews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": getApiKey(),
        },
        body: JSON.stringify({
          voice_description: styleDescription,
          text: previewText,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`ElevenLabs voice design failed (${res.status}): ${text}`);
      }

      const data = await res.json();
      const previews = data.previews;
      if (!previews?.length) {
        throw new Error("ElevenLabs returned no voice previews");
      }

      // Save the first preview as a permanent voice
      const saveRes = await fetch(
        `${ELEVENLABS_API_BASE}/text-to-voice/create-voice-from-preview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": getApiKey(),
          },
          body: JSON.stringify({
            voice_name: `animated-ad-${Date.now()}`,
            voice_description: styleDescription,
            generated_voice_id: previews[0].generated_voice_id,
          }),
        }
      );

      if (!saveRes.ok) {
        const text = await saveRes.text();
        throw new Error(`ElevenLabs save voice failed (${saveRes.status}): ${text}`);
      }

      const savedVoice = await saveRes.json();
      return { voiceId: savedVoice.voice_id };
    },
    { maxAttempts: 2, initialDelayMs: 2000, isRetryable: isTransientError }
  );
}

/**
 * Generate speech from text using a voice ID.
 * Returns the audio as a Buffer (MP3).
 */
export async function generateSpeech(
  voiceId: string,
  text: string
): Promise<Buffer> {
  return withRetry(
    async () => {
      const res = await fetch(
        `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": getApiKey(),
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.5,
              use_speaker_boost: true,
            },
          }),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`ElevenLabs TTS failed (${res.status}): ${text}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    },
    { maxAttempts: 2, initialDelayMs: 2000, isRetryable: isTransientError }
  );
}

/**
 * Delete a voice from the library (cleanup after use).
 */
export async function deleteVoice(voiceId: string): Promise<void> {
  await fetch(`${ELEVENLABS_API_BASE}/voices/${voiceId}`, {
    method: "DELETE",
    headers: { "xi-api-key": getApiKey() },
  });
}
```

**Step 3: Commit**

```bash
git add src/lib/elevenlabs.ts
git commit -m "feat: add ElevenLabs API integration for voice design + TTS"
```

---

## Task 6: Brainstorm Mode — `animated_ad`

**Files:**
- Create: `src/lib/animated-ad-brainstorm.ts`
- Modify: `src/lib/brainstorm.ts` (add mode to BRAINSTORM_MODES + mode map)
- Modify: `src/app/api/brainstorm/route.ts` (add animated_ad handler)
- Modify: `src/types/index.ts` (add to BrainstormMode union if needed)

**Step 1: Create `src/lib/animated-ad-brainstorm.ts`**

```typescript
// Animated Ad brainstorm prompt builders
// Generates NanoBananaPro image prompt sequences for Kling 3.0 animation

import type { AnimatedAdStyle } from "@/types";

const STYLE_INSTRUCTIONS: Record<AnimatedAdStyle, string> = {
  apple_realistic: `## STYLE: Apple Realistic
- Minimal studio environment with soft natural lighting
- Clean, neutral tones — white, cream, warm gray
- Product-focused with elegant negative space
- Ultra-clean compositions, precision-engineered feel
- Think Apple keynote product reveals
- Each frame should feel like a premium product photography shoot
- Smooth transitions between scenes — the viewer should feel the "flow"
- Include the product naturally in scenes (not forced)`,

  pixar: `## STYLE: Pixar Animation
- Full Pixar 3D animation style with rich colors and warm lighting
- Characters/objects should feel alive and expressive
- Whimsical, playful environments with depth and detail
- Strong visual storytelling — each frame tells part of the story
- Think Pixar short films: beautiful, emotional, surprising
- Include tiny details that reward close viewing
- Product can be anthropomorphized or integrated as a character
- Warm color palette with dramatic lighting moments`,
};

export function buildAnimatedAdSystemPrompt(
  product: string,
  productBrief: string,
  guidelines: string,
  learningsContext: string,
  style: AnimatedAdStyle
): string {
  return `You are a creative director specializing in premium animated video ads.

## YOUR TASK
Generate a sequence of NanoBananaPro image prompts that will be animated into a 60-second video ad using Kling 3.0. The images will be generated, then pairs of consecutive images will be animated into seamless transitions.

## HOW IT WORKS
1. You produce 18 image prompts (P1 through P18)
2. Each image is generated via NanoBananaPro (AI image generator)
3. Consecutive pairs become video transitions: P1→P2 = V1, P2→P3 = V2, etc. (9 video clips total)
4. Clips are speed-mapped 2-2.5x and stitched in CapCut with mix transitions
5. A voiceover and custom music track are layered on top

## CRITICAL: IMAGE PAIR CONTINUITY
Since consecutive images are animated INTO each other, they MUST share visual continuity:
- P1 and P2 should have related composition (camera slowly pulling back, or subject transforming)
- Colors and lighting should transition naturally between consecutive frames
- Avoid jarring jumps — think of each pair as "before and after" within one smooth camera movement
- The END state of one frame should be visually compatible with the START state of the next

${STYLE_INSTRUCTIONS[style]}

## NARRATIVE STRUCTURE (18 frames)
- Frames 1-3: HOOK — Grab attention in the first 3 seconds. Bold, surprising, pattern-breaking.
- Frames 4-12: BODY — Build the story. Product benefits, mechanism, social proof, emotional journey.
- Frames 13-17: PAYOFF — Drive home the value proposition. Transformation, results, desire.
- Frame 18: END FRAME — Clean product shot. This is where text/CTA gets added in post.

## IMAGE PROMPT RULES
- Every prompt MUST end with "9:16 portrait format"
- Include the style in every prompt (e.g. "Pixar 3D animation style" or "minimal Apple-style studio")
- Be SPECIFIC about composition, lighting, camera angle, colors
- Describe what's IN the frame, not what it "represents"
- Product should appear naturally in at least 4-5 frames (not forced into every one)
- Vary compositions: close-ups, wide shots, detail shots, environment shots

## VOICEOVER SCRIPT
Also generate a 60-second voiceover script that maps to the visual sequence.
- Beginning, middle, and end structure
- Hook engagement in first 5 seconds
- End with a single finishing slogan or line
- The end scene (frame 18) is just a product shot — voiceover should wrap up before it

## PRODUCT CONTEXT
Product: ${product}
${productBrief}

${guidelines ? `## COPYWRITING GUIDELINES\n${guidelines}` : ""}

${learningsContext ? `## CREATIVE TESTING LEARNINGS\n${learningsContext}` : ""}

## ORIGINALITY RULES
- Do NOT copy prompt examples verbatim — create original scenes
- Do NOT reuse common AI ad tropes (glowing orbs, floating particles for no reason)
- Ground every visual in a real benefit or emotion, not abstract aesthetics
- If you've seen it in a Midjourney showcase, it's overdone — find a fresh angle

## OUTPUT FORMAT
Return a single JSON object (no markdown fences):
{
  "concept_name": "Short creative name for this concept",
  "style": "${style}",
  "frame_count": 18,
  "frames": [
    {
      "frame_number": 1,
      "role": "hook",
      "nano_banana_prompt": "Full NanoBananaPro prompt for this frame..."
    }
  ],
  "voiceover_script": "Full 60-second voiceover script...",
  "voiceover_style": "Description of the ideal voice for this ad...",
  "music_style": "Suno-compatible description of the ideal background music...",
  "ad_copy_primary": "Facebook primary text for this ad",
  "ad_copy_headline": "Facebook headline for this ad"
}`;
}

export function buildAnimatedAdUserPrompt(
  style: AnimatedAdStyle,
  direction?: string
): string {
  const parts = [
    `Generate 1 animated ad concept in "${style}" style with exactly 18 NanoBananaPro image prompts.`,
    `Remember: consecutive frames will be animated together, so visual continuity between pairs is essential.`,
  ];

  if (direction) {
    parts.push(`\nCreative direction from the user: ${direction}`);
  }

  parts.push("\nReturn the JSON object now.");
  return parts.join("\n");
}
```

**Step 2: Add to BRAINSTORM_MODES in `src/lib/brainstorm.ts`**

Add to the `BRAINSTORM_MODES` array (before the closing `]`):

```typescript
  {
    value: "animated_ad",
    label: "Animated Ad",
    description: "Generate NanoBananaPro image sequences for Kling 3.0 animated video ads",
    icon: "Film",
  },
```

Also add to the `systemPromptBuilders` map:

```typescript
  animated_ad: () => {
    throw new Error("animated_ad mode uses its own prompt builder — see animated-ad-brainstorm.ts");
  },
```

**Step 3: Add to BrainstormMode type**

Find the `BrainstormMode` type in `src/types/index.ts` and add `"animated_ad"` to the union.

**Step 4: Add handler in `src/app/api/brainstorm/route.ts`**

Add `"animated_ad"` to the `VALID_MODES` array. Then add a new code block before the general brainstorm path (after the pixar_animation block at ~line 683), following the exact same NDJSON streaming pattern as `pixar_animation`:

```typescript
  // -----------------------------------------------------------------------
  // ANIMATED AD — NanoBananaPro image sequence for Kling 3.0 animation
  // -----------------------------------------------------------------------
  if (mode === "animated_ad") {
    const { buildAnimatedAdSystemPrompt, buildAnimatedAdUserPrompt } = await import("@/lib/animated-ad-brainstorm");

    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    async function emit(data: object) {
      await writer.write(encoder.encode(JSON.stringify(data) + "\n"));
    }

    (async () => {
      try {
        const style = body.style || "apple_realistic";
        await emit({ step: "generating", message: `Generating ${style} animated ad concept...` });

        const guidelinesText = guidelines
          .filter((g) => g.name !== "Product Brief")
          .map((g) => `### ${g.name}\n${g.content}`)
          .join("\n\n");

        const systemPrompt = buildAnimatedAdSystemPrompt(
          productSlug,
          productBrief ?? "",
          guidelinesText,
          learningsContext,
          style
        );

        const userPrompt = buildAnimatedAdUserPrompt(style, body.direction);

        const client = new Anthropic({ apiKey });
        const response = await client.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 16000,
          temperature: 0.8,
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: userPrompt }],
        });

        const rawContent =
          response.content[0]?.type === "text"
            ? response.content[0].text.trim()
            : "";

        if (!rawContent) {
          await emit({ step: "error", message: "No response from AI" });
          await writer.close();
          return;
        }

        let parsed: Record<string, unknown>;
        try {
          const cleaned = rawContent
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();
          parsed = JSON.parse(cleaned);
        } catch (parseErr) {
          const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          console.error("[brainstorm/animated_ad] Parse error:", msg, "\nRaw:", rawContent.slice(0, 500));
          await emit({ step: "error", message: `Failed to parse AI response: ${msg}` });
          await writer.close();
          return;
        }

        if (!parsed.frames || !Array.isArray(parsed.frames) || parsed.frames.length === 0) {
          await emit({ step: "error", message: "AI returned no frames" });
          await writer.close();
          return;
        }

        const inputTokens = response.usage.input_tokens;
        const outputTokens = response.usage.output_tokens;
        const cacheCreation = (response.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0;
        const cacheRead = (response.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0;
        const costUsd = calcClaudeCost(inputTokens, outputTokens, cacheCreation, cacheRead);

        await db.from("usage_logs").insert({
          type: "animated_ad_brainstorm",
          page_id: null,
          translation_id: null,
          model: CLAUDE_MODEL,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_usd: costUsd,
          metadata: {
            purpose: "animated_ad_brainstorm",
            mode,
            product: productSlug,
            style,
            frame_count: parsed.frames.length,
          },
        });

        await emit({
          step: "done",
          proposals: [parsed], // Wrap in array for consistency with other modes
          type: "animated_ad",
          cost: { input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd },
        });

        await writer.close();
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error("[brainstorm/animated_ad] Error:", detail);
        await emit({ step: "error", message: `Animated ad brainstorm failed: ${detail}` });
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }
```

**Step 5: Commit**

```bash
git add src/lib/animated-ad-brainstorm.ts src/lib/brainstorm.ts src/app/api/brainstorm/route.ts src/types/index.ts
git commit -m "feat: add animated_ad brainstorm mode"
```

---

## Task 7: API Routes — Create + Status

**Files:**
- Create: `src/app/api/animated-ads/create/route.ts`
- Create: `src/app/api/animated-ads/[id]/status/route.ts`

**Step 1: Create route `src/app/api/animated-ads/create/route.ts`**

This receives an `AnimatedAdProposal` from the brainstorm step and creates the DB rows:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import type { AnimatedAdProposal } from "@/types";

export async function POST(req: NextRequest) {
  const db = createServerSupabase();
  const body: AnimatedAdProposal & { product: string } = await req.json();

  const { data: ad, error: adError } = await db
    .from("animated_ads")
    .insert({
      product: body.product,
      concept_name: body.concept_name,
      style: body.style,
      status: "prompts_ready",
      target_duration_seconds: 60,
      image_prompt_count: body.frames.length,
      voiceover_script: body.voiceover_script,
      voiceover_style: body.voiceover_style,
      music_style: body.music_style,
      ad_copy_primary: body.ad_copy_primary,
      ad_copy_headline: body.ad_copy_headline,
    })
    .select("id")
    .single();

  if (adError || !ad) {
    return NextResponse.json({ error: adError?.message ?? "Failed to create animated ad" }, { status: 500 });
  }

  // Create frame rows
  const frameRows = body.frames.map((f) => ({
    animated_ad_id: ad.id,
    frame_number: f.frame_number,
    role: f.role,
    prompt: f.nano_banana_prompt,
    image_status: "pending",
  }));

  const { error: framesError } = await db.from("animated_ad_frames").insert(frameRows);

  if (framesError) {
    return NextResponse.json({ error: framesError.message }, { status: 500 });
  }

  return NextResponse.json({ id: ad.id });
}
```

**Step 2: Create route `src/app/api/animated-ads/[id]/status/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  const { data: ad, error } = await db
    .from("animated_ads")
    .select("*, frames:animated_ad_frames(*), clips:animated_ad_clips(*), audio:animated_ad_audio(*)")
    .eq("id", id)
    .single();

  if (error || !ad) {
    return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
  }

  // Sort frames and clips by number
  if (ad.frames) ad.frames.sort((a: { frame_number: number }, b: { frame_number: number }) => a.frame_number - b.frame_number);
  if (ad.clips) ad.clips.sort((a: { clip_number: number }, b: { clip_number: number }) => a.clip_number - b.clip_number);

  return NextResponse.json(ad);
}
```

**Step 3: Commit**

```bash
git add src/app/api/animated-ads/
git commit -m "feat: add animated ads create + status API routes"
```

---

## Task 8: API Routes — Generate Images + Regenerate Frame

**Files:**
- Create: `src/app/api/animated-ads/[id]/generate-images/route.ts`
- Create: `src/app/api/animated-ads/[id]/regenerate-frame/[frameNumber]/route.ts`

**Step 1: Create `generate-images` route**

This fires all NanoBananaPro tasks in parallel, stores task IDs, and returns immediately. The client polls `/status` to see progress.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { createImageTask } from "@/lib/kie";
import { ANIMATED_IMAGE_DEFAULTS } from "@/lib/animated-ad-prompts";
import { KIE_PRO_IMAGE_COST } from "@/lib/pricing";

export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  // Get all pending frames
  const { data: frames, error } = await db
    .from("animated_ad_frames")
    .select("*")
    .eq("animated_ad_id", id)
    .eq("image_status", "pending")
    .order("frame_number");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!frames?.length) return NextResponse.json({ error: "No pending frames" }, { status: 400 });

  // Update ad status
  await db.from("animated_ads").update({ status: "generating_images" }).eq("id", id);

  // Fire all image tasks in parallel
  const results = await Promise.allSettled(
    frames.map(async (frame) => {
      try {
        const taskId = await createImageTask(
          frame.prompt,
          [], // No reference images
          ANIMATED_IMAGE_DEFAULTS.aspectRatio,
          ANIMATED_IMAGE_DEFAULTS.resolution,
          ANIMATED_IMAGE_DEFAULTS.model
        );

        await db
          .from("animated_ad_frames")
          .update({ image_kie_task_id: taskId, image_status: "generating" })
          .eq("id", frame.id);

        return { frameId: frame.id, taskId };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db
          .from("animated_ad_frames")
          .update({ image_status: "failed", error_message: msg })
          .eq("id", frame.id);
        throw err;
      }
    })
  );

  const launched = results.filter((r) => r.status === "fulfilled").length;

  // Log estimated cost
  await db
    .from("animated_ads")
    .update({ estimated_cost_usd: launched * KIE_PRO_IMAGE_COST })
    .eq("id", id);

  return NextResponse.json({ launched, total: frames.length });
}
```

**Step 2: Create `regenerate-frame` route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { createImageTask } from "@/lib/kie";
import { ANIMATED_IMAGE_DEFAULTS } from "@/lib/animated-ad-prompts";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; frameNumber: string }> }
) {
  const { id, frameNumber } = await params;
  const db = createServerSupabase();
  const body = await req.json().catch(() => ({}));

  // Optionally update prompt
  const updateData: Record<string, unknown> = {
    image_status: "generating",
    image_url: null,
    error_message: null,
  };
  if (body.prompt) updateData.prompt = body.prompt;

  const { data: frame, error } = await db
    .from("animated_ad_frames")
    .update(updateData)
    .eq("animated_ad_id", id)
    .eq("frame_number", parseInt(frameNumber))
    .select("*")
    .single();

  if (error || !frame) {
    return NextResponse.json({ error: error?.message ?? "Frame not found" }, { status: 404 });
  }

  try {
    const taskId = await createImageTask(
      frame.prompt,
      [],
      ANIMATED_IMAGE_DEFAULTS.aspectRatio,
      ANIMATED_IMAGE_DEFAULTS.resolution,
      ANIMATED_IMAGE_DEFAULTS.model
    );

    await db
      .from("animated_ad_frames")
      .update({ image_kie_task_id: taskId })
      .eq("id", frame.id);

    return NextResponse.json({ taskId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .from("animated_ad_frames")
      .update({ image_status: "failed", error_message: msg })
      .eq("id", frame.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

**Step 3: Commit**

```bash
git add src/app/api/animated-ads/
git commit -m "feat: add generate-images and regenerate-frame API routes"
```

---

## Task 9: API Routes — Generate Videos + Regenerate Clip

**Files:**
- Create: `src/app/api/animated-ads/[id]/generate-videos/route.ts`
- Create: `src/app/api/animated-ads/[id]/regenerate-clip/[clipNumber]/route.ts`

**Step 1: Create `generate-videos` route**

Pairs consecutive frames and fires Kling 3.0 tasks:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { createKlingTask } from "@/lib/kie";
import { ANIMATION_PROMPTS, KLING_DEFAULTS } from "@/lib/animated-ad-prompts";
import { KIE_KLING_STD_5S_COST } from "@/lib/pricing";
import type { AnimatedAdStyle } from "@/types";

export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  // Get ad + all completed frames
  const { data: ad } = await db.from("animated_ads").select("style").eq("id", id).single();
  if (!ad) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: frames } = await db
    .from("animated_ad_frames")
    .select("*")
    .eq("animated_ad_id", id)
    .eq("image_status", "completed")
    .order("frame_number");

  if (!frames || frames.length < 2) {
    return NextResponse.json({ error: "Need at least 2 completed frames" }, { status: 400 });
  }

  // Create clip pairs: P1→P2, P2→P3, P3→P4, etc.
  const style = ad.style as AnimatedAdStyle;
  const animationPrompt = ANIMATION_PROMPTS[style];
  const clipPairs: { clipNumber: number; startFrame: typeof frames[0]; endFrame: typeof frames[0] }[] = [];

  for (let i = 0; i < frames.length - 1; i++) {
    clipPairs.push({
      clipNumber: i + 1,
      startFrame: frames[i],
      endFrame: frames[i + 1],
    });
  }

  // Update ad status
  await db.from("animated_ads").update({ status: "generating_videos" }).eq("id", id);

  // Insert clip rows and fire Kling tasks in parallel
  const results = await Promise.allSettled(
    clipPairs.map(async ({ clipNumber, startFrame, endFrame }) => {
      // Upsert clip row
      const { data: clip } = await db
        .from("animated_ad_clips")
        .upsert(
          {
            animated_ad_id: id,
            clip_number: clipNumber,
            start_frame_number: startFrame.frame_number,
            end_frame_number: endFrame.frame_number,
            animation_prompt: animationPrompt,
            video_status: "generating",
            duration_seconds: KLING_DEFAULTS.duration,
          },
          { onConflict: "animated_ad_id,clip_number" }
        )
        .select("id")
        .single();

      if (!clip) throw new Error(`Failed to create clip ${clipNumber}`);

      const taskId = await createKlingTask({
        prompt: animationPrompt,
        imageUrls: [startFrame.image_url!, endFrame.image_url!],
        sound: KLING_DEFAULTS.sound,
        duration: KLING_DEFAULTS.duration,
        aspectRatio: KLING_DEFAULTS.aspectRatio,
        mode: KLING_DEFAULTS.mode,
      });

      await db
        .from("animated_ad_clips")
        .update({ video_kie_task_id: taskId })
        .eq("id", clip.id);

      return { clipId: clip.id, taskId };
    })
  );

  const launched = results.filter((r) => r.status === "fulfilled").length;

  // Update estimated cost
  const { data: currentAd } = await db.from("animated_ads").select("estimated_cost_usd").eq("id", id).single();
  const currentCost = currentAd?.estimated_cost_usd ?? 0;
  await db
    .from("animated_ads")
    .update({ estimated_cost_usd: currentCost + launched * KIE_KLING_STD_5S_COST })
    .eq("id", id);

  return NextResponse.json({ launched, total: clipPairs.length });
}
```

**Step 2: Create `regenerate-clip` route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { createKlingTask } from "@/lib/kie";
import { KLING_DEFAULTS } from "@/lib/animated-ad-prompts";

export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; clipNumber: string }> }
) {
  const { id, clipNumber } = await params;
  const db = createServerSupabase();

  const { data: clip } = await db
    .from("animated_ad_clips")
    .select("*, start_frame:animated_ad_frames!inner(*)")
    .eq("animated_ad_id", id)
    .eq("clip_number", parseInt(clipNumber))
    .single();

  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

  // Get both frames
  const { data: frames } = await db
    .from("animated_ad_frames")
    .select("*")
    .eq("animated_ad_id", id)
    .in("frame_number", [clip.start_frame_number, clip.end_frame_number])
    .order("frame_number");

  if (!frames || frames.length < 2) {
    return NextResponse.json({ error: "Source frames not found" }, { status: 400 });
  }

  await db
    .from("animated_ad_clips")
    .update({ video_status: "generating", video_url: null, error_message: null })
    .eq("id", clip.id);

  try {
    const taskId = await createKlingTask({
      prompt: clip.animation_prompt,
      imageUrls: [frames[0].image_url!, frames[1].image_url!],
      sound: KLING_DEFAULTS.sound,
      duration: KLING_DEFAULTS.duration,
      aspectRatio: KLING_DEFAULTS.aspectRatio,
      mode: KLING_DEFAULTS.mode,
    });

    await db.from("animated_ad_clips").update({ video_kie_task_id: taskId }).eq("id", clip.id);

    return NextResponse.json({ taskId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.from("animated_ad_clips").update({ video_status: "failed", error_message: msg }).eq("id", clip.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

**Step 3: Commit**

```bash
git add src/app/api/animated-ads/
git commit -m "feat: add generate-videos and regenerate-clip API routes"
```

---

## Task 10: API Routes — Generate Audio + Polling Worker

**Files:**
- Create: `src/app/api/animated-ads/[id]/generate-audio/route.ts`
- Create: `src/app/api/animated-ads/[id]/poll/route.ts` (background task poller)

**Step 1: Create `generate-audio` route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { createSunoTask } from "@/lib/kie";
import { designVoice, generateSpeech } from "@/lib/elevenlabs";
import { ELEVENLABS_VOICEOVER_COST, KIE_SUNO_COST } from "@/lib/pricing";

export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  const { data: ad } = await db.from("animated_ads").select("*").eq("id", id).single();
  if (!ad) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.from("animated_ads").update({ status: "generating_audio" }).eq("id", id);

  // Create audio rows
  await db.from("animated_ad_audio").upsert([
    { animated_ad_id: id, audio_type: "voiceover", status: "generating" },
    { animated_ad_id: id, audio_type: "music", status: "generating" },
  ], { onConflict: "animated_ad_id,audio_type" });

  // Fire voiceover + music in parallel
  const results = await Promise.allSettled([
    // Voiceover via ElevenLabs
    (async () => {
      try {
        const { voiceId } = await designVoice(
          ad.voiceover_style || "Professional, warm narrator voice.",
          (ad.voiceover_script || "Preview text.").slice(0, 100)
        );

        const audioBuffer = await generateSpeech(voiceId, ad.voiceover_script || "");

        // Upload to Supabase Storage
        const fileName = `${id}/voiceover.mp3`;
        const { error: uploadError } = await db.storage
          .from("animated-ads")
          .upload(fileName, audioBuffer, { contentType: "audio/mpeg", upsert: true });

        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

        const { data: urlData } = db.storage.from("animated-ads").getPublicUrl(fileName);

        await db
          .from("animated_ad_audio")
          .update({ status: "completed", audio_url: urlData.publicUrl })
          .eq("animated_ad_id", id)
          .eq("audio_type", "voiceover");

        return { type: "voiceover", url: urlData.publicUrl };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db
          .from("animated_ad_audio")
          .update({ status: "failed", error_message: msg })
          .eq("animated_ad_id", id)
          .eq("audio_type", "voiceover");
        throw err;
      }
    })(),

    // Music via Suno
    (async () => {
      try {
        const taskId = await createSunoTask({
          prompt: ad.voiceover_script?.slice(0, 200) || "Background music for video ad",
          style: ad.music_style || "cinematic, minimal, modern",
          title: `${ad.concept_name} - Music`,
          instrumental: true,
        });

        await db
          .from("animated_ad_audio")
          .update({ task_id: taskId })
          .eq("animated_ad_id", id)
          .eq("audio_type", "music");

        return { type: "music", taskId };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db
          .from("animated_ad_audio")
          .update({ status: "failed", error_message: msg })
          .eq("animated_ad_id", id)
          .eq("audio_type", "music");
        throw err;
      }
    })(),
  ]);

  // Update cost
  const { data: currentAd } = await db.from("animated_ads").select("estimated_cost_usd").eq("id", id).single();
  const currentCost = currentAd?.estimated_cost_usd ?? 0;
  await db
    .from("animated_ads")
    .update({ estimated_cost_usd: currentCost + ELEVENLABS_VOICEOVER_COST + KIE_SUNO_COST })
    .eq("id", id);

  return NextResponse.json({
    voiceover: results[0].status === "fulfilled" ? "launched" : "failed",
    music: results[1].status === "fulfilled" ? "launched" : "failed",
  });
}
```

**Step 2: Create poll route `src/app/api/animated-ads/[id]/poll/route.ts`**

This is called by the client to check and update Kie task statuses:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { checkImageTaskStatus } from "@/lib/kie";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  // Check generating frames
  const { data: generatingFrames } = await db
    .from("animated_ad_frames")
    .select("*")
    .eq("animated_ad_id", id)
    .eq("image_status", "generating");

  let updatedFrames = 0;
  if (generatingFrames?.length) {
    await Promise.allSettled(
      generatingFrames.map(async (frame) => {
        if (!frame.image_kie_task_id) return;
        const result = await checkImageTaskStatus(frame.image_kie_task_id);
        if (result.status === "completed" && result.urls.length > 0) {
          await db
            .from("animated_ad_frames")
            .update({ image_status: "completed", image_url: result.urls[0] })
            .eq("id", frame.id);
          updatedFrames++;
        } else if (result.status === "failed") {
          await db
            .from("animated_ad_frames")
            .update({ image_status: "failed", error_message: result.errorMessage })
            .eq("id", frame.id);
          updatedFrames++;
        }
      })
    );
  }

  // Check generating clips
  const { data: generatingClips } = await db
    .from("animated_ad_clips")
    .select("*")
    .eq("animated_ad_id", id)
    .eq("video_status", "generating");

  let updatedClips = 0;
  if (generatingClips?.length) {
    await Promise.allSettled(
      generatingClips.map(async (clip) => {
        if (!clip.video_kie_task_id) return;
        // Kling uses same endpoint as images for status check
        const result = await checkImageTaskStatus(clip.video_kie_task_id);
        if (result.status === "completed" && result.urls.length > 0) {
          await db
            .from("animated_ad_clips")
            .update({ video_status: "completed", video_url: result.urls[0] })
            .eq("id", clip.id);
          updatedClips++;
        } else if (result.status === "failed") {
          await db
            .from("animated_ad_clips")
            .update({ video_status: "failed", error_message: result.errorMessage })
            .eq("id", clip.id);
          updatedClips++;
        }
      })
    );
  }

  // Check Suno music task
  const { data: musicAudio } = await db
    .from("animated_ad_audio")
    .select("*")
    .eq("animated_ad_id", id)
    .eq("audio_type", "music")
    .eq("status", "generating")
    .maybeSingle();

  if (musicAudio?.task_id) {
    try {
      const { pollSunoResult } = await import("@/lib/kie");
      // Single check, not full poll loop — we'll use checkImageTaskStatus pattern
      const res = await fetch(
        `https://api.kie.ai/api/v1/generate/record-info?taskId=${musicAudio.task_id}`,
        { headers: { Authorization: `Bearer ${process.env.KIE_AI_API_KEY}` } }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.data?.status === "complete" || data.data?.state === "success") {
          const tracks = data.data?.data || [];
          if (Array.isArray(tracks) && tracks[0]?.audio_url) {
            await db
              .from("animated_ad_audio")
              .update({
                status: "completed",
                audio_url: tracks[0].audio_url,
                duration_seconds: tracks[0].duration ?? null,
              })
              .eq("id", musicAudio.id);
          }
        }
      }
    } catch {
      // Non-fatal — will retry on next poll
    }
  }

  // Auto-transition ad status based on what's complete
  const { data: allFrames } = await db.from("animated_ad_frames").select("image_status").eq("animated_ad_id", id);
  const { data: allClips } = await db.from("animated_ad_clips").select("video_status").eq("animated_ad_id", id);
  const { data: allAudio } = await db.from("animated_ad_audio").select("status").eq("animated_ad_id", id);

  const { data: ad } = await db.from("animated_ads").select("status").eq("id", id).single();

  if (ad?.status === "generating_images" && allFrames?.every((f) => f.image_status !== "generating")) {
    const allDone = allFrames.every((f) => f.image_status === "completed");
    await db.from("animated_ads").update({ status: allDone ? "images_ready" : "error" }).eq("id", id);
  }

  if (ad?.status === "generating_videos" && allClips?.length && allClips.every((c) => c.video_status !== "generating")) {
    const allDone = allClips.every((c) => c.video_status === "completed");
    await db.from("animated_ads").update({ status: allDone ? "videos_ready" : "error" }).eq("id", id);
  }

  if (ad?.status === "generating_audio" && allAudio?.length && allAudio.every((a) => a.status !== "generating")) {
    const allDone = allAudio.every((a) => a.status === "completed");
    await db.from("animated_ads").update({ status: allDone ? "complete" : "error" }).eq("id", id);
  }

  return NextResponse.json({ updatedFrames, updatedClips });
}
```

**Step 3: Commit**

```bash
git add src/app/api/animated-ads/
git commit -m "feat: add generate-audio and poll API routes"
```

---

## Task 11: UI — Pipeline Stepper + Frame Card + Clip Card + Audio Card

**Files:**
- Create: `src/components/animated-ads/PipelineStepper.tsx`
- Create: `src/components/animated-ads/FrameCard.tsx`
- Create: `src/components/animated-ads/ClipCard.tsx`
- Create: `src/components/animated-ads/AudioCard.tsx`

**Step 1: Create PipelineStepper**

```typescript
"use client";

import type { AnimatedAdStatus } from "@/types";
import { Check, Loader2 } from "lucide-react";

const STEPS = [
  { key: "prompts_ready", label: "Prompts" },
  { key: "images", label: "Images" },
  { key: "videos", label: "Videos" },
  { key: "audio", label: "Audio" },
  { key: "complete", label: "Ready" },
] as const;

const STATUS_TO_STEP: Record<AnimatedAdStatus, number> = {
  prompts_ready: 0,
  generating_images: 1,
  images_ready: 1,
  generating_videos: 2,
  videos_ready: 2,
  generating_audio: 3,
  complete: 4,
  error: -1,
};

export function PipelineStepper({ status }: { status: AnimatedAdStatus }) {
  const currentStep = STATUS_TO_STEP[status] ?? 0;
  const isGenerating = status.startsWith("generating_");

  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, i) => {
        const isComplete = i < currentStep;
        const isCurrent = i === currentStep;
        const isActive = isCurrent && isGenerating;

        return (
          <div key={step.key} className="flex items-center gap-2">
            {i > 0 && (
              <div className={`h-0.5 w-8 ${isComplete ? "bg-indigo-600" : "bg-gray-200"}`} />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                  isComplete
                    ? "bg-indigo-600 text-white"
                    : isCurrent
                      ? "border-2 border-indigo-600 text-indigo-600"
                      : "border-2 border-gray-200 text-gray-400"
                }`}
              >
                {isComplete ? (
                  <Check className="h-4 w-4" />
                ) : isActive ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-sm ${
                  isComplete || isCurrent ? "font-medium text-gray-900" : "text-gray-400"
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

**Step 2: Create FrameCard**

```typescript
"use client";

import type { AnimatedAdFrame } from "@/types";
import { Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { useState } from "react";

interface FrameCardProps {
  frame: AnimatedAdFrame;
  adId: string;
  onRegenerate: () => void;
}

export function FrameCard({ frame, adId, onRegenerate }: FrameCardProps) {
  const [regenerating, setRegenerating] = useState(false);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await fetch(`/api/animated-ads/${adId}/regenerate-frame/${frame.frame_number}`, {
        method: "POST",
      });
      onRegenerate();
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <span className="text-xs font-medium text-gray-500">
          P{frame.frame_number} · {frame.role}
        </span>
        {frame.image_status === "completed" && (
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="text-xs text-gray-400 hover:text-indigo-600"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>

      <div className="aspect-[9/16] bg-gray-50 flex items-center justify-center">
        {frame.image_status === "completed" && frame.image_url ? (
          <img
            src={frame.image_url}
            alt={`Frame ${frame.frame_number}`}
            className="h-full w-full object-cover"
          />
        ) : frame.image_status === "generating" ? (
          <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
        ) : frame.image_status === "failed" ? (
          <div className="flex flex-col items-center gap-2 p-4">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <p className="text-xs text-red-500 text-center">{frame.error_message || "Failed"}</p>
            <button
              onClick={handleRegenerate}
              className="text-xs text-indigo-600 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : (
          <span className="text-xs text-gray-400">Pending</span>
        )}
      </div>

      <div className="px-3 py-2">
        <p className="text-xs text-gray-500 line-clamp-2">{frame.prompt}</p>
      </div>
    </div>
  );
}
```

**Step 3: Create ClipCard**

```typescript
"use client";

import type { AnimatedAdClip, AnimatedAdFrame } from "@/types";
import { Loader2, RefreshCw, AlertCircle, Play } from "lucide-react";
import { useState } from "react";

interface ClipCardProps {
  clip: AnimatedAdClip;
  startFrame: AnimatedAdFrame | undefined;
  endFrame: AnimatedAdFrame | undefined;
  adId: string;
  onRegenerate: () => void;
}

export function ClipCard({ clip, startFrame, endFrame, adId, onRegenerate }: ClipCardProps) {
  const [regenerating, setRegenerating] = useState(false);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await fetch(`/api/animated-ads/${adId}/regenerate-clip/${clip.clip_number}`, {
        method: "POST",
      });
      onRegenerate();
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <span className="text-xs font-medium text-gray-500">
          V{clip.clip_number}: P{clip.start_frame_number} → P{clip.end_frame_number}
        </span>
        {clip.video_status === "completed" && (
          <button onClick={handleRegenerate} disabled={regenerating} className="text-xs text-gray-400 hover:text-indigo-600">
            <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>

      {/* Source frame thumbnails */}
      <div className="flex gap-1 px-3 py-2 bg-gray-50">
        {startFrame?.image_url && (
          <img src={startFrame.image_url} alt="" className="h-12 w-auto rounded" />
        )}
        <span className="text-gray-300 self-center">→</span>
        {endFrame?.image_url && (
          <img src={endFrame.image_url} alt="" className="h-12 w-auto rounded" />
        )}
      </div>

      <div className="aspect-video bg-gray-900 flex items-center justify-center">
        {clip.video_status === "completed" && clip.video_url ? (
          <video
            src={clip.video_url}
            controls
            className="h-full w-full object-contain"
          />
        ) : clip.video_status === "generating" ? (
          <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
        ) : clip.video_status === "failed" ? (
          <div className="flex flex-col items-center gap-2 p-4">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <p className="text-xs text-red-300 text-center">{clip.error_message || "Failed"}</p>
            <button onClick={handleRegenerate} className="text-xs text-indigo-400 hover:underline">
              Retry
            </button>
          </div>
        ) : (
          <Play className="h-6 w-6 text-gray-600" />
        )}
      </div>
    </div>
  );
}
```

**Step 4: Create AudioCard**

```typescript
"use client";

import type { AnimatedAdAudio } from "@/types";
import { Loader2, AlertCircle, Music, Mic, Download } from "lucide-react";

interface AudioCardProps {
  audio: AnimatedAdAudio;
}

export function AudioCard({ audio }: AudioCardProps) {
  const icon = audio.audio_type === "voiceover" ? Mic : Music;
  const Icon = icon;
  const label = audio.audio_type === "voiceover" ? "Voiceover" : "Music";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-900">{label}</span>
      </div>

      {audio.status === "completed" && audio.audio_url ? (
        <div className="space-y-2">
          <audio src={audio.audio_url} controls className="w-full" />
          <a
            href={audio.audio_url}
            download
            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
          >
            <Download className="h-3 w-3" /> Download
          </a>
        </div>
      ) : audio.status === "generating" ? (
        <div className="flex items-center gap-2 py-4">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
          <span className="text-sm text-gray-500">Generating...</span>
        </div>
      ) : audio.status === "failed" ? (
        <div className="flex items-center gap-2 py-4">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <span className="text-sm text-red-500">{audio.error_message || "Failed"}</span>
        </div>
      ) : (
        <span className="text-sm text-gray-400">Pending</span>
      )}
    </div>
  );
}
```

**Step 5: Commit**

```bash
git add src/components/animated-ads/
git commit -m "feat: add animated ad UI components (stepper, frame, clip, audio cards)"
```

---

## Task 12: UI — Detail Page

**Files:**
- Create: `src/app/(dashboard)/video-ads/animated/[id]/page.tsx`

**Step 1: Create the detail page**

This is the main page at `/video-ads/animated/[id]`. It shows the phased pipeline with polling:

```typescript
"use client";

import { useEffect, useState, useCallback, use } from "react";
import { PipelineStepper } from "@/components/animated-ads/PipelineStepper";
import { FrameCard } from "@/components/animated-ads/FrameCard";
import { ClipCard } from "@/components/animated-ads/ClipCard";
import { AudioCard } from "@/components/animated-ads/AudioCard";
import type { AnimatedAd } from "@/types";
import { Loader2, Download, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function AnimatedAdDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [ad, setAd] = useState<AnimatedAd | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    const res = await fetch(`/api/animated-ads/${id}/status`);
    if (res.ok) {
      const data = await res.json();
      setAd(data);
    }
    setLoading(false);
  }, [id]);

  // Poll for status updates + trigger Kie task checks
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(async () => {
      // Trigger poll to check Kie tasks and update DB
      if (ad?.status?.startsWith("generating_")) {
        await fetch(`/api/animated-ads/${id}/poll`, { method: "POST" });
      }
      fetchStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus, id, ad?.status]);

  if (loading || !ad) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  const isGenerating = ad.status.startsWith("generating_");
  const allImagesReady = ad.frames?.every((f) => f.image_status === "completed");
  const allVideosReady = ad.clips?.length && ad.clips.every((c) => c.video_status === "completed");
  const allAudioReady = ad.audio?.length && ad.audio.every((a) => a.status === "completed");

  const imagesDone = ad.frames?.filter((f) => f.image_status === "completed").length ?? 0;
  const imagesTotal = ad.frames?.length ?? 0;
  const clipsDone = ad.clips?.filter((c) => c.video_status === "completed").length ?? 0;
  const clipsTotal = ad.clips?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/video-ads" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{ad.concept_name}</h1>
            <p className="text-sm text-gray-500">
              {ad.style === "apple_realistic" ? "Apple Realistic" : "Pixar"} · {ad.image_prompt_count} frames · ~${ad.estimated_cost_usd?.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <PipelineStepper status={ad.status} />

      {/* Phase 1: Prompts / Images */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium text-gray-900">
            Frames {ad.status !== "prompts_ready" && `(${imagesDone}/${imagesTotal})`}
          </h2>
          {ad.status === "prompts_ready" && (
            <button
              onClick={async () => {
                await fetch(`/api/animated-ads/${id}/generate-images`, { method: "POST" });
                fetchStatus();
              }}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Generate All Images
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {ad.frames?.map((frame) => (
            <FrameCard key={frame.id} frame={frame} adId={id} onRegenerate={fetchStatus} />
          ))}
        </div>
      </section>

      {/* Phase 2: Videos */}
      {(ad.status === "images_ready" || ad.status === "generating_videos" || ad.status === "videos_ready" || ad.status === "generating_audio" || ad.status === "complete") && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium text-gray-900">
              Video Clips {clipsTotal > 0 && `(${clipsDone}/${clipsTotal})`}
            </h2>
            {ad.status === "images_ready" && allImagesReady && (
              <button
                onClick={async () => {
                  await fetch(`/api/animated-ads/${id}/generate-videos`, { method: "POST" });
                  fetchStatus();
                }}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Generate All Videos
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {ad.clips?.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                startFrame={ad.frames?.find((f) => f.frame_number === clip.start_frame_number)}
                endFrame={ad.frames?.find((f) => f.frame_number === clip.end_frame_number)}
                adId={id}
                onRegenerate={fetchStatus}
              />
            ))}
          </div>
        </section>
      )}

      {/* Phase 3: Audio */}
      {(ad.status === "videos_ready" || ad.status === "generating_audio" || ad.status === "complete") && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium text-gray-900">Audio</h2>
            {ad.status === "videos_ready" && allVideosReady && (
              <button
                onClick={async () => {
                  await fetch(`/api/animated-ads/${id}/generate-audio`, { method: "POST" });
                  fetchStatus();
                }}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Generate Audio
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {ad.audio?.map((a) => <AudioCard key={a.id} audio={a} />)}
          </div>
        </section>
      )}

      {/* Phase 4: Complete */}
      {ad.status === "complete" && (
        <section className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
          <h2 className="text-lg font-semibold text-green-900 mb-2">All Assets Ready</h2>
          <p className="text-sm text-green-700 mb-4">
            Download everything and import into CapCut. Speed map 2-2.5x, add mix transitions (0.5-0.7s).
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {ad.frames?.filter((f) => f.image_url).map((f) => (
              <a key={f.id} href={f.image_url!} download className="text-xs text-indigo-600 hover:underline">
                P{f.frame_number}
              </a>
            ))}
            {ad.clips?.filter((c) => c.video_url).map((c) => (
              <a key={c.id} href={c.video_url!} download className="text-xs text-indigo-600 hover:underline">
                V{c.clip_number}
              </a>
            ))}
            {ad.audio?.filter((a) => a.audio_url).map((a) => (
              <a key={a.id} href={a.audio_url!} download className="text-xs text-indigo-600 hover:underline">
                {a.audio_type}
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/\(dashboard\)/video-ads/animated/
git commit -m "feat: add animated ad detail page with phased pipeline UI"
```

---

## Task 13: Brainstorm UI Integration

**Files:**
- Modify: `src/components/brainstorm/BrainstormGenerate.tsx` (or equivalent)

**Step 1: Handle `animated_ad` proposals in the brainstorm results**

In the component that renders brainstorm results, add handling for `type === "animated_ad"`:
- Show concept name, style, frame count
- Show expandable prompt list
- "Create Animated Ad" button that POSTs to `/api/animated-ads/create` with the proposal data + product
- On success, redirect to `/video-ads/animated/[id]`

Also add the `style` selector to the brainstorm form when `animated_ad` mode is selected (dropdown with "Apple Realistic" and "Pixar" options).

This is the integration glue between brainstorm and the animated ads pipeline. The exact code depends on the current BrainstormGenerate component structure — read it fully and follow the pattern used for `pixar_animation` proposals.

**Step 2: Commit**

```bash
git add src/components/brainstorm/
git commit -m "feat: integrate animated_ad mode into brainstorm UI"
```

---

## Task 14: Video Ads List Page — Animated Tab

**Files:**
- Modify: `src/app/(dashboard)/video-ads/page.tsx`

**Step 1: Add animated ads tab/section**

Add a tab or section to the existing video-ads list page that fetches and displays `animated_ads` rows. Show: name, style badge, status badge, frame/clip progress, estimated cost, date. Each row links to `/video-ads/animated/[id]`.

Follow the existing card grid pattern used for video jobs.

**Step 2: Commit**

```bash
git add src/app/\(dashboard\)/video-ads/
git commit -m "feat: add animated ads section to video-ads list page"
```

---

## Task 15: Environment Variables + Final Verification

**Step 1: Add ELEVENLABS_API_KEY to Vercel**

Add the env var to the Vercel project (user needs to provide the key after signing up for ElevenLabs Starter plan at $5/mo).

**Step 2: Verify existing env vars**

Confirm these already exist in Vercel:
- `KIE_AI_API_KEY` — for NanoBananaPro, Kling 3.0, Suno
- `ANTHROPIC_API_KEY` — for Claude brainstorm

**Step 3: Test end-to-end**

1. Go to `/brainstorm`, select "Animated Ad" mode
2. Pick product + style (Apple Realistic or Pixar)
3. Generate → review prompts → "Create Animated Ad"
4. On detail page: Generate Images → review → Generate Videos → review → Generate Audio
5. Download all assets

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: animated ads pipeline — complete implementation"
```
