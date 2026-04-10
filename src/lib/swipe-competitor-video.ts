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
  getFormatFamily,
  type SwipeVideoFormatId,
} from "@/lib/video-format-aesthetics";
import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VideoSwipeStyle = "ugc" | "pixar_animation";

/**
 * Mode toggles the shot-structure strategy for UGC swipes.
 * - "simple" (default): classic 3-8 shot structure, one continuous take with
 *   minimal angle variation, reuses shot 1 keyframe in the selfie case.
 * - "multicut": Franky Shaw-style rapid-cut edit — ~10 shots per concept,
 *   mixes dialogue beats with silent reaction/b-roll shots, designed to be
 *   clipped down in CapCut into a heavily edited video. Pixar ignores this.
 */
export type VideoMode = "simple" | "multicut";

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
  /**
   * Shot-structure mode for UGC swipes. Defaults to "simple". "multicut"
   * produces ~10 shots with speaker/shot_type metadata + reaction shots for
   * Franky Shaw-style rapid-cut editing. Pixar ignores this.
   */
  videoMode?: VideoMode;
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
  "character_count": 1,
  "character_description": "DETAILED character blueprint: approximate age, gender, ethnicity, hair style/color/length, eye color/shape, facial features (jawline, nose, skin tone/texture with visible pores and imperfections), build/posture, clothing (exact colors and style), accessories, mannerisms, emotional baseline, voice characteristics. Be extremely specific — enough to recreate this person in AI. If there are MULTIPLE distinct people in the video (e.g. 2 podcast hosts, interviewer + interviewee, multiple street interview subjects), describe EACH of them one after the other, labelled clearly: 'Person 1: ... Person 2: ...'.",
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
- **character_count** must reflect the EXACT number of distinct people visible ON camera throughout the whole video. A single person filmed from multiple angles is 1. A podcast with two hosts sitting at the same desk is 2. A street-interview montage with 4 different passersby is 4. A monologue where the camera cuts between the speaker and their laptop is still 1. Do NOT count people in the background unless they speak or are clearly part of the ad. Be literal — if only ONE person ever appears on screen, write 1, even if the format is "podcast".
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
9. **NO CTAs in dialogue** — NEVER have the character say "klicka nedan", "köp nu", "länk i bio", "beställ här", "click below", or any call-to-action. This is a VIDEO AD, not a webpage. The ad copy and landing page handle CTAs.

