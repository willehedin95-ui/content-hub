/**
 * Competitor video ad swipe pipeline.
 *
 * Two-model approach:
 * 1. Gemini 2.5 Pro watches the actual video (audio + visual) → transcribes
 *    script, identifies hook/format/delivery, describes character and setting
 * 2. Claude takes that analysis + UGC knowledge base → generates an adapted
 *    video concept with shots for our product
 * 3. Auto-generates shot keyframe images via Kie AI (Nano Banana)
 */

import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getLanguagesByWorkspaceId } from "@/lib/workspace";
import { sendPhoto, sendMessageWithInlineKeyboard, sendMediaGroup } from "@/lib/telegram";
import { callGeminiVideo, createImageTask, pollTaskResult } from "@/lib/kie";
import {
  loadVideoUgcContext,
  buildVideoUgcSystemPrompt,
  LANGUAGE_LABELS,
} from "@/lib/video-brainstorm";
import {
  buildPixarAnimationSystemPrompt,
} from "@/lib/pixar-brainstorm";
import { extractDialogue, replaceDialogue } from "@/lib/dialogue-utils";
import { findBestLandingPage } from "@/lib/swipe-competitor";
import { formatRules } from "@/lib/translation-rules";
import { CLAUDE_MODEL, OPENAI_MODEL, STORAGE_BUCKET } from "@/lib/constants";
import {
  buildKeyframeStyleBlock,
  buildClaudeAestheticRules,
  formatLabel as formatLabelForHumans,
  type SwipeVideoFormatId,
} from "@/lib/video-format-aesthetics";
import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VideoSwipeStyle = "ugc" | "pixar_animation";

export interface VideoSwipeInput {
  workspaceId: string;
  productSlug: string;
  competitorVideoUrl: string;
  competitorAdCopy?: string;
  brandName: string;
  videoDuration?: number;
  gethookdAdId?: number;
  notifyTelegram?: boolean;
  existingJobId?: string;
  /**
   * Determines which prompt + keyframe pipeline to use.
   * - "ugc" (default): real-person UGC, reuses shot 1 keyframe across all shots,
   *   wraps keyframe in format-specific photo realism prompt
   * - "pixar_animation": 3D animated talking object/body-part characters,
   *   generates individual keyframes per shot, no photo wrapper
   */
  videoStyle?: VideoSwipeStyle;
  /**
   * Optional format override for UGC swipes. When set to anything other than
   * "auto", this ID is passed to both the Claude user prompt and the keyframe
   * image prompt wrapper, forcing a specific capture style (podcast studio,
   * lecture hall, street interview, tabletop product demo, etc.) INSTEAD of
   * the default iPhone selfie aesthetic. When "auto" or undefined, the format
   * detected by Gemini in the competitor video is used instead.
   */
  videoFormat?: SwipeVideoFormatId;
  /**
   * Optional freeform style/direction notes injected into the Claude user
   * prompt. Lets the user steer the swipe with a single sentence like
   * "two hosts in a warehouse talking about collagen" without having to
   * pick a specific format ID.
   */
  styleNotes?: string;
}

export interface VideoSwipeResult {
  videoJobId: string;
  conceptName: string;
  shotsCreated: number;
  shotImagesGenerated: number;
}

// ---------------------------------------------------------------------------
// Gemini prompt for video analysis
// ---------------------------------------------------------------------------

function buildVideoSwipeGeminiPrompt(
  style: VideoSwipeStyle = "ugc"
): { system: string; user: string } {
  if (style === "pixar_animation") {
    return buildPixarGeminiPrompt();
  }
  const system = `You are a UGC Video Deconstructor and Prompt Engineer. Your primary goal is to analyze any video, identify the specific characteristics that make it feel like authentic User-Generated Content (UGC), and reverse-engineer what makes it effective so we can create an ADAPTED version for a different product.

# ANALYSIS PROCESS

Watch the entire video carefully. Listen to every word. Observe every visual detail. Then provide a comprehensive deconstruction.

# OUTPUT FORMAT

Return valid JSON only (no markdown fences):

{
  "transcript": "Word-for-word transcription of ALL spoken dialogue. Include filler words (um, like, you know). Mark pauses as (pause). Annotate emotional tones in brackets like [enthusiastically], [nervous], [conspiratorial], [calm]. Label different speakers if multiple. If no speech, set to empty string.",
  "hook_first_3_seconds": "Exact transcription of what is said AND done in the first 3 seconds. This is the most critical part of the ad.",
  "big_idea": "The single core message of this ad in one sentence.",
  "hook_type": "problem_solution | promise | secret | discovery | social_proof | curiosity | confrontational",
  "format_type": "selfie_testimonial | street_interview | before_after | discovery | grwm | podcast_clip | product_demo | explainer | dorm_confessional | professor_lecture | grocery_approach | other",
  "delivery_style": "conversational | energetic | conspiratorial | emotional | authority | calm_intimate",
  "script_structure": "testimonial | insider_secret | discovery | before_after | street_interview | podcast",
  "character_description": "DETAILED character blueprint: approximate age, gender, ethnicity, hair style/color/length, eye color/shape, facial features (jawline, nose, skin tone/texture with visible pores and imperfections), build/posture, clothing (exact colors and style), accessories, mannerisms, emotional baseline, voice characteristics. Be extremely specific — enough to recreate this person in AI.",
  "setting": "DETAILED location: room type, background details (messy/clean, props visible, clutter like coffee cups, backpacks, unmade beds), time of day feel, lived-in authentic details.",
  "implied_device": "What camera was likely used based on aspect ratio, lens distortion, dynamic range, and artifacts.",
  "camera_setup": "Shot type (close-up/medium close-up/medium/wide), angle (below eye level/eye level/above), framing (centered/off-center/rule of thirds), camera motion (handheld sway and jitter/tripod/selfie grip wobble), orientation (vertical 9:16 / horizontal 16:9)",
  "lighting_analysis": "Light source type and direction (natural window, overhead, golden hour, ring light). How it illuminates the face (even/uneven/dramatic with side shadows). Shadow details. Professional or authentic feel.",
  "visual_style": "Overall aesthetic (professional/amateur/UGC), color grading, text overlays (yes/no and description), editing style (single take/jump cuts)",
  "audio_environment": "Background sounds (traffic, AC hum, cafe chatter), mic quality (phone mic echo, clear external mic), music (yes/no, type)",
  "product_interaction": "How product is held (two hands chest level, one hand at side, on desk), when first shown, how label is displayed, held throughout or briefly",
  "persuasion_analysis": "What psychological triggers does it use? Core promise? How does it build credibility? Call-to-action approach? The SINGLE most effective element.",
  "why_it_works": "In 2-3 sentences, the raw reason this video converts — the hook formula, emotional trigger, format choice.",
  "duration_seconds": 15,
  "scene_count": 1,
  "has_text_overlays": true,
  "has_music": false,
  "language": "en"
}

# RULES

- TRANSCRIBE EVERYTHING spoken — every word, every filler, every pause. This is the most important field.
- Annotate emotional delivery: [enthusiastically], [whispering], [concerned], [excited], [casual], [serious]
- Character description must be EXTREMELY detailed — facial features, exact clothing colors, hair details, skin texture, posture, mannerisms. This will be used to create an AI character.
- Setting must include "lived-in" authentic details, not just "bedroom" but specific props and clutter visible.
- Identify the hook formula: what pattern does the first 3 seconds follow?
- Product interaction timing: when is product first visible? How prominently displayed?
- Return ONLY valid JSON, no markdown fences`;

  const user = `Watch this competitor video ad carefully from start to finish. Listen to every single word spoken and observe every visual detail.

Your task:
1. TRANSCRIBE the complete spoken dialogue word-for-word with emotional annotations and pauses
2. EXTRACT the hook (first 3 seconds) and the big idea (core message)
3. DESCRIBE the character in enough detail to recreate them in AI (facial features, clothing, posture, voice)
4. ANALYZE the setting, lighting, camera work, audio environment, and product interaction
5. EXPLAIN why this ad is effective and what makes people stop scrolling

Return the structured JSON analysis.`;

  return { system, user };
}

/**
 * Gemini prompt for analyzing an animated (Pixar-style) competitor video.
 * Instead of extracting real-person UGC details (skin texture, iPhone aesthetics),
 * it extracts the animated character roster, theme, dialogue, and visual style
 * that make the ad work.
 */
function buildPixarGeminiPrompt(): { system: string; user: string } {
  const system = `You are an Animated Video Ad Deconstructor. You analyze Pixar-style / 3D-animated / cartoon talking-object video ads and reverse-engineer what makes them effective so we can create an ADAPTED version for a different product.

# ANALYSIS PROCESS

Watch the entire video carefully. Listen to every word. Identify EVERY distinct animated character that appears and speaks. Note the order, the theme, and the dialogue for each character.

IMPORTANT — two possible formats:
- **Single-character monologue**: ONE animated character speaks the entire ad, possibly across multiple shot angles or scene changes. Report it as exactly 1 character, even if there are multiple "shots" in the edit.
- **Multi-character compilation**: 2-5 DIFFERENT animated characters, each getting their own clip, stitched together. Report each distinct character separately.

Count the distinct CHARACTERS (not shots). If the same pillow speaks in 3 shots, that's 1 character. If a pillow, a coffee cup, and a spine each speak once, that's 3 characters.

# OUTPUT FORMAT

Return valid JSON only (no markdown fences):

{
  "transcript": "Word-for-word transcription of ALL spoken dialogue from every character in order. Label each character's line like [SPINE]: ... [BRAIN]: ... Include filler words and emotional tone in [brackets].",
  "hook_first_3_seconds": "Exact transcription of what the first character says and does in the first 3 seconds.",
  "big_idea": "The single core message/theme that ties all the characters together in one sentence.",
  "theme": "The overarching narrative theme (e.g. 'Body parts rebelling against bad sleep habits', 'Everyday objects confess their role in poor hydration').",
  "hook_type": "confrontational | confession | revelation | plea | smug_truth | curiosity",
  "characters": [
    {
      "character_object": "spine | brain | pillow | coffee_cup | etc — what the animated character IS",
      "character_category": "body_part | sleep_object | everyday_object | other",
      "appearance": "DETAILED Pixar-style appearance: material/texture (smooth glossy, matte plastic, soft fabric, subsurface scattering skin), color palette, distinctive props it wears or holds, facial feature style (oversized cartoon eyes, eyebrow shape, mouth style), thin animated arm style.",
      "mood": "frustrated | sassy | pleading | smug | wise | nervous | etc",
      "setting": "Where this character is placed in the scene (on a mattress, on a nightstand, next to a coffee cup, etc). Be specific and EXTERNAL — never inside a body cavity.",
      "action": "What the character physically does while speaking (crosses arms, gestures angrily, points, leans in, rolls eyes).",
      "dialogue": "Exact word-for-word line this character says, in the original language."
    }
  ],
  "animation_style": "Pixar 3D | Disney 3D | stylized 2D | claymation | other — describe the specific animation aesthetic (rendering quality, lighting style, color grading, depth of field).",
  "overall_visual_style": "Color palette, lighting style (soft global illumination, warm pastels, dramatic rim light), cinematic feel, any text overlays.",
  "duration_seconds": 30,
  "shot_count": 5,
  "has_text_overlays": true,
  "has_music": true,
  "music_style": "upbeat | suspenseful | quirky | emotional | none",
  "persuasion_analysis": "Why this ad works — the psychological hook, the cumulative effect of multiple characters 'ganging up', the emotional trigger, the core promise.",
  "why_it_works": "In 2-3 sentences: the raw reason this animated video converts.",
  "language": "en"
}

# RULES

- Transcribe EVERY character's dialogue word-for-word. This is the most important field.
- Identify EVERY distinct animated character — not just one. Pixar talking-object ads typically have 3-5 characters stitched together.
- Describe each character's Pixar aesthetic in enough detail to recreate them in AI (material, color, props, expression style).
- NEVER describe characters inside human bodies or anatomical interiors — if a body part character appears, describe its EXTERNAL placement (on a bed, on a pillow, on a desk, etc).
- Identify the unifying theme that ties all the characters together.
- Return ONLY valid JSON, no markdown fences.`;

  const user = `Watch this animated competitor video ad carefully from start to finish. This is a Pixar-style / 3D-animated talking object or body-part ad where multiple animated characters speak in sequence.

Your task:
1. TRANSCRIBE every character's spoken dialogue word-for-word, in order, with character labels
2. IDENTIFY every distinct animated character (what object it is, its appearance, mood, setting, action, and exact dialogue)
3. EXTRACT the overarching theme that ties them together
4. DESCRIBE the animation style and overall visual aesthetic
5. EXPLAIN why this ad is effective as a video ad format

Return the structured JSON analysis.`;

  return { system, user };
}

/**
 * Pixar system prompt for SINGLE-CHARACTER monologue format.
 * Used when the competitor video has exactly 1 animated character delivering
 * the entire ad across multiple shots (different camera angles, same character).
 *
 * This is inline (not in pixar-brainstorm.ts) because pixar-brainstorm.ts is
 * shared with BrainstormGenerate and hardcoded for multi-character format.
 */