## IS THIS CHARACTER OUR PRODUCT? (is_product_character flag)
Your single Pixar character CAN be an anthropomorphic version of OUR product itself — for example a talking bottle that IS the actual supplement. When the character you pick is meant to represent OUR product (not a generic bottle, not a body part, not a competitor), set \`is_product_character: true\` at the concept level. This tells the image generator to use the real product photo as a visual anchor so the cartoon character matches the product's real shape, color, and label. Set it to \`false\` when the character is a body part, a generic object, or anything that isn't literally our product. Default: false. ONLY set it to true when the character IS our product.

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
- NEVER include CTA buttons, UI elements, text overlays, banners, or web interface elements in image prompts — no "call to action", "buy now", "click here" buttons. The image is a Pixar CHARACTER in a SCENE, not a web page or ad mockup.

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
      "is_product_character": false,
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
// Pixar "is this character the product?" helper
// ---------------------------------------------------------------------------
//
// When a Pixar shot is an anthropomorphic version of OUR product (e.g. the
// Hydro13 bottle as a talking character), Nano Banana needs the real product
// hero image as a visual anchor — otherwise it invents a generic cartoon
// bottle with the wrong shape/color/label. Claude tells us via the
// `is_product_character` flag in the shot schema, but we also do a string
// heuristic as a fallback in case the flag is missing.
function looksLikeProductCharacter(
  characterObject: string | null | undefined,
  shotDescription: string | null | undefined,
  productName: string | null | undefined,
  productSlug: string | null | undefined
): boolean {
  const haystack = `${characterObject || ""} ${shotDescription || ""}`.toLowerCase();
  if (!haystack.trim()) return false;

  // Direct product name / slug match
  const productCandidates: string[] = [];
  if (productName) productCandidates.push(productName.toLowerCase());
  if (productSlug) productCandidates.push(productSlug.toLowerCase());
  for (const name of productCandidates) {
    if (name && name.length >= 3 && haystack.includes(name)) return true;
  }

  // Generic "supplement bottle" / "product bottle" cues from the character
  // library. The character_object field is what Claude picks from the library
  // — if it's "supplement bottle" or the description says "the product
  // itself", treat it as a product character.
  const genericProductCues = [
    "supplement bottle",
    "supplement",
    "the product",
    "our product",
    "the bottle",
    "product bottle",
    "hero bottle",
  ];
  const objectLower = (characterObject || "").toLowerCase();
  for (const cue of genericProductCues) {
    if (objectLower === cue || objectLower.includes(cue)) return true;
  }
  return false;
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

  // Shot-structure mode. Pixar always acts as "simple" internally.
  const videoMode: VideoMode = !isPixar && input.videoMode === "multicut" ? "multicut" : "simple";
  const isMultiCut = videoMode === "multicut";
  // 10 shots × 8s = 80s of raw material per concept. User clips down in CapCut.
  const MULTICUT_SHOT_COUNT = 10;

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
    character_count?: number;
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

  // UGC character count drives both:
  //   - Claude prompt constraint ("write exactly N distinct characters")
  //   - Keyframe generation strategy (reuse first frame vs per-shot)
  // Gemini is instructed to count distinct people literally. Fall back to 1
  // if the field is missing or garbage so the default path stays sane.
  const rawUgcCount = ugcAnalysis?.character_count;
  const ugcCharacterCount: number =
    typeof rawUgcCount === "number" && rawUgcCount >= 1 && rawUgcCount <= 20
      ? Math.round(rawUgcCount)
      : 1;

  // Effective format ID used for format-aware keyframe + Claude prompt:
  //   1. Explicit user override wins (formatOverride)
  //   2. Otherwise, use the format Gemini detected in the competitor video
  //   3. Pixar ignores this entirely (its keyframe path doesn't call buildImagePrompt)
  const effectiveFormatId: string | null = isPixar
    ? null
    : formatOverride || ugcAnalysis?.format_type || null;

  // UGC multi-shot mode: per-shot keyframe generation (instead of reusing
  // shot 1). Triggered when any of:
  //   - multi-cut mode is on (Franky Shaw-style edit needs varying framings)
  //   - multiple distinct characters (podcast with 2 hosts, street-interview
  //     montage, before/after with different scenes, etc.)
  //   - a non-selfie format family (studio/lecture/street/tabletop), which
  //     typically has camera cuts between angles, so a single starting frame
  //     can't match every shot's framing.
  // Pure selfie-family single-character clips in simple mode still reuse
  // shot 1 — that's the one case where one keyframe legitimately carries
  // all shots.
  const formatFamily = !isPixar ? getFormatFamily(effectiveFormatId) : null;
  const isUgcMultiShot =
    !isPixar &&
    !!ugcAnalysis &&
    (isMultiCut ||
      ugcCharacterCount > 1 ||
      (formatFamily !== null && formatFamily !== "selfie"));

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

  // Fetch the real product hero images. For Pixar concepts where a shot's
  // character IS our product (anthropomorphic bottle/tub/etc), we pass these
  // to Nano Banana as image_input so the generated cartoon character matches
  // the real product's shape, color, label, and proportions. Without this
  // anchor, Nano Banana invents a generic cartoon bottle that looks nothing
  // like the real thing (verified bug on Hydro13 Pixar swipe).
  const { data: productRow } = await db
    .from("products")
    .select("id, name")
    .eq("slug", productSlug)
    .maybeSingle();

  let productHeroUrls: string[] = [];
  const productName: string = (productRow?.name as string | undefined) || productSlug;
  if (productRow?.id) {
    const { data: productImages } = await db
      .from("product_images")
      .select("url, category, sort_order")
      .eq("product_id", productRow.id)
      .order("sort_order", { ascending: true });

    productHeroUrls = (productImages ?? [])
      .filter((i) => i.category === "product" || i.category === "hero")
      .slice(0, 3)
      .map((i) => i.url as string);
  }

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

Create exactly 1 adapted Pixar-style SINGLE-CHARACTER monologue video concept for OUR product. Follow the competitor's narrative arc **beat-by-beat**:

1. **Same hook structure** — if they open with a confrontational question, you open with a confrontational question about OUR product's problem space
2. **Same persuasion flow** — mirror the sequence (e.g. problem reveal → stat → consequence → solution tease)
3. **Same emotional arc** — match their tone shifts (sassy → serious → hopeful)
4. **Same number of beats** — if their monologue has 4 distinct beats, yours should too
5. **Adapt the CONTENT, not the STRUCTURE** — replace their claims with equivalent claims for OUR product, keeping the rhetorical framework

Choose ONE character (body part, object, or anthropomorphic thing) that relates to OUR product's problem.
Split the monologue into 3-5 shots of 8 seconds each.
Same character, same base environment across all shots - only camera framing changes.
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

Create exactly 1 adapted Pixar-style talking-object video concept for OUR product by following the competitor's narrative **beat-by-beat**:

1. **Same hook structure** — mirror the opening hook pattern adapted for OUR product
2. **Same persuasion flow** — if they go "problem → stat → consequence → solution", yours must follow the same sequence
3. **Same emotional arc** — match their tone shifts across characters
4. **Same number of characters** — keep ${pixarAnalysis.characters.length} characters when possible, adjust to 3-5 if needed
5. **Same theme structure** — if they have characters "testifying" about problems, yours should too (just different problems relevant to OUR product)
6. **Adapt the CONTENT, not the STRUCTURE** — replace their claims with equivalent claims for OUR product, keeping the rhetorical framework identical
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

    // CRITICAL character-count enforcement. Without this block Claude
    // hallucinates extra hosts (e.g. a single-host podcast becomes 2 hosts
    // in the adapted concept). Gemini counts distinct people literally, and
    // we force Claude to match that number exactly.
    const characterCountLine =
      ugcCharacterCount === 1
        ? `**NUMBER OF PEOPLE ON CAMERA**: 1 (ONE person only — a monologue / solo presenter)`
        : `**NUMBER OF PEOPLE ON CAMERA**: ${ugcCharacterCount} distinct people`;
    const characterCountEnforcement =
      ugcCharacterCount === 1
        ? `\n\n## CHARACTER COUNT (STRICTLY ENFORCED)\n\nThe source video shows exactly **ONE (1) person** on camera. This is NOT negotiable. Your adapted concept MUST have exactly ONE person in every shot. Do NOT write concepts with 2 hosts, an interviewer and interviewee, or multiple characters — even if the format is "podcast_clip" or "street_interview". A podcast with one host is a SOLO MONOLOGUE. A street interview with one answer is ONE person talking off-camera to a hidden interviewer.\n\n- character_description must describe exactly ONE person.\n- Every shot_description must show the SAME single person (possibly from different angles or framings).\n- Every veo_prompt must have the SAME single character. No second host. No second interviewee. No split-screen partner.\n- If you feel the urge to add a second person, STOP and write the shot with just the original person instead.`
        : `\n\n## CHARACTER COUNT (STRICTLY ENFORCED)\n\nThe source video shows exactly **${ugcCharacterCount} distinct people** on camera. Your adapted concept MUST have exactly ${ugcCharacterCount} distinct characters — not more, not fewer.\n\n- character_description must describe ALL ${ugcCharacterCount} people in detail, labelled 'Person 1: ... Person 2: ...'.\n- Each shot_description should specify WHICH person (or people) is visible in that shot, along with the camera framing for that specific shot. Different shots may focus on different people.\n- Each veo_prompt must describe the correct person for its shot (use consistent descriptions across shots for the same person so they look identical).\n- Do NOT add extra characters beyond the ${ugcCharacterCount} in the source. Do NOT drop any.`;

    // Multi-shot guidance: when we're going to generate ONE keyframe per shot
    // (podcast/lecture/street/tabletop OR any multi-character UGC), tell
    // Claude to write each shot_description as a STANDALONE image prompt
    // that captures that shot's specific character, angle, and framing.
    const multiShotGuidance = isUgcMultiShot
      ? `\n\n## PER-SHOT KEYFRAMES (IMPORTANT)\n\nThis concept will be rendered with **one keyframe per shot** (not a single reused starting frame). That means each shot's \`shot_description\` must be a COMPLETE, STANDALONE image prompt that describes:\n\n1. **Which character** is in the frame (${ugcCharacterCount > 1 ? `specify Person 1 / Person 2 / etc. — different shots may show different people` : "the single character, possibly from a different angle than the previous shot"})\n2. **Camera framing** for THIS specific shot (wide establishing, medium, close-up, over-the-shoulder, low angle, etc.)\n3. **Environment / background** matching the format family\n4. **Pose and expression** at the exact moment the shot begins (static resting pose, first frame of the clip)\n\nWrite each shot_description as if it's the ONLY image you're generating — do not assume any context from previous shots. Each shot gets its own AI-generated keyframe so dramatic camera cuts, different characters, and different framings all work cleanly.`
      : `\n\n## SINGLE KEYFRAME REUSE (IMPORTANT)\n\nThis is a selfie-family single-person clip, so we will render **one keyframe** from shot 1's description and reuse it as the starting frame for every shot. That means:\n\n- Shot 1's \`shot_description\` sets the visual — it must fully describe the character, environment, framing, and resting pose.\n- Subsequent shots share the same starting frame, so keep the character and environment consistent. Camera motion and expression changes happen INSIDE each VEO clip starting from that shared frame.\n- Do NOT describe dramatically different camera angles per shot — a reused single frame cannot support hard cuts.`;

    // Multi-cut guidance (Franky Shaw-style rapid cut edit):
    // - Exactly 10 shots (80s total raw material) to clip down in CapCut
    // - Mix dialogue beats with silent reaction/b-roll shots for natural cuts
    // - Per-shot speaker + shot_type metadata tags every shot so post-production
    //   knows which clips are dialogue vs reactions vs b-roll
    // - Overrides the normal 3-8 shot count when enabled
    const multiCutGuidance = isMultiCut
      ? `\n\n## MULTI-CUT MODE (FRANKY SHAW-STYLE RAPID EDIT)\n\nThis concept will be edited as a **heavily-cut rapid-edit video** — NOT a single continuous take. You MUST generate exactly **${MULTICUT_SHOT_COUNT} shots** instead of the default 3-8. These 10 shots give the editor 80 seconds of raw material to clip down into a final ~20-40s edited video with rapid cuts every 1-3 seconds.\n\n### STRUCTURE REQUIREMENTS\n\n1. **Exactly ${MULTICUT_SHOT_COUNT} shots total** — not fewer, not more.\n2. **Mix of dialogue and silent shots**. Aim for roughly:\n   - 6-7 **dialogue shots** — the character speaking a beat of the script\n   - 2-3 **reaction shots** — silent clips with no dialogue (thinking, sighing, eye roll, looking away, subtle facial expression, a beat of laughter with no words)\n   - 0-1 **b-roll shots** — silent hands-on-product, pour shot, close-up of the bottle, environmental detail\n3. **Each shot must include two new metadata fields**:\n   - \`speaker\`: "a" | "b" | "voiceover"  (use "a" for the primary person, "b" only if there's a second character, "voiceover" for b-roll shots with narration)\n   - \`shot_type\`: "dialogue" | "reaction" | "broll"  (dialogue = person is speaking, reaction = silent facial beat, broll = no person in frame)\n4. **Reaction and b-roll shots have NO dialogue**. Set their \`dialogue\` / script beat to an empty string "" and describe the silent action in \`shot_description\` and \`veo_prompt\` instead (e.g. "character pauses, looks away, sighs" or "close-up of hands pouring the product into a glass").\n5. **Angle and framing variety**. Every shot must be a different camera framing or angle — close-up, medium, over-the-shoulder, low angle, high angle, from the side, etc. This gives the editor material to cut between. Even within the same character and environment, shift the framing every shot.\n6. **Dialogue shots still follow the 15-word max rule**. Reaction and b-roll shots are silent so they have no word limit.\n7. **Narrative order matters**. Write the shots in the intended playback order — the editor can trim or reorder but your sequence should make narrative sense end-to-end.\n8. **Add the fields to every shot in the JSON output**, including shots that already had them. Example shot object:\n\n\`\`\`json\n{\n  "shot_number": 1,\n  "shot_type": "dialogue",\n  "speaker": "a",\n  "shot_description": "...",\n  "veo_prompt": "...",\n  "duration_seconds": 8\n}\n\`\`\`\n\nFor reaction / b-roll shots, still include shot_description and veo_prompt but the VEO prompt should describe silent motion only (no "says:" block). Reaction shot example:\n\n\`\`\`json\n{\n  "shot_number": 4,\n  "shot_type": "reaction",\n  "speaker": "a",\n  "shot_description": "Close-up of the character's face. They stop talking, look down, sigh. Natural lighting, messy bedroom background blurred. First frame: mouth closed, eyes slightly downcast.",\n  "veo_prompt": "Close-up portrait, 50mm lens, natural window light. Character pauses mid-thought, exhales softly, looks down at their hands. No dialogue. Subtle facial movement only. 8 seconds.",\n  "duration_seconds": 8\n}\n\`\`\``
      : "";

    userPrompt = `A competitor video ad was analyzed by watching the actual video with AI:

## COMPETITOR VIDEO ANALYSIS

**TRANSCRIPT** (word-for-word with emotional annotations):
"${ugcAnalysis.transcript || "(no spoken dialogue)"}"

**HOOK (first 3 seconds)**: ${ugcAnalysis.hook_first_3_seconds || "N/A"}
**BIG IDEA**: ${ugcAnalysis.big_idea || "N/A"}
${formatLine}
**SCRIPT STRUCTURE**: ${ugcAnalysis.script_structure}
${characterCountLine}
**CHARACTER**: ${ugcAnalysis.character_description}
**SETTING**: ${ugcAnalysis.setting}
**CAMERA**: ${ugcAnalysis.camera_setup} | **DEVICE**: ${ugcAnalysis.implied_device || "iPhone"}
**LIGHTING**: ${ugcAnalysis.lighting_analysis || "N/A"}
**AUDIO**: ${ugcAnalysis.audio_environment || "N/A"}
**PRODUCT INTERACTION**: ${ugcAnalysis.product_interaction || "N/A"}
**DURATION**: ~${ugcAnalysis.duration_seconds || videoDuration || 15}s

**WHY IT WORKS**: ${ugcAnalysis.why_it_works || ugcAnalysis.persuasion_analysis}
**PERSUASION ANALYSIS**: ${ugcAnalysis.persuasion_analysis}

${competitorAdCopy ? `**COMPETITOR AD COPY**: ${competitorAdCopy.slice(0, 1500)}` : ""}${styleNotesBlock}${characterCountEnforcement}${multiShotGuidance}${multiCutGuidance}

## YOUR TASK

Create 1 adapted video concept for our product by following the competitor's script **beat-by-beat**. Your adapted script must mirror the EXACT narrative arc of the original:

1. **Same number of beats** — if the original has 5 distinct narrative beats, yours must have ~5 too (split across shots with the 15-word limit)
2. **Same hook structure** — if the original opens with "Your X might be causing Y", your hook must follow the same "Your [thing] might be [problem]" pattern adapted for our product
3. **Same persuasion flow** — if the original goes "problem reveal → shocking stat → consequence chain → solution tease", yours must follow that EXACT sequence
4. **Same emotional arc** — match the tone shifts (confrontational → educational → empathetic → hopeful)
5. **Adapt the CONTENT, not the STRUCTURE** — replace their product/ingredient claims with equivalent claims about OUR product, but keep the rhetorical framework identical

Think of it like dubbing a movie into another language — the story beats, pacing, and emotional arc stay the same. Only the specific product claims change.

**DO NOT** invent a completely different angle or narrative. If the competitor talks about "skincare routines disrupting skin barrier", your adaptation should talk about the EQUIVALENT problem for our product (e.g. "most collagen supplements can't be absorbed") using the SAME rhetorical structure (e.g. "Your X might be the reason you're Y").${formatOverrideNote}

**LANGUAGE: ${langLabel}** — Write the script, ad_copy_primary, and ad_copy_headline in ${langLabel}. In veo_prompt, keep technical parts (camera, actions) in English but write SPOKEN DIALOGUE (text after "says:") in ${langLabel}.

${aestheticRules}

Each shot's veo_prompt should be a detailed ~300 character Sora 2/VEO-optimized prompt including character/subject description, setting, camera angle, lighting, and specific actions — all matching the format rules above.

**DIALOGUE LENGTH LIMIT (CRITICAL)**: Each shot is exactly 8 seconds of video. Each shot's dialogue must be **MAX 15 words**. COUNT YOUR WORDS — if a shot exceeds 15 words, SPLIT IT into two shots. A calm 12-word sentence with a natural breath beats a rushed 15-word one. NEVER exceed 15 words per shot. This is the #1 cause of broken videos.

${context.existingConcepts.length > 0 ? `### EXISTING CONCEPTS (do NOT duplicate)\n${context.existingConcepts.map((c) => `- ${c}`).join("\n")}` : ""}