function buildPixarSingleCharacterSystemPrompt(
  product: string,
  productBrief: string,
  guidelines: string,
  learningsContext: string,
  language: string = "sv"
): string {
  const LANGUAGE_NAMES: Record<string, string> = {
    sv: "Swedish",
    no: "Norwegian",
    da: "Danish",
    en: "English",
  };
  const langName = LANGUAGE_NAMES[language] || language;
  return `You are a creative director specializing in viral AI-animated video ads.

## YOUR TASK
Generate a Pixar-style SINGLE-CHARACTER MONOLOGUE video ad concept. ONE animated character delivers the entire ad as a monologue, broken into 3-5 shots. The SAME character speaks throughout — camera angles/framing can change per shot, but it's the same character in the same environment.

## LANGUAGE
ALL dialogue MUST be written in **${langName}**. The dialogue field and the VEO prompt dialogue must both be in ${langName}.
- Write natural, colloquial ${langName} — the way a real person would speak
- Ad copy (ad_copy_primary, ad_copy_headline) must also be in ${langName}
- The character_image_prompt stays in English (goes to image generator)
- VEO prompts stay in English EXCEPT for the dialogue inside quotes (in ${langName})
- Concept name and theme stay in English (internal use only)

## THE FORMAT
- ONE animated character (body part, object, or anthropomorphic thing) delivers a monologue
- 3-5 shots of 8 seconds each
- Each shot advances the narrative arc: hook → problem → twist/reveal → promise/solution tease
- SAME character, SAME base appearance, SAME environment across all shots
- Camera angles CAN change (wide, medium, close-up, over-the-shoulder) but the character is identical
- Pick ONE voice/attitude (sassy, confrontational, wise, smug, pleading) and stick with it across all shots

## CHARACTER LIBRARY (choose exactly ONE)

### Body Parts
- **Spine/back** — posture, alignment, mattress support
- **Neck** — stiffness, pillow height
- **Brain** — can't shut off, racing thoughts, stress
- **Eyes** — strained, dry, tired bags
- **Heart** — elevated rate from poor sleep, overworked
- **Shoulders** — tension knots, compensation
- **Skin** — dull, dehydrated, fine lines (beauty/collagen products)
- **Hair** — thinning, brittle, dry
- **Nails** — brittle, splitting
- **Stomach/gut** — digestion, bloating

### Sleep Objects
- **Pillow** — support, alignment
- **Flat pillow** — the villain, collapsed
- **Mattress** — pressure points, springs
- **Alarm clock** — morning struggle
- **Blanket/duvet** — temperature

### Everyday Objects
- **Smartphone** — blue light, doom scrolling
- **Coffee cup** — caffeine crashes
- **Water bottle** — hydration
- **Mirror** — morning confrontation with tired reflection
- **Supplement bottle** — the hero or the neglected friend

## DIALOGUE RULES
1. Character speaks in FIRST PERSON as itself ("I'm your spine...", "I'm not just a pillow...")
2. Each shot's dialogue = **MAX 15 words** (8-second clip). COUNT YOUR WORDS.
3. If a shot exceeds 15 words, SPLIT IT into two shots.
4. Total arc across shots: hook → truth bomb → consequence → solution tease
5. NEVER mention the product by name in dialogue — ad copy handles that
6. Stay in character — same voice, attitude, and tone across ALL shots
7. Each shot must advance the narrative — no filler or repetition
8. The monologue must relate to a REAL problem the target audience has

## HOOK TYPES
- **Confrontational**: Calls out the viewer's bad habits
- **Confession**: Admits the character's role in the viewer's problems
- **Revelation**: Reveals truths the viewer didn't know
- **Plea**: Begs for better treatment
- **Smug truth**: Drops wisdom with attitude

## IMAGE PROMPT (character_image_prompt) — SHARED ACROSS ALL SHOTS
Write ONE image prompt that defines the character + base scene. This goes to Nano Banana and the SAME keyframe is REUSED for every shot (different camera angles are handled inside VEO from the same starting frame).

Include:
1. **Character appearance**: Anthropomorphic Pixar-style 3D version — physical form, material/texture, what it's wearing or holding
2. **Facial expression**: Expressive oversized cartoon eyes, eyebrows, mouth matching the mood
3. **Resting pose**: Static neutral pose — this is the FIRST FRAME of a video, motion starts AFTER
4. **Environment**: Specific scene that supports the narrative
5. **Art style line**: Always end with the art style block

Template:
\`\`\`
Anthropomorphic Pixar-style 3D animated [OBJECT] character [PHYSICAL DESCRIPTION]. [WHAT IT'S WEARING/HOLDING]. [FACIAL EXPRESSION matching mood]. Static resting pose, [POSE DESCRIPTION], mouth closed or slightly parted.

Location: [SPECIFIC SCENE that matches the narrative]
[Environment details — what's around the character]

Art style: High-end Pixar style 3D character animation, stylized realism, soft rounded facial features, expressive oversized eyes, subtle subsurface scattering, smooth glossy materials, cinematic lighting, ultra polished family animation aesthetic, shallow depth of field, warm pastel color palette, soft global illumination, clean geometry, premium animated film quality render. Vertical 9:16 aspect ratio.
\`\`\`

## VEO PROMPT (veo_prompt) — ONE PER SHOT
One VEO prompt per shot. The character and environment are the SAME in every shot — what changes per shot is the CAMERA FRAMING, the specific ACTION, and the DIALOGUE.

Write in English except the dialogue (in ${langName}). Each VEO prompt must include:
1. **Character description**: Full description (same character across all shots)
2. **Location/environment**: Same as the character_image_prompt
3. **Camera angle/framing**: Specific to this shot (wide, medium, close-up, extreme close-up, over-the-shoulder, pushed-in)
4. **Action**: What the character physically does while speaking in this shot (gesture, head turn, lean in, cross arms, etc.)
5. **Dialogue**: The character's line for this shot (in ${langName}), using "says:" format

Template:
\`\`\`
[CHARACTER DESCRIPTION with appearance, props, expression]. [LOCATION/ENVIRONMENT]. [CAMERA FRAMING specific to this shot]. [ACTION — what the character does while speaking] says: "[DIALOGUE in ${langName}]"
\`\`\`

CRITICAL: Each shot's VEO prompt is a FULL movie-shot description, not just "character says: dialogue". Include the character, the scene, the camera, the action.

## SAFETY GUIDELINES
- NEVER place characters inside the human body (no "inside a skull", "inside a torso", "translucent body cross-section")
- NEVER describe anatomical interiors, exposed organs, or medical imagery
- NEVER use "bloodshot", "pain indicators", or medical distress imagery
- Body part characters go in EXTERNAL everyday settings: bedrooms, on nightstands, beds, bathrooms, kitchens
- Keep it whimsical and family-friendly — Pixar, not medical textbook
- Brain sits on a pillow or nightstand, NOT inside a skull
- Spine stands on a mattress or bed, NOT inside a body

## OUTPUT FORMAT
Return a JSON object with a "proposals" array containing EXACTLY 1 concept. The character_image_prompt is at CONCEPT LEVEL (shared across all shots), NOT per shot:

\`\`\`json
{
  "proposals": [
    {
      "concept_name": "The Spine's Confession",
      "theme": "Your spine confronts you about your mattress",
      "awareness_level": "problem_aware",
      "hook_type": "confrontational",
      "character_object": "spine",
      "character_category": "body_part",
      "character_mood": "frustrated",
      "character_image_prompt": "[SHARED Nano Banana prompt with character + scene + art style — same for all shots]",
      "shots": [
        {
          "shot_number": 1,
          "dialogue": "[MAX 15 words in ${langName}]",
          "duration_seconds": 8,
          "veo_prompt": "[FULL VEO prompt with character + environment + wide-shot camera framing + action + dialogue]"
        },
        {
          "shot_number": 2,
          "dialogue": "[MAX 15 words in ${langName}]",
          "duration_seconds": 8,
          "veo_prompt": "[FULL VEO prompt with medium close-up camera framing + different action + next dialogue]"
        },
        {
          "shot_number": 3,
          "dialogue": "[MAX 15 words in ${langName}]",
          "duration_seconds": 8,
          "veo_prompt": "[FULL VEO prompt with extreme close-up camera framing + final action + final dialogue]"
        }
      ],
      "ad_copy_primary": "[Ad copy in ${langName}]",
      "ad_copy_headline": "[Headline in ${langName}]"
    }
  ]
}
\`\`\`

3-5 shots total. character_image_prompt is ONE SHARED prompt at the concept level. Each shot has its own dialogue and veo_prompt (with different camera framing), but NO per-shot character_image_prompt.

IMPORTANT: Return ONLY valid JSON. No markdown fences. No commentary outside the JSON.

${learningsContext ? `\n## CREATIVE TESTING LEARNINGS\n${learningsContext}` : ""}

## PRODUCT KNOWLEDGE
Product: ${product}

${productBrief}

${guidelines ? `## COPYWRITING GUIDELINES\n${guidelines}` : ""}
`;
}

// ---------------------------------------------------------------------------
// Image prompt builder (from shot-images/route.ts pattern)
// ---------------------------------------------------------------------------

function buildImagePrompt(
  shotDescription: string,
  charDesc: string | null,
  productDesc: string | null,
  formatId: string | null | undefined
): string {
  // Format-specific capture style block — replaces the old hardcoded iPhone
  // wrapper so podcast / lecture / street / tabletop swipes get the right
  // aesthetic instead of forcing iPhone selfies.
  const styleBlock = buildKeyframeStyleBlock(formatId);

  return [
    shotDescription,
    charDesc ? `\n\nCharacter: ${charDesc}.` : "",
    productDesc ? `\n\nProduct: ${productDesc}` : "",
    styleBlock,
  ]
    .filter(Boolean)
    .join(" ");
}

// ---------------------------------------------------------------------------
// Main swipe function
// ---------------------------------------------------------------------------

export async function swipeCompetitorVideo(
  input: VideoSwipeInput
): Promise<VideoSwipeResult> {
  const db = createServerSupabase();
  const {
    workspaceId,
    productSlug,
    competitorVideoUrl,
    competitorAdCopy,
    brandName,
    videoDuration,
    notifyTelegram,
    existingJobId,
  } = input;
  const videoStyle: VideoSwipeStyle = input.videoStyle || "ugc";
  const isPixar = videoStyle === "pixar_animation";

  // UGC swipes can be steered by an explicit format override + freeform style
  // notes. Pixar swipes ignore these — they always use their own Pixar prompt.
  const formatOverride: SwipeVideoFormatId | null =
    !isPixar && input.videoFormat && input.videoFormat !== "auto"
      ? input.videoFormat
      : null;
  const rawStyleNotes = (input.styleNotes || "").trim();
  const styleNotesText = !isPixar && rawStyleNotes ? rawStyleNotes : "";

  // Progress updater for live UI
  async function updateProgress(jobId: string, step: string, message: string) {
    await db
      .from("video_jobs")
      .update({
        swipe_progress: { step, message },
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }

  if (existingJobId) {
    await updateProgress(
      existingJobId,
      "analyzing",
      "Gemini is watching the competitor video..."
    );
  }

  // -----------------------------------------------------------------------
  // Step 1: Gemini watches the actual video
  // -----------------------------------------------------------------------
  const geminiPrompt = buildVideoSwipeGeminiPrompt(videoStyle);
  const geminiResult = await callGeminiVideo(
    competitorVideoUrl,
    geminiPrompt.system,
    geminiPrompt.user
  );

  const rawGemini = geminiResult.text.trim();
  if (!rawGemini) throw new Error("Gemini returned empty response");

  // Union type — UGC analysis and Pixar analysis have different shapes
  interface UgcAnalysis {
    transcript: string;
    hook_first_3_seconds: string;
    big_idea: string;
    hook_type: string;
    format_type: string;
    delivery_style: string;
    script_structure: string;
    character_description: string;
    setting: string;
    implied_device: string;
    camera_setup: string;
    lighting_analysis: string;
    visual_style: string;
    audio_environment: string;
    product_interaction: string;
    persuasion_analysis: string;
    why_it_works: string;
    duration_seconds: number;
    scene_count: number;
    has_text_overlays: boolean;
    has_music: boolean;
    language: string;
  }

  interface PixarCharacter {
    character_object: string;
    character_category: string;
    appearance: string;
    mood: string;
    setting: string;
    action: string;
    dialogue: string;
  }

  interface PixarAnalysis {
    transcript: string;
    hook_first_3_seconds: string;
    big_idea: string;
    theme: string;
    hook_type: string;
    characters: PixarCharacter[];
    animation_style: string;
    overall_visual_style: string;
    duration_seconds: number;
    shot_count: number;
    has_text_overlays: boolean;
    has_music: boolean;
    music_style: string;
    persuasion_analysis: string;
    why_it_works: string;
    language: string;
  }

  let ugcAnalysis: UgcAnalysis | null = null;
  let pixarAnalysis: PixarAnalysis | null = null;

  try {
    const cleaned = rawGemini
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    if (isPixar) {
      pixarAnalysis = JSON.parse(cleaned) as PixarAnalysis;
    } else {
      ugcAnalysis = JSON.parse(cleaned) as UgcAnalysis;
    }
  } catch {
    console.error(
      "[swipe-video] Failed to parse Gemini response:",
      rawGemini.slice(0, 500)
    );
    throw new Error("Failed to parse Gemini video analysis");
  }

  // Pixar has two sub-modes depending on the source video:
  //   - single-character: ONE character delivers the entire monologue across
  //     multiple shots (same character, same scene, different camera angles)
  //   - multi-character: 2+ distinct characters stitched together, each speaking
  //     once in their own clip
  // We detect this from Gemini's character count and branch all downstream
  // logic (Claude prompt, proposal schema, keyframe generation) accordingly.
  const pixarCharacterCount = pixarAnalysis?.characters?.length ?? 0;
  const isPixarSingleCharacter = isPixar && pixarCharacterCount <= 1;
  const isPixarMultiCharacter = isPixar && pixarCharacterCount > 1;

  // Effective format ID used for format-aware keyframe + Claude prompt:
  //   1. Explicit user override wins (formatOverride)
  //   2. Otherwise, use the format Gemini detected in the competitor video
  //   3. Pixar ignores this entirely (its keyframe path doesn't call buildImagePrompt)
  const effectiveFormatId: string | null = isPixar
    ? null
    : formatOverride || ugcAnalysis?.format_type || null;

  // Log Gemini usage
  await db.from("usage_logs").insert({
    type: "video_swipe_analysis",
    model: "gemini-2.5-pro",
    input_tokens: geminiResult.usage.promptTokens,
    output_tokens: geminiResult.usage.completionTokens,
    cost_usd: 0,
    metadata: {
      purpose: "competitor_video_swipe",
      video_style: videoStyle,
      video_url: competitorVideoUrl.slice(0, 200),
      duration: videoDuration,
      total_tokens: geminiResult.usage.totalTokens,
    },
  });

  if (existingJobId) {
    await updateProgress(
      existingJobId,
      "generating_concept",
      "Claude is creating an adapted video concept..."
    );
  }

  // -----------------------------------------------------------------------
  // Step 2: Claude generates adapted concept
  // -----------------------------------------------------------------------
  const targetLanguages = await getLanguagesByWorkspaceId(workspaceId);
  const primaryLanguage = targetLanguages[0] || "sv";
  const langLabel = LANGUAGE_LABELS[primaryLanguage] || primaryLanguage;

  const context = await loadVideoUgcContext(productSlug, workspaceId);

  let systemPrompt: string;
  let userPrompt: string;

  if (isPixarSingleCharacter && pixarAnalysis) {
    systemPrompt = buildPixarSingleCharacterSystemPrompt(
      productSlug,
      context.productBrief,
      context.guidelines,
      context.learningsContext,
      primaryLanguage
    );

    const theChar = pixarAnalysis.characters[0];
    const charBlock = theChar
      ? `- Object: ${theChar.character_object} (${theChar.character_category})
- Mood: ${theChar.mood}
- Appearance: ${theChar.appearance}
- Setting: ${theChar.setting}
- Action: ${theChar.action}
- Full monologue: "${theChar.dialogue}"`
      : "(single character, full monologue in transcript)";

    userPrompt = `An animated (Pixar-style) SINGLE-CHARACTER MONOLOGUE competitor video ad was analyzed by watching the actual video with AI. ONE animated character delivers the entire ad across multiple shots (same character, different camera angles).

## COMPETITOR ANIMATED VIDEO ANALYSIS

**TRANSCRIPT** (word-for-word):
"${pixarAnalysis.transcript || "(no spoken dialogue)"}"

**HOOK (first 3 seconds)**: ${pixarAnalysis.hook_first_3_seconds || "N/A"}
**BIG IDEA**: ${pixarAnalysis.big_idea || "N/A"}
**THEME**: ${pixarAnalysis.theme || "N/A"}
**HOOK TYPE**: ${pixarAnalysis.hook_type || "N/A"}

**ANIMATION STYLE**: ${pixarAnalysis.animation_style || "Pixar 3D"}
**VISUAL STYLE**: ${pixarAnalysis.overall_visual_style || "N/A"}
**MUSIC**: ${pixarAnalysis.has_music ? pixarAnalysis.music_style || "yes" : "no"}
**DURATION**: ~${pixarAnalysis.duration_seconds || videoDuration || 30}s across ${pixarAnalysis.shot_count || 3}+ shots

**THE SINGLE CHARACTER**:
${charBlock}

**WHY IT WORKS**: ${pixarAnalysis.why_it_works || pixarAnalysis.persuasion_analysis}
**PERSUASION ANALYSIS**: ${pixarAnalysis.persuasion_analysis || "N/A"}

${competitorAdCopy ? `**COMPETITOR AD COPY**: ${competitorAdCopy.slice(0, 1500)}` : ""}

## YOUR TASK

Create exactly 1 adapted Pixar-style SINGLE-CHARACTER monologue video concept for OUR product. The competitor uses ONE animated character that delivers the entire ad. Follow the SAME format: ONE character, broken into 3-5 shots.

Do NOT copy the specific character or dialogue — adapt the FORMAT (one character monologue, consistent voice, cumulative narrative arc) to OUR product's problem space.

- Choose ONE character (body part, object, or anthropomorphic thing) that relates to OUR product's problem
- Split the monologue into 3-5 shots of 8 seconds each
- Same character, same base environment across all shots — only camera framing changes
- Match the competitor's hook type and emotional cadence
- Dialogue language: **${langLabel}**
- The character_image_prompt belongs at the CONCEPT level (shared across all shots), NOT per shot

${context.existingConcepts.length > 0 ? `### EXISTING CONCEPTS (do NOT duplicate)\n${context.existingConcepts.map((c) => `- ${c}`).join("\n")}` : ""}

Return a JSON object with a "proposals" array containing EXACTLY 1 concept, following the single-character schema defined in the system prompt. Return ONLY valid JSON. No markdown fences.`;
  } else if (isPixarMultiCharacter && pixarAnalysis) {
    systemPrompt = buildPixarAnimationSystemPrompt(
      productSlug,
      context.productBrief,
      context.guidelines,
      context.learningsContext,
      primaryLanguage
    );

    const charactersBlock = pixarAnalysis.characters
      .map((c, i) => `${i + 1}. **${c.character_object.toUpperCase()}** (${c.character_category}, ${c.mood})
   Appearance: ${c.appearance}
   Setting: ${c.setting}
   Action: ${c.action}
   Line: "${c.dialogue}"`)
      .join("\n\n");

    userPrompt = `An animated (Pixar-style) MULTI-CHARACTER compilation competitor video ad was analyzed by watching the actual video with AI. Multiple distinct animated characters each speak in their own clip, stitched together.

## COMPETITOR ANIMATED VIDEO ANALYSIS

**TRANSCRIPT** (word-for-word with character labels):
"${pixarAnalysis.transcript || "(no spoken dialogue)"}"

**HOOK (first 3 seconds)**: ${pixarAnalysis.hook_first_3_seconds || "N/A"}
**BIG IDEA**: ${pixarAnalysis.big_idea || "N/A"}
**THEME**: ${pixarAnalysis.theme || "N/A"}
**HOOK TYPE**: ${pixarAnalysis.hook_type || "N/A"}

**ANIMATION STYLE**: ${pixarAnalysis.animation_style || "Pixar 3D"}
**VISUAL STYLE**: ${pixarAnalysis.overall_visual_style || "N/A"}
**MUSIC**: ${pixarAnalysis.has_music ? pixarAnalysis.music_style || "yes" : "no"}
**DURATION**: ~${pixarAnalysis.duration_seconds || videoDuration || 30}s across ${pixarAnalysis.shot_count || pixarAnalysis.characters.length} characters

**CHARACTERS IN THE COMPETITOR AD**:
${charactersBlock}

**WHY IT WORKS**: ${pixarAnalysis.why_it_works || pixarAnalysis.persuasion_analysis}
**PERSUASION ANALYSIS**: ${pixarAnalysis.persuasion_analysis || "N/A"}

${competitorAdCopy ? `**COMPETITOR AD COPY**: ${competitorAdCopy.slice(0, 1500)}` : ""}

## YOUR TASK

Create exactly 1 adapted Pixar-style talking-object video concept for OUR product that SWIPES the FORMAT, THEME STRUCTURE, and HOOK TYPE from this competitor ad. Do NOT copy the specific characters or dialogue — adapt the TEMPLATE (how many characters, how they build on each other, the unifying theme, the hook pattern) to OUR product's problem space.

- If the competitor used body parts rebelling against bad sleep, and OUR product solves a different problem, use characters relevant to OUR product's problem.
- Keep the same NUMBER of characters as the competitor (${pixarAnalysis.characters.length}) when possible, adjust to 3-5 if needed.
- Match the competitor's hook type and emotional cadence.
- Dialogue language: **${langLabel}**.

${context.existingConcepts.length > 0 ? `### EXISTING CONCEPTS (do NOT duplicate)\n${context.existingConcepts.map((c) => `- ${c}`).join("\n")}` : ""}

Return a JSON object with a "proposals" array containing exactly 1 concept. Follow the EXACT schema defined in the system prompt (each shot must have character_object, character_category, character_mood, dialogue, duration_seconds, character_image_prompt, and veo_prompt).

Return ONLY valid JSON. No markdown fences.`;
  } else if (ugcAnalysis) {
    systemPrompt = buildVideoUgcSystemPrompt(
      productSlug,
      context.productBrief,
      context.guidelines,
      context.hookInspiration,
      context.learningsContext,
      context.existingCharacters,
      "multi_clip",
      { enabled: false },
      primaryLanguage
    );

    // Format-aware aesthetic rules for Claude — tells Claude whether to write
    // selfie UGC shots vs studio podcast vs lecture vs street vs tabletop.
    // When formatOverride is set the user explicitly forced a format; when not,
    // we fall back to whatever format Gemini detected in the source video.
    const aestheticRules = buildClaudeAestheticRules(effectiveFormatId);
    const formatLine = formatOverride
      ? `**FORMAT**: ${ugcAnalysis.format_type} (detected) → **${formatOverride}** (OVERRIDDEN by user) | **HOOK TYPE**: ${ugcAnalysis.hook_type} | **DELIVERY**: ${ugcAnalysis.delivery_style}`
      : `**FORMAT**: ${ugcAnalysis.format_type} | **HOOK TYPE**: ${ugcAnalysis.hook_type} | **DELIVERY**: ${ugcAnalysis.delivery_style}`;
    const styleNotesBlock = styleNotesText
      ? `\n\n## USER STYLE DIRECTION (MANDATORY)\n\nThe user has given this specific direction for the adapted swipe. Follow it EXACTLY in the concept, shot descriptions, and VEO prompts:\n\n> ${styleNotesText}\n\nThis direction OVERRIDES any conflicting detail from the competitor analysis above. If the user's direction conflicts with something Gemini detected in the competitor video, follow the user.`
      : "";
    const formatOverrideNote = formatOverride
      ? `\n\n**IMPORTANT**: Ignore the format Gemini detected in the source video. The user has explicitly forced format = "${formatOverride}" (${formatLabelForHumans(formatOverride)}). Write the concept in THAT format regardless of what the competitor video looked like. The hook, script structure, and persuasion mechanics from the competitor are still useful — but the VISUAL FORMAT must be the overridden one.`
      : "";

    userPrompt = `A competitor video ad was analyzed by watching the actual video with AI:

## COMPETITOR VIDEO ANALYSIS

**TRANSCRIPT** (word-for-word with emotional annotations):
"${ugcAnalysis.transcript || "(no spoken dialogue)"}"

**HOOK (first 3 seconds)**: ${ugcAnalysis.hook_first_3_seconds || "N/A"}
**BIG IDEA**: ${ugcAnalysis.big_idea || "N/A"}
${formatLine}
**SCRIPT STRUCTURE**: ${ugcAnalysis.script_structure}
**CHARACTER**: ${ugcAnalysis.character_description}
**SETTING**: ${ugcAnalysis.setting}
**CAMERA**: ${ugcAnalysis.camera_setup} | **DEVICE**: ${ugcAnalysis.implied_device || "iPhone"}
**LIGHTING**: ${ugcAnalysis.lighting_analysis || "N/A"}
**AUDIO**: ${ugcAnalysis.audio_environment || "N/A"}
**PRODUCT INTERACTION**: ${ugcAnalysis.product_interaction || "N/A"}
**DURATION**: ~${ugcAnalysis.duration_seconds || videoDuration || 15}s

**WHY IT WORKS**: ${ugcAnalysis.why_it_works || ugcAnalysis.persuasion_analysis}
**PERSUASION ANALYSIS**: ${ugcAnalysis.persuasion_analysis}

${competitorAdCopy ? `**COMPETITOR AD COPY**: ${competitorAdCopy.slice(0, 1500)}` : ""}${styleNotesBlock}

## YOUR TASK

Create 1 adapted video concept for our product that SWIPES the HOOK, APPROACH, and PERSUASION MECHANICS from this competitor ad. Do NOT copy the messaging or script — adapt the STRUCTURE, HOOK TYPE, and DELIVERY STYLE for our product.${formatOverrideNote}

**LANGUAGE: ${langLabel}** — Write the script, ad_copy_primary, and ad_copy_headline in ${langLabel}. In veo_prompt, keep technical parts (camera, actions) in English but write SPOKEN DIALOGUE (text after "says:") in ${langLabel}.

${aestheticRules}

Each shot's veo_prompt should be a detailed ~300 character Sora 2/VEO-optimized prompt including character/subject description, setting, camera angle, lighting, and specific actions — all matching the format rules above.

**DIALOGUE LENGTH LIMIT (CRITICAL)**: Each shot is exactly 8 seconds of video. Each shot's dialogue must be **MAX 15 words**. COUNT YOUR WORDS — if a shot exceeds 15 words, SPLIT IT into two shots. A calm 12-word sentence with a natural breath beats a rushed 15-word one. NEVER exceed 15 words per shot. This is the #1 cause of broken videos.

${context.existingConcepts.length > 0 ? `### EXISTING CONCEPTS (do NOT duplicate)\n${context.existingConcepts.map((c) => `- ${c}`).join("\n")}` : ""}

Generate exactly 1 concept with 3-8 shots (each 8 seconds, **MAX 15 words of dialogue per shot** — count every word). Use MORE shots with less dialogue each. Never exceed 15 words in any shot.
Return ONLY valid JSON. No markdown fences.`;
  } else {
    throw new Error("Video analysis is empty — cannot build concept prompt");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: isPixar ? 16000 : 8000,
    temperature: isPixar ? 0.8 : 0.7,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const rawClaude =
    response.content[0]?.type === "text"
      ? response.content[0].text.trim()
      : "";
  if (!rawClaude) throw new Error("Claude returned empty response");

  // Normalized proposal shape used downstream by the rest of the pipeline.
  // Pixar and UGC concepts both flatten into this structure.
  interface NormalizedShot {
    shot_number: number;
    shot_description: string;
    veo_prompt: string;
    duration_seconds: number;
  }

  interface NormalizedProposal {
    concept_name: string;
    format_type: string;
    hook_type: string;
    script_structure: string | null;
    delivery_style: string | null;
    script: string;
    character_description: string | null;
    product_description: string | null;
    shots: NormalizedShot[];
    ad_copy_primary: string | string[];
    ad_copy_headline: string | string[];
    awareness_level?: string;
    // Pixar-only fields
    theme?: string;
  }

  interface PixarShotRaw {
    character_object: string;
    character_category: string;
    character_mood: string;
    dialogue: string;
    duration_seconds: number;
    character_image_prompt: string;
    veo_prompt: string;
  }

  interface PixarProposalRaw {
    concept_name: string;
    theme: string;
    awareness_level?: string;
    hook_type: string;
    shots: PixarShotRaw[];
    ad_copy_primary: string | string[];
    ad_copy_headline: string | string[];
  }

  interface PixarSingleShotRaw {
    shot_number?: number;
    dialogue: string;
    duration_seconds?: number;
    veo_prompt: string;
  }

  interface PixarSingleProposalRaw {
    concept_name: string;
    theme: string;
    awareness_level?: string;
    hook_type: string;
    character_object: string;
    character_category: string;
    character_mood: string;
    character_image_prompt: string; // SHARED across all shots at concept level
    shots: PixarSingleShotRaw[];
    ad_copy_primary: string | string[];
    ad_copy_headline: string | string[];
  }

  interface UgcProposalRaw {
    concept_name: string;
    format_type: string;
    hook_type: string;
    script_structure: string;
    delivery_style: string;
    script: string;
    character_description: string;
    product_description?: string;
    shots: Array<{
      shot_number: number;
      shot_description: string;
      veo_prompt: string;
      duration_seconds: number;
    }>;
    ad_copy_primary: string | string[];
    ad_copy_headline: string | string[];
    awareness_level?: string;
  }

  let proposal: NormalizedProposal;

  try {
    let cleaned = rawClaude
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const firstBrace = cleaned.indexOf("{");
    if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);
    const lastBrace = cleaned.lastIndexOf("}");
    if (lastBrace >= 0 && lastBrace < cleaned.length - 1) cleaned = cleaned.slice(0, lastBrace + 1);

    const parsed = JSON.parse(cleaned);

    if (isPixarSingleCharacter) {
      // Pixar SINGLE-CHARACTER schema: character_image_prompt at concept level,
      // shared across all shots. Each shot has dialogue + veo_prompt only.
      const raw: PixarSingleProposalRaw = parsed.proposals?.[0] ?? parsed;
      if (!raw?.concept_name || !raw?.shots?.length) {
        throw new Error("Pixar single-character response missing concept_name or shots");
      }
      if (!raw?.character_image_prompt) {
        throw new Error(
          "Pixar single-character response missing character_image_prompt at concept level"
        );
      }

      const sharedImagePrompt = raw.character_image_prompt;

      const fullScript = raw.shots
        .map((s, i) => `[Shot ${i + 1}]\n${s.dialogue}`)
        .join("\n\n");

      proposal = {
        concept_name: raw.concept_name,
        format_type: "pixar_animation",
        hook_type: raw.hook_type || "",
        script_structure: null,
        delivery_style: null,
        script: fullScript,
        character_description: raw.character_object
          ? `${raw.character_object} (${raw.character_category || "object"}, ${raw.character_mood || "neutral"})`
          : null,
        product_description: null,
        shots: raw.shots.map((shot, i) => ({
          shot_number: shot.shot_number ?? i + 1,
          // SAME character_image_prompt for every shot — downstream keyframe
          // generation will produce ONE keyframe and reuse it across shots
          shot_description: sharedImagePrompt,
          veo_prompt: shot.veo_prompt,
          duration_seconds: shot.duration_seconds ?? 8,
        })),
        ad_copy_primary: raw.ad_copy_primary,
        ad_copy_headline: raw.ad_copy_headline,
        awareness_level: raw.awareness_level,
        theme: raw.theme,
      };
    } else if (isPixarMultiCharacter) {
      // Pixar MULTI-CHARACTER schema: each shot has its own character_image_prompt
      const raw: PixarProposalRaw = parsed.proposals?.[0] ?? parsed;
      if (!raw?.concept_name || !raw?.shots?.length) {
        throw new Error("Pixar response missing concept_name or shots");
      }

      // Flatten dialogue into a single script (same pattern used by
      // handleApprovePixar in BrainstormGenerate.tsx)
      const fullScript = raw.shots
        .map(
          (s, i) =>
            `[Shot ${i + 1}: ${s.character_object}]\n${s.dialogue}`
        )
        .join("\n\n");

      proposal = {
        concept_name: raw.concept_name,
        format_type: "pixar_animation",
        hook_type: raw.hook_type || "",
        script_structure: null,
        delivery_style: null,
        script: fullScript,
        character_description: null, // pixar has a different character per shot
        product_description: null,
        shots: raw.shots.map((shot, i) => ({
          shot_number: i + 1,
          // shot_description carries the Pixar character+scene prompt, which the
          // shot-images route will forward raw to Nano Banana when
          // format_type === "pixar_animation"
          shot_description: shot.character_image_prompt,
          veo_prompt: shot.veo_prompt,
          duration_seconds: shot.duration_seconds ?? 8,
        })),
        ad_copy_primary: raw.ad_copy_primary,
        ad_copy_headline: raw.ad_copy_headline,
        awareness_level: raw.awareness_level,
        theme: raw.theme,
      };
    } else {
      // UGC: handle both { proposals: [...] } and direct object
      const raw: UgcProposalRaw = parsed.proposals ? parsed.proposals[0] : parsed;
      if (!raw?.concept_name || !raw?.shots?.length) {
        throw new Error("UGC response missing concept_name or shots");
      }

      proposal = {
        concept_name: raw.concept_name,
        format_type: raw.format_type,
        hook_type: raw.hook_type,
        script_structure: raw.script_structure ?? null,
        delivery_style: raw.delivery_style ?? null,
        script: raw.script ?? "",
        character_description: raw.character_description ?? null,
        product_description: raw.product_description ?? null,
        shots: raw.shots.map((s, i) => ({
          shot_number: s.shot_number ?? i + 1,
          shot_description: s.shot_description,
          veo_prompt: s.veo_prompt,
          duration_seconds: s.duration_seconds ?? 8,
        })),
        ad_copy_primary: raw.ad_copy_primary,
        ad_copy_headline: raw.ad_copy_headline,
        awareness_level: raw.awareness_level,
      };
    }
  } catch (err) {
    console.error(
      "[swipe-video] Failed to parse Claude response:",
      rawClaude.slice(0, 500),
      err
    );
    throw new Error("Failed to parse Claude concept response");
  }

  // Log Claude usage
  await db.from("usage_logs").insert({
    type: "claude_rewrite",
    model: CLAUDE_MODEL,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cost_usd: 0,
    metadata: {
      purpose: "competitor_video_swipe_concept",
      video_job_id: existingJobId,
      brand: brandName,
    },
  });

  if (existingJobId) {
    await updateProgress(
      existingJobId,
      "creating",
      "Creating video concept..."
    );
  }

  // -----------------------------------------------------------------------
  // Step 3: Create video_job + shots
  // -----------------------------------------------------------------------
  const { data: lastJob } = await db
    .from("video_jobs")
    .select("concept_number")
    .eq("workspace_id", workspaceId)
    .not("concept_number", "is", null)
    .order("concept_number", { ascending: false })
    .limit(1)
    .single();

  const nextConceptNumber = ((lastJob?.concept_number as number) ?? 0) + 1;

  // Keyframe reuse strategy:
  //   - UGC: reuse shot 1 (same character across all shots)
  //   - Pixar single-character: reuse shot 1 (same character across all shots)
  //   - Pixar multi-character: individual keyframe per shot (different character each)
  const reuseFirstFrame = !isPixarMultiCharacter;
  const styleNotes = isPixar
    ? JSON.stringify({
        theme: proposal.theme ?? null,
        animation_style: "pixar",
        pixar_mode: isPixarSingleCharacter ? "single_character" : "multi_character",
      })
    : null;

  let videoJobId: string;

  if (existingJobId) {
    await db
      .from("video_jobs")
      .update({
        concept_name: proposal.concept_name,
        concept_number: nextConceptNumber,
        hook_type: proposal.hook_type || null,
        script_structure: proposal.script_structure || null,
        format_type: proposal.format_type || null,
        delivery_style: proposal.delivery_style || null,
        script: proposal.script || null,
        character_description: proposal.character_description || null,
        product_description: proposal.product_description || null,
        ad_copy_primary: Array.isArray(proposal.ad_copy_primary)
          ? proposal.ad_copy_primary
          : [proposal.ad_copy_primary],
        ad_copy_headline: Array.isArray(proposal.ad_copy_headline)
          ? proposal.ad_copy_headline
          : [proposal.ad_copy_headline],
        awareness_level: proposal.awareness_level || null,
        style_notes: styleNotes,
        max_shots: proposal.shots.length,
        reuse_first_frame: reuseFirstFrame,
        status: "draft",
        swipe_progress: {
          step: "generating_images",
          message: "Generating shot keyframes...",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingJobId);
    videoJobId = existingJobId;
  } else {
    const { data: newJob, error: jobErr } = await db
      .from("video_jobs")
      .insert({
        workspace_id: workspaceId,
        product: productSlug,
        concept_name: proposal.concept_name,
        concept_number: nextConceptNumber,
        hook_type: proposal.hook_type || null,
        script_structure: proposal.script_structure || null,
        format_type: proposal.format_type || null,
        delivery_style: proposal.delivery_style || null,
        script: proposal.script || null,
        character_description: proposal.character_description || null,
        product_description: proposal.product_description || null,
        ad_copy_primary: Array.isArray(proposal.ad_copy_primary)
          ? proposal.ad_copy_primary
          : [proposal.ad_copy_primary],
        ad_copy_headline: Array.isArray(proposal.ad_copy_headline)
          ? proposal.ad_copy_headline
          : [proposal.ad_copy_headline],
        awareness_level: proposal.awareness_level || null,
        style_notes: styleNotes,
        status: "draft",
        source: "autopilot",
        pipeline_mode: "multi_clip",
        max_shots: proposal.shots.length,
        reuse_first_frame: reuseFirstFrame,
        target_languages: targetLanguages,
      })
      .select("id")
      .single();

    if (jobErr || !newJob)
      throw new Error(`Failed to create video_job: ${jobErr?.message}`);
    videoJobId = newJob.id;
  }

  // Insert shots
  const shotRows = proposal.shots.map((shot) => ({
    video_job_id: videoJobId,
    shot_number: shot.shot_number,
    shot_description: shot.shot_description,
    veo_prompt: shot.veo_prompt,
    video_duration_seconds: shot.duration_seconds ?? 8,
    image_status: "pending",
  }));

  const { error: shotsErr } = await db.from("video_shots").insert(shotRows);
  if (shotsErr) {
    console.error("[swipe-video] Failed to insert shots:", shotsErr);
  }

  // Auto-assign landing page
  const landingPageId = await findBestLandingPage(
    db,
    workspaceId,
    productSlug,
    { conceptName: proposal.concept_name }
  );
  if (landingPageId) {
    await db
      .from("video_jobs")
      .update({ landing_page_id: landingPageId })
      .eq("id", videoJobId);
  }

  // -----------------------------------------------------------------------
  // Step 4: Auto-generate shot keyframe images
  //   - UGC: generate shot 1 (with iPhone wrapper), reuse across all shots
  //   - Pixar single-character: generate shot 1 (raw prompt, no iPhone wrapper),
  //     reuse across all shots (same character, different camera angles per shot)
  //   - Pixar multi-character: generate ONE keyframe per shot in parallel
  //     (different character per shot), pass shot_description raw to Nano Banana
  // -----------------------------------------------------------------------
  let shotImagesGenerated = 0;

  try {
    // Get the shots we just inserted
    const { data: shots } = await db
      .from("video_shots")
      .select("id, shot_number, shot_description")
      .eq("video_job_id", videoJobId)
      .order("shot_number");

    if (shots && shots.length > 0) {
      if (isPixarMultiCharacter) {
        // PIXAR MULTI-CHARACTER MODE: one keyframe per shot, all in parallel.
        // shot_description already IS the full Pixar character+scene prompt
        // (mapped from character_image_prompt during proposal normalization),
        // so pass it raw — no iPhone wrapper.
        const perShotResults = await Promise.allSettled(
          shots.map(async (shot) => {
            const taskId = await createImageTask(
              shot.shot_description,
              [],
              "2:3",
              "1K"
            );

            await db
              .from("video_shots")
              .update({
                image_kie_task_id: taskId,
                image_status: "generating",
              })
              .eq("id", shot.id);

            const result = await pollTaskResult(taskId);
            if (!result.urls.length) {
              throw new Error(`No image returned for shot ${shot.shot_number}`);
            }

            const imgRes = await fetch(result.urls[0]);
            if (!imgRes.ok) {
              throw new Error(
                `Failed to download image for shot ${shot.shot_number}`
              );
            }
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            const filePath = `video-shots/${videoJobId}/shot-${shot.shot_number}.png`;
            const { error: uploadErr } = await db.storage
              .from(STORAGE_BUCKET)
              .upload(filePath, buffer, {
                contentType: "image/png",
                upsert: true,
              });
            if (uploadErr) throw uploadErr;

            const { data: urlData } = db.storage
              .from(STORAGE_BUCKET)
              .getPublicUrl(filePath);

            await db
              .from("video_shots")
              .update({
                image_url: urlData.publicUrl,
                image_status: "completed",
              })
              .eq("id", shot.id);

            return shot.shot_number;
          })
        );

        shotImagesGenerated = perShotResults.filter(
          (r) => r.status === "fulfilled"
        ).length;

        // Log any shot failures (non-fatal)
        perShotResults.forEach((r, i) => {
          if (r.status === "rejected") {
            console.error(
              `[swipe-video] Pixar keyframe shot ${shots[i].shot_number} failed:`,
              r.reason
            );
          }
        });
      } else {
        // REUSE-FIRST-FRAME MODES: UGC and Pixar single-character
        //   - UGC wraps shot 1 in the format-specific capture style prompt
        //     (selfie / studio / lecture / street / tabletop)
        //   - Pixar single-character passes shot 1 raw (it's already a full
        //     Pixar character+scene prompt mapped from character_image_prompt)
        const firstShot = shots[0];
        const imagePrompt = isPixarSingleCharacter
          ? firstShot.shot_description
          : buildImagePrompt(
              firstShot.shot_description,
              proposal.character_description,
              proposal.product_description ?? null,
              effectiveFormatId
            );

        // Generate keyframe for shot 1
        const taskId = await createImageTask(imagePrompt, [], "2:3", "1K");

        await db
          .from("video_shots")
          .update({ image_kie_task_id: taskId, image_status: "generating" })
          .eq("id", firstShot.id);

        // Mark remaining shots as generating (they'll reuse shot 1)
        for (const shot of shots.slice(1)) {
          await db
            .from("video_shots")
            .update({
              image_kie_task_id: `reuse:${firstShot.id}`,
              image_status: "generating",
            })
            .eq("id", shot.id);
        }

        // Poll for completion
        const result = await pollTaskResult(taskId);

        if (result.urls.length > 0) {
          const imageUrl = result.urls[0];

          // Download and upload to Supabase storage
          const imgRes = await fetch(imageUrl);
          if (imgRes.ok) {
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            const filePath = `video-shots/${videoJobId}/shot-1.png`;

            const { error: uploadErr } = await db.storage
              .from(STORAGE_BUCKET)
              .upload(filePath, buffer, {
                contentType: "image/png",
                upsert: true,
              });

            if (!uploadErr) {
              const { data: urlData } = db.storage
                .from(STORAGE_BUCKET)
                .getPublicUrl(filePath);
              const publicUrl = urlData.publicUrl;

              // Update all shots with the same image (reuse_first_frame)
              for (const shot of shots) {
                await db
                  .from("video_shots")
                  .update({
                    image_url: publicUrl,
                    image_status: "completed",
                  })
                  .eq("id", shot.id);
              }

              shotImagesGenerated = shots.length;
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("[swipe-video] Keyframe generation failed:", err);
    // Non-fatal — concept is still created
  }

  // -----------------------------------------------------------------------
  // Step 5: Auto-translate script to secondary languages
  // (Primary language is already written in the target language by Claude)
  // -----------------------------------------------------------------------
  const secondaryLanguages = targetLanguages.filter((l) => l !== primaryLanguage);
  let translationsCreated = 0;

  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && proposal.script && secondaryLanguages.length > 0) {
      if (existingJobId) {
        await updateProgress(existingJobId, "translating", "Translating script...");
      }

      const openai = new OpenAI({ apiKey: openaiKey });

      // Fetch the shots we just inserted
      const { data: dbShots } = await db
        .from("video_shots")
        .select("shot_number, veo_prompt")
        .eq("video_job_id", videoJobId)
        .order("shot_number");

      for (const lang of secondaryLanguages) {
        try {
          // Build translatable text map
          const translatableTexts: Record<string, string> = {};
          translatableTexts["script"] = proposal.script;

          if (proposal.ad_copy_primary) {
            const copies = Array.isArray(proposal.ad_copy_primary)
              ? proposal.ad_copy_primary
              : [proposal.ad_copy_primary];
            copies.forEach((text: string, i: number) => {
              if (text) translatableTexts[`ad_copy_primary_${i}`] = text;
            });
          }
          if (proposal.ad_copy_headline) {
            const headlines = Array.isArray(proposal.ad_copy_headline)
              ? proposal.ad_copy_headline
              : [proposal.ad_copy_headline];
            headlines.forEach((text: string, i: number) => {
              if (text) translatableTexts[`ad_copy_headline_${i}`] = text;
            });
          }

          for (const shot of dbShots ?? []) {
            const dialogue = extractDialogue(shot.veo_prompt || "");
            if (dialogue) {
              translatableTexts[`shot_${shot.shot_number}_dialogue`] = dialogue;
            }
          }

          const langNames: Record<string, string> = { sv: "Swedish", no: "Norwegian (Bokmål)", da: "Danish" };
          const langNative: Record<string, string> = { sv: "svenska", no: "norsk (bokmål)", da: "dansk" };
          const langCountry: Record<string, string> = { sv: "Sweden", no: "Norway", da: "Denmark" };

          // Fetch target audience from product
          let targetAudience = "women aged 35-55";
          const { data: productData } = await db
            .from("products")
            .select("target_audience")
            .eq("slug", productSlug)
            .single();
          if (productData?.target_audience) targetAudience = productData.target_audience;

          const sourceLangName = langNames[primaryLanguage] || primaryLanguage;
          const systemPrompt = `You are a senior native ${langNames[lang] || lang} (${langNative[lang] || lang}) copywriter who specializes in SPOKEN DIALOGUE for video ads. You understand exactly how real people in ${langCountry[lang] || lang} talk.

TASK:
You receive a JSON object with ${sourceLangName} text values from a video ad script. Translate each value into natural, authentic ${langNames[lang] || lang} AS SPOKEN BY A REAL PERSON.

THIS IS SPOKEN DIALOGUE — not written copy. It must sound like a real ${langNames[lang] || lang} person naturally speaks.

TARGET AUDIENCE: ${targetAudience}

KEY PRINCIPLES:
1) Translate how a real ${langNames[lang] || lang}-speaking woman in the target demographic would ACTUALLY SAY this — warm, genuine, relatable. NOT how a 20-year-old would say it.
2) Use VERY FEW filler words. An occasional "vet du" or "faktiskt" is fine, but do NOT overuse casual fillers like "typ", "liksom", "alltså", "sjukt". The speaker should sound mature and trustworthy, not like she's texting a friend.
3) Keep sentences SHORT and conversational but articulate.
4) Avoid literal translations that sound "dubbed". Rewrite completely if a direct translation sounds stiff.
5) The tone is warm, knowledgeable, and encouraging — like a trusted friend who happens to know a lot about the topic. NOT salesy, NOT hyper-casual.
6) Keep delivery notes in [brackets] in English as-is.
7) Keep pauses (...) and self-corrections as they are.
8) Keep [SHOT 1], [SHOT 2] etc. markers exactly as-is.
9) Preserve meaning and sales intent 1:1, but the WAY it's said must be 100% natural ${langNames[lang] || lang}.