${
  isMultiCut
    ? `Generate exactly 1 concept with EXACTLY **${MULTICUT_SHOT_COUNT} shots** (each 8 seconds). Mix dialogue beats with silent reaction/b-roll shots as described in the MULTI-CUT MODE block above. Every shot MUST include the \`speaker\` and \`shot_type\` fields. Dialogue shots max 15 words; reaction/b-roll shots have empty dialogue.`
    : `Generate exactly 1 concept with 3-8 shots (each 8 seconds, **MAX 15 words of dialogue per shot** — count every word). Use MORE shots with less dialogue each. Never exceed 15 words in any shot.`
}
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
    // Multi-cut mode only (null for simple/Pixar):
    speaker?: string | null;
    shot_type?: string | null;
    // Pixar only: true when this shot's character IS our product (an
    // anthropomorphic version of the real bottle/tub/etc). Used to pass
    // product hero images as Nano Banana reference input so the keyframe
    // matches the real product shape/color/label instead of inventing one.
    is_product_character?: boolean;
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
    is_product_character?: boolean;
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
    // Single-character monologues only have one character, so this flag is
    // at concept level (the same character is in every shot).
    is_product_character?: boolean;
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
      // Multi-cut mode only — Claude emits these when isMultiCut=true
      speaker?: string;
      shot_type?: string;
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

      // Pixar single-character has ONE character for the whole concept, so
      // the product-character flag is at concept level. Trust Claude's flag
      // first, then fall back to the string heuristic.
      const singleIsProduct =
        raw.is_product_character === true ||
        looksLikeProductCharacter(
          raw.character_object,
          sharedImagePrompt,
          productName,
          productSlug
        );

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
          is_product_character: singleIsProduct,
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
        shots: raw.shots.map((shot, i) => {
          // Per-shot product-character flag: trust Claude's explicit flag
          // first, fall back to the string heuristic. This is critical when
          // one of the Pixar characters is an anthropomorphic version of OUR
          // product — we need to pass the real product hero image as a Nano
          // Banana reference so the cartoon character matches the real
          // bottle's shape/color/label.
          const isProduct =
            shot.is_product_character === true ||
            looksLikeProductCharacter(
              shot.character_object,
              shot.character_image_prompt,
              productName,
              productSlug
            );
          return {
            shot_number: i + 1,
            // shot_description carries the Pixar character+scene prompt, which the
            // shot-images route will forward raw to Nano Banana when
            // format_type === "pixar_animation"
            shot_description: shot.character_image_prompt,
            veo_prompt: shot.veo_prompt,
            duration_seconds: shot.duration_seconds ?? 8,
            is_product_character: isProduct,
          };
        }),
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
        shots: raw.shots.map((s, i) => {
          // Whitelist + normalize multi-cut metadata so stray values from
          // Claude can't corrupt downstream inserts. Simple mode leaves both
          // fields null so we don't pollute rows with garbage.
          const rawSpeaker = typeof s.speaker === "string" ? s.speaker.trim().toLowerCase() : "";
          const rawShotType = typeof s.shot_type === "string" ? s.shot_type.trim().toLowerCase() : "";
          const speaker = isMultiCut
            ? (["a", "b", "voiceover"].includes(rawSpeaker) ? rawSpeaker : "a")
            : null;
          const shotType = isMultiCut
            ? (["dialogue", "reaction", "broll"].includes(rawShotType) ? rawShotType : "dialogue")
            : null;
          return {
            shot_number: s.shot_number ?? i + 1,
            shot_description: s.shot_description,
            veo_prompt: s.veo_prompt,
            duration_seconds: s.duration_seconds ?? 8,
            speaker,
            shot_type: shotType,
          };
        }),
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

  // Keyframe generation strategy:
  //   - UGC selfie-family + 1 character (simple mode): reuse shot 1 (one
  //     continuous take, minimal angle changes — same starting frame works
  //     for every shot, no per-shot keyframes at all)
  //   - UGC multi-shot (multi-cut OR podcast/lecture/street/tabletop OR >1
  //     character): CHAINED keyframes — generate shot 1 alone, then use its
  //     URL as image_input reference for shots 2..N so the character stays
  //     visually consistent across all shots. reuse_first_frame stays false
  //     because each shot gets its own distinct keyframe; the "reuse" term
  //     only applies to the degenerate case where every shot uses the exact
  //     same generated image.
  //   - Pixar single-character: reuse shot 1 (same character across all shots)
  //   - Pixar multi-character: parallel per-shot keyframes, no reference
  //     (different character per shot, nothing to anchor)
  const reuseFirstFrame = !isPixarMultiCharacter && !isUgcMultiShot;
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
        video_mode: videoMode,
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
        video_mode: videoMode,
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
    // Multi-cut mode metadata (null for simple mode / Pixar)
    speaker: shot.speaker ?? null,
    shot_type: shot.shot_type ?? null,
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

    // Map shot_number → is_product_character so the keyframe stage can
    // decide whether to pass productHeroUrls to Nano Banana as an anchor.
    // The normalized proposal carries the flag per shot (set during parse).
    const productFlagByShotNumber = new Map<number, boolean>();
    for (const s of proposal.shots) {
      productFlagByShotNumber.set(s.shot_number, s.is_product_character === true);
    }

    // When a Pixar character IS our product, we prepend an explicit
    // instruction to the prompt so Nano Banana knows to match the real
    // product's shape/color/label from the reference image instead of
    // treating it as a loose style guide.
    const PRODUCT_ANCHOR_PREFIX =
      "The reference image shows the REAL-WORLD product — render a Pixar-style anthropomorphic animated version of THIS exact object, matching its shape, color, label text, and proportions. ";

    if (shots && shots.length > 0) {
      // Helper: run a keyframe task, download the result, upload it to
      // Supabase storage, and update the video_shots row. Used by both the
      // Pixar multi-character path (no reference) and the UGC multi-shot
      // chained path (reference = shot 1 URL).
      async function renderKeyframe(
        shot: { id: string; shot_number: number; shot_description: string },
        prompt: string,
        referenceUrls: string[]
      ): Promise<string> {
        const taskId = await createImageTask(prompt, referenceUrls, "2:3", "1K");
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

        return urlData.publicUrl;
      }

      if (isPixarMultiCharacter) {
        // PIXAR MULTI-CHARACTER: each shot has a DIFFERENT animated character
        // (spine, brain, pillow, etc.), so there's no shared identity to
        // preserve across shots. Generate all shots in parallel.
        //
        // EXCEPT when a shot's character IS our product — then we pass the
        // real product hero images as Nano Banana reference so the cartoon
        // bottle matches the real shape/color/label. This fixes the bug
        // where Hydro13 Pixar concepts rendered a generic blue cartoon
        // bottle that looked nothing like the actual white Hydro13 bottle.
        const perShotResults = await Promise.allSettled(
          shots.map((shot) => {
            const isProductShot =
              productFlagByShotNumber.get(shot.shot_number) === true;
            const refUrls =
              isProductShot && productHeroUrls.length > 0 ? productHeroUrls : [];
            const shotPrompt =
              isProductShot && productHeroUrls.length > 0
                ? PRODUCT_ANCHOR_PREFIX + shot.shot_description
                : shot.shot_description;
            return renderKeyframe(shot, shotPrompt, refUrls);
          })
        );

        shotImagesGenerated = perShotResults.filter(
          (r) => r.status === "fulfilled"
        ).length;

        perShotResults.forEach((r, i) => {
          if (r.status === "rejected") {
            console.error(
              `[swipe-video] Pixar keyframe shot ${shots[i].shot_number} failed:`,
              r.reason
            );
          }
        });
      } else if (isUgcMultiShot) {
        // UGC MULTI-SHOT (multi-cut or podcast/lecture/street/tabletop):
        // SAME character(s) across all shots, only framing/angle changes.
        // Nano Banana will NOT keep a person looking identical across 10
        // independent text-to-image calls from the same description — we've
        // verified this empirically: "Erik" ends up with a different face,
        // hair, and clothes in every shot. The fix is to CHAIN the keyframes:
        //
        //   1. Generate shot 1 alone (no reference) → upload to Supabase
        //   2. Use shot 1's Supabase URL as image_input reference for shots
        //      2..N, generated in parallel.
        //
        // Nano Banana treats the reference image as an identity anchor, so
        // every subsequent shot inherits the same face, clothing, lighting,
        // and environment, while the text prompt dictates the new framing /
        // angle / action for that specific shot.
        const firstShot = shots[0];
        const firstPrompt = buildImagePrompt(
          firstShot.shot_description,
          proposal.character_description,
          proposal.product_description ?? null,
          effectiveFormatId
        );

        let anchorUrl: string | null = null;
        try {
          anchorUrl = await renderKeyframe(firstShot, firstPrompt, []);
          shotImagesGenerated = 1;
        } catch (err) {
          console.error(
            `[swipe-video] UGC multi-shot anchor shot 1 failed:`,
            err
          );
        }

        if (anchorUrl && shots.length > 1) {
          // Parallel generation for shots 2..N using shot 1 as visual anchor.
          // Each shot's prompt still describes its unique framing/action, but
          // Nano Banana uses the reference image to keep the character
          // visually consistent across all shots.
          const remainingShots = shots.slice(1);
          const restResults = await Promise.allSettled(
            remainingShots.map((shot) => {
              const shotPrompt = buildImagePrompt(
                shot.shot_description,
                proposal.character_description,
                proposal.product_description ?? null,
                effectiveFormatId
              );
              // Non-null assertion: we only enter this block when anchorUrl
              // is set (checked above). TypeScript narrows across the await
              // but not inside the .map() callback.
              return renderKeyframe(shot, shotPrompt, [anchorUrl!]);
            })
          );

          shotImagesGenerated += restResults.filter(
            (r) => r.status === "fulfilled"
          ).length;

          restResults.forEach((r, i) => {
            if (r.status === "rejected") {
              console.error(
                `[swipe-video] UGC multi-shot keyframe shot ${remainingShots[i].shot_number} failed:`,
                r.reason
              );
            }
          });
        }
      } else {
        // REUSE-FIRST-FRAME MODES: UGC and Pixar single-character
        //   - UGC wraps shot 1 in the format-specific capture style prompt
        //     (selfie / studio / lecture / street / tabletop)
        //   - Pixar single-character passes shot 1 raw (it's already a full
        //     Pixar character+scene prompt mapped from character_image_prompt)
        const firstShot = shots[0];

        // Pixar single-character: all shots share the same character, so if
        // the concept-level character IS our product, we pass the real
        // product hero images as Nano Banana reference for the keyframe.
        // The flag was propagated onto every shot during normalization, so
        // reading from shot 1 is equivalent to a concept-level check.
        const pixarSingleIsProduct =
          isPixarSingleCharacter &&
          productFlagByShotNumber.get(firstShot.shot_number) === true &&
          productHeroUrls.length > 0;

        const imagePrompt = isPixarSingleCharacter
          ? pixarSingleIsProduct
            ? PRODUCT_ANCHOR_PREFIX + firstShot.shot_description
            : firstShot.shot_description
          : buildImagePrompt(
              firstShot.shot_description,
              proposal.character_description,
              proposal.product_description ?? null,
              effectiveFormatId
            );

        const keyframeRefUrls = pixarSingleIsProduct ? productHeroUrls : [];

        // Generate keyframe for shot 1
        const taskId = await createImageTask(imagePrompt, keyframeRefUrls, "2:3", "1K");

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