${formatRules()}

Keep brand names unchanged: HappySleep, Hydro13, SwedishBalance, Nordic Cradle, Hälsobladet, Renew.
Keep person/character names exactly as-is.

OUTPUT:
Return ONLY valid JSON with the same keys as input and translated ${langNames[lang] || lang} values.
No explanations, no comments, no extra keys.`;

          const response = await openai.chat.completions.create({
            model: OPENAI_MODEL,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: JSON.stringify(translatableTexts) },
            ],
            response_format: { type: "json_object" },
            temperature: 0.3,
          });

          const content = response.choices[0]?.message?.content;
          if (!content) continue;

          const translated = JSON.parse(content) as Record<string, string>;

          const translatedShots = (dbShots ?? []).map((shot) => {
            const translatedDialogue = translated[`shot_${shot.shot_number}_dialogue`] || "";
            const translatedVeoPrompt = translatedDialogue
              ? replaceDialogue(shot.veo_prompt || "", translatedDialogue)
              : shot.veo_prompt || "";
            return {
              shot_number: shot.shot_number,
              translated_dialogue: translatedDialogue,
              translated_veo_prompt: translatedVeoPrompt,
            };
          });

          await db.from("video_translations").insert({
            video_job_id: videoJobId,
            language: lang,
            translated_script: translated["script"] || null,
            translated_sora_prompt: null,
            translated_shots: translatedShots,
            status: "completed",
          });

          translationsCreated++;
        } catch (err) {
          console.error(`[swipe-video] Translation to ${lang} failed:`, err);
        }
      }
    }
  } catch (err) {
    console.error("[swipe-video] Auto-translation failed:", err);
    // Non-fatal — concept is still usable
  }

  // Update job status
  await db
    .from("video_jobs")
    .update({
      status: translationsCreated > 0 ? "translated" : "generated",
      swipe_progress: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", videoJobId);

  // -----------------------------------------------------------------------
  // Step 6: Telegram notification
  // -----------------------------------------------------------------------
  if (notifyTelegram) {
    const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
    if (chatId) {
      const hubUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        "https://content-hub-nine-theta.vercel.app";

      const caption = [
        `🎬 Video Swipe #${nextConceptNumber}:`,
        ``,
        `"${proposal.concept_name}"`,
        `From: ${brandName}`,
        `Format: ${proposal.format_type} | Hook: ${proposal.hook_type}`,
        `Shots: ${proposal.shots.length} | Images: ${shotImagesGenerated}/${proposal.shots.length}`,
        ``,
        `${hubUrl}/video-ads/${videoJobId}`,
        `Review: ${hubUrl}/review?highlight=${videoJobId}`,
      ].join("\n");

      const buttons = [
        [
          {
            text: "\u2705 Approve",
            callback_data: `video_approve:${videoJobId}`,
          },
          {
            text: "\u274c Reject",
            callback_data: `video_reject:${videoJobId}`,
          },
        ],
      ];

      // Send all unique keyframe images as album, then buttons as follow-up
      try {
        const { data: shots } = await db
          .from("video_shots")
          .select("image_url, shot_number")
          .eq("video_job_id", videoJobId)
          .not("image_url", "is", null)
          .order("shot_number");

        // Deduplicate URLs (reuse_first_frame mode = all shots share same image)
        const uniqueUrls = [...new Set((shots ?? []).map((s) => s.image_url as string))];

        if (uniqueUrls.length > 1) {
          await sendMediaGroup(chatId, uniqueUrls, caption);
          await sendMessageWithInlineKeyboard(
            chatId,
            `Approve video #${nextConceptNumber}?`,
            buttons
          );
        } else if (uniqueUrls.length === 1) {
          await sendPhoto(chatId, uniqueUrls[0], caption, buttons);
        } else {
          await sendMessageWithInlineKeyboard(chatId, caption, buttons);
        }
      } catch {
        await sendMessageWithInlineKeyboard(chatId, caption, buttons);
      }
    }
  }

  return {
    videoJobId,
    conceptName: proposal.concept_name,
    shotsCreated: proposal.shots.length,
    shotImagesGenerated,
  };
}
