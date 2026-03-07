import OpenAI from "openai";
import { createServerSupabase } from "./supabase";
import { buildLearningsContext, buildHookInspiration } from "./brainstorm";
import { OPENAI_MODEL } from "./constants";
import { formatRules } from "./translation-rules";

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

When generating for Scandinavian markets, adapt the SETTING and CHARACTER but keep ALL text in English:
- **Settings**: Scandinavian apartments (lighter, minimalist), local stores (Coop, ICA, Meny, MAXI)
- **Character**: Match local demographics — Scandinavian names and looks, Nordic features
- **Delivery**: More understated than US-style UGC, less hype, calmer energy
- **Script**: Write ALL dialogue, ad copy, and prompts in ENGLISH. Translation to the target language happens in a separate high-quality translation step.
- **Filler words**: Use natural English filler words (um, like, you know, honestly). These will be replaced with native equivalents during translation.`;

export interface ProductPlacementOptions {
  enabled: boolean;
  style?: string; // "held_in_hand" | "on_table" | "in_background" | "unboxing" | "using_it"
  visual_description?: string; // User-provided visual desc of the product
}

export function buildVideoUgcSystemPrompt(
  product: string,
  productBrief: string,
  guidelines: string,
  hookInspiration: string,
  learningsContext: string,
  existingCharacters: string,
  pipelineMode: string = "multi_clip",
  productPlacement: ProductPlacementOptions = { enabled: false }
): string {
  const outputFormat = `## Output Format

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
      "script": "Full script with [SHOT 1], [SHOT 2], [SHOT 3] markers separating each shot's dialogue. Include filler words, pauses (...), self-corrections, [delivery notes].",
      "character_description": "Millimeter-level detail: [NAME], a [AGE] [ETHNICITY] [GENDER] with [SPECIFIC_HAIR: color, length, texture, style], [EYE_COLOR] [EYE_SHAPE] eyes, [DISTINCTIVE_FACIAL_FEATURES: nose shape, jaw, cheekbones], [SKIN_TONE with imperfections], [BUILD], wearing [EXACT_CLOTHING with colors/patterns], [POSTURE_AND_MANNERISMS], [EMOTIONAL_BASELINE], [ACCESSORIES], [VOICE_CHARACTERISTICS].",
${productPlacement.enabled ? `      "product_description": "Exactly how the physical product looks when held on camera: shape, size, color, material, label details, distinctive features. ~100 words.",` : ""}
      "shots": [
        {
          "shot_number": 1,
          "shot_description": "Detailed Nano Banana image prompt (~300-500 chars) for generating the keyframe still. This is the VISUAL FOUNDATION — everything the video frame should look like. Include: full character appearance, expression, exact environment with clutter, selfie angle, what they're doing/holding. iPhone computational photography style.",
          "veo_prompt": "SHORT video motion prompt (~200-400 chars). Describes ONLY what MOVES and what is SAID. The keyframe image already defines the visual — this prompt only adds motion and dialogue. Format: 'The camera remains static, framed in a [shot type]. The character with [one key visual detail] performs [specific motion]. character says: [dialogue for this shot]'",
          "duration_seconds": 8
        }
      ],
      "ad_copy_primary": "The primary text that appears above the video in the Meta ad",
      "ad_copy_headline": "Short headline for the Meta ad"
    }
  ]
}
\`\`\`

## Multi-Clip Rules

### Shot Structure
- Generate 3-5 shots per concept, each exactly 8 seconds
- First shot = HOOK (stops the scroll). Character must be talking within 0.5 seconds.
${productPlacement.enabled ? `- Last shot = CTA with product clearly visible (described EXACTLY from product_description)` : `- Last shot = CTA — character delivers call to action (no physical product needed)`}
- Each shot is a complete scene — starts and ends at natural pause points, no mid-action cuts

### Character Consistency (CRITICAL)
- The \`character_description\` field must have millimeter-level facial detail: exact hair color/length/texture, eye color/shape, nose shape, jawline, skin tone, build, clothing with colors/patterns. This SAME description is repeated verbatim in EVERY shot's \`shot_description\`.
- The keyframe image (generated from \`shot_description\`) is fed to Veo3 as the starting frame. Veo3 generates the video FROM that image — so the image must be perfect.

### Camera & POV (CRITICAL — This is what makes it look like UGC)
- ALL shots must use the EXACT SAME camera setup: iPhone 15 Pro front camera, selfie angle, arm's length distance
- NEVER vary the camera angle between shots. No wide shots, no close-ups, no over-shoulder, no B-roll. This is one continuous selfie video.
- The person is ALWAYS looking directly into the camera lens (front-camera eye contact)
- Framing: slightly off-center, too much headroom or slightly cropped forehead — imperfect selfie framing

${productPlacement.enabled ? `### Product Accuracy (CRITICAL)
- The \`product_description\` field must describe EXACTLY how the physical product looks based on the product brief
- When the product appears in any shot, use the EXACT product_description — never guess or hallucinate what it looks like
- If the product brief says it's a pillow, it's a pillow. If it's a bottle, it's a bottle. Match reality.` : `### No Product In Frame
- Do NOT show the physical product in any shot. The character talks ABOUT the product/benefit but never holds or displays it.
- Do NOT include a \`product_description\` field.
- This is a pure testimonial/story format — the product is mentioned verbally only.`}

### Anti-AI Rules (Enforce in every shot_description)
1. iPhone aesthetics: Simulate Apple iPhone computational photography: slight wide-angle distortion, flattened midtones, natural shadow noise
2. Imperfect framing: Off-center composition, slightly cropped forehead/shoulder
3. Natural lighting ONLY: Window light, bathroom vanity, car dashboard daylight. NEVER studio lighting
4. Authentic environments: Messy bedrooms, parked cars, bathrooms, kitchen counters. Lived-in details.
5. Hand safety: Hands BELOW collarbone at all times. No gestures near face/lens.
6. Real skin: Visible pores, no smoothing, no beauty filters. Natural shadows.
7. Conversational delivery: Filler words, natural pauses, self-corrections, direct eye contact.

### Shot Descriptions (IMAGE prompts — the visual foundation)
- Each \`shot_description\` is the Nano Banana image prompt that generates the keyframe still
- This is THE MOST IMPORTANT field — it defines what the video frame looks like
- Include: FULL character description (repeated from character_description), expression, exact environment with clutter details, selfie angle, what they're doing/holding
- Style: Authentic iPhone front-camera photo. Real skin texture (pores, creases, uneven tone), casual framing, slightly imperfect crop.
- Exclude: studio lighting, beauty filters, HDR look, symmetry, professional composition
- Target ~300-500 characters per shot_description

### Veo Prompts (VIDEO motion — SHORT, only motion + dialogue)
- CRITICAL: Each \`veo_prompt\` is SHORT (~200-400 chars). It describes ONLY what MOVES and what is SAID.
- The keyframe image (from shot_description) is passed to Veo3 as the starting frame via image-to-video mode. The image already defines what everything LOOKS like.
- The veo_prompt adds ONLY: (1) camera behavior (usually "remains static"), (2) what physical motion the character performs, (3) dialogue.
- Format: "The camera remains static, framed in a [medium close-up/medium shot]. The character with [ONE key visual detail] [performs specific motion: head tilt, slight smile, hand gesture below chest, leans forward]. character says: \\"[exact dialogue for this shot with filler words]\\""
- Do NOT repeat the full scene description, environment, lighting, or cinematography — the image handles all of that.
- Do NOT include UGC keywords, quality negatives, or audio descriptions — keep it focused.
- The \`sora_prompt\` field at the top level can be empty for multi-clip mode
- The \`script\` field should contain the FULL script with [SHOT 1], [SHOT 2] etc. markers`;

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

1. **ANTI-COPYING**: Never use example phrases from this document verbatim. Every hook, script line, and concept must be 100% original. Do not use "2 AM", "ceiling staring", "Okinawan", "Rockefeller", or any other common AI-generated cliche. Do not copy competitor hooks or scripts — invent new ones.
2. **HAND SAFETY**: All scripts must keep character hands below collarbone. No gestures near face or lens. No pointing. Fingers naturally curved and relaxed.
3. **ONE IDEA**: Each video delivers exactly one message. Never combine multiple selling points.
${productPlacement.enabled ? `4. **PRODUCT VISIBLE**: Product must appear naturally in the video. ${
  productPlacement.style === "held_in_hand" ? "Character holds the product at chest level, label visible." :
  productPlacement.style === "on_table" ? "Product is visible on a table/surface near the character." :
  productPlacement.style === "in_background" ? "Product is casually visible in the background of the scene." :
  productPlacement.style === "unboxing" ? "Character opens/unboxes the product during the video." :
  productPlacement.style === "using_it" ? "Character actively uses the product during the video." :
  "Product appears naturally in the scene."
}${productPlacement.visual_description ? ` Physical appearance: ${productPlacement.visual_description}.` : ""}` : `4. **NO FORCED PRODUCT**: This video does NOT show the physical product. The character talks ABOUT the product/benefit but does not hold or display it. This is a pure testimonial/story — no product placement.`}
5. **AUTHENTIC SPEECH**: Include natural filler words ("um", "like", "you know"), pauses (...), self-corrections, mid-thought entries. Never write polished copy — write how a real person talks to their phone camera. Start talking BEFORE they seem ready.
6. **PROMPT DETAIL**: Target ~3000-5000 characters for video prompts. Be extremely detailed about character appearance, cinematography, environment, actions, and dialogue delivery. The more specific, the better the output.
7. **NO AI TELLS**: Never include studio lighting, beauty filters, symmetrical composition, perfect framing, HDR look, oversaturated colors, or smooth skin. Every frame must look like it was captured on an iPhone front camera.

${outputFormat}

Return ONLY valid JSON. No markdown fences. No explanation text.`;
}

interface VideoUgcOptions {
  language?: string;
  format_type?: string;
  hook_type?: string;
  character_description?: string;
  pipeline_mode?: string;
  product_placement?: boolean;
}

const LANGUAGE_LABELS: Record<string, string> = {
  sv: "Swedish",
  no: "Norwegian",
  da: "Danish",
};

export function buildVideoUgcUserPrompt(
  request: string,
  count: number,
  existingConcepts?: string[],
  rejectedConcepts?: string[],
  options?: VideoUgcOptions
): string {
  const lang = options?.language || "sv";
  const langLabel = LANGUAGE_LABELS[lang] || lang;

  let prompt = `Generate ${count} unique UGC video concept${count > 1 ? "s" : ""} for this product.

**LANGUAGE: ENGLISH** — Write ALL text in English: script, sora_prompt, veo_prompt, ad_copy_primary, ad_copy_headline. The script will be translated to ${langLabel} in a separate high-quality translation step.
**TARGET MARKET: ${langLabel}** — Adapt the character, setting, and cultural references for the ${langLabel} market (Scandinavian names, local stores, Nordic apartments). But keep the actual dialogue in English.`;

  if (options?.format_type) {
    prompt += `\n\n**REQUIRED FORMAT**: Use "${options.format_type}" as the format_type. All concepts must use this format.`;
  }

  if (options?.hook_type) {
    prompt += `\n\n**REQUIRED HOOK TYPE**: Use "${options.hook_type}" as the hook_type. All concepts must use this hook approach.`;
  }

  if (options?.character_description) {
    prompt += `\n\n**CHARACTER BRIEF FROM USER**: ${options.character_description}\nUse this as the basis for the character_description. Expand with specific visual details needed for Sora (hair color, eye color, skin tone, clothing details, posture) while keeping the user's intent.`;
  }

  if (request) {
    prompt += `\n\n**CREATIVE DIRECTION**: ${request}`;
  } else {
    prompt += `\n\nCreate fresh video concepts that will stop the scroll and convert.`;
  }

  if (existingConcepts?.length) {
    prompt += `\n\nExisting concepts (DO NOT duplicate these angles):\n${existingConcepts.map((c) => `- ${c}`).join("\n")}`;
  }

  if (rejectedConcepts?.length) {
    prompt += `\n\nRejected concepts (DO NOT use similar approaches):\n${rejectedConcepts.map((c) => `- ${c}`).join("\n")}`;
  }

  prompt += `\n\nEach concept MUST:`;
  if (!options?.format_type && count > 1) {
    prompt += `\n- Use a DIFFERENT format_type from the others`;
  }
  if (!options?.hook_type && count > 1) {
    prompt += `\n- Use a DIFFERENT hook_type from the others`;
  }
  prompt += `
- Have a completely original hook that doesn't repeat any example phrases
- Include a full script in ENGLISH with natural speech patterns, filler words, and delivery notes
- Include detailed shot_description image prompts and SHORT veo_prompt motion prompts per shot
- Include ad copy in ENGLISH (primary text + headline) for the Meta ad
- Split the concept into 3-5 shots (each 8 seconds) with individual shot_description and veo_prompt per shot
- Each shot_description is a DETAILED Nano Banana iPhone-style image prompt (~300-500 chars) — this is the VISUAL FOUNDATION of the video frame
- Each veo_prompt is SHORT (~200-400 chars) — ONLY describes what MOVES and what is SAID. The keyframe image handles all visuals.
- veo_prompt format: "The camera remains static, framed in a [shot type]. The character with [one key detail] [performs motion]. character says: \\"[dialogue]\\""
- SAME selfie camera angle in EVERY shot — never vary camera position, angle, or distance
- Repeat FULL character_description in every shot_description (NOT in veo_prompt — the image handles character appearance)`;
  if (options?.product_placement) {
    prompt += `
- Include a \`product_description\` field with the EXACT physical appearance of the product (~100 words)
- Product shown in the video must match EXACTLY what the product brief describes`;
  } else {
    prompt += `
- Do NOT show the physical product in any shot — character talks about the product/benefit verbally only
- Do NOT include a product_description field`;
  }

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
    ? [
        `Product: ${productData.name}`,
        productData.tagline ? `Tagline: ${productData.tagline}` : null,
        productData.description ? `Description: ${productData.description}` : null,
        productData.benefits?.length ? `Benefits: ${(productData.benefits as string[]).join("; ")}` : null,
        productData.usps?.length ? `USPs: ${(productData.usps as string[]).join("; ")}` : null,
      ].filter(Boolean).join("\n")
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

// ---------------------------------------------------------------------------
// Two-pass translation: English proposals → native-language scripts
// ---------------------------------------------------------------------------

const LANGUAGE_NAMES_NATIVE: Record<string, string> = {
  sv: "svenska",
  no: "norsk (bokmål)",
  da: "dansk",
};

const LANGUAGE_NAMES_EN: Record<string, string> = {
  sv: "Swedish",
  no: "Norwegian (Bokmål)",
  da: "Danish",
};

const COUNTRIES: Record<string, string> = {
  sv: "Sweden",
  no: "Norway",
  da: "Denmark",
};

const FILLER_WORDS: Record<string, string> = {
  sv: '"liksom", "vet du", "men", "faktiskt", "alltså" (sparingly), "asså" (sparingly)',
  no: '"liksom", "altså", "på en måte", "vet du", "egentlig"',
  da: '"altså", "liksom", "ikke", "jo", "bare"',
};

function buildVideoTranslationPrompt(language: string): string {
  const langName = LANGUAGE_NAMES_EN[language] || language;
  const langNative = LANGUAGE_NAMES_NATIVE[language] || language;
  const country = COUNTRIES[language] || language;
  const fillers = FILLER_WORDS[language] || '"um", "like"';

  return `DU ÄR: A senior native ${langName} (${langNative}) copywriter who specializes in SPOKEN DIALOGUE for video ads. You understand exactly how real people in ${country} talk — not how they write.

TASK:
You receive a JSON object with English text values from a UGC video ad script. Translate each value into natural, authentic ${langName} AS SPOKEN BY A REAL PERSON talking to their phone camera.

THIS IS NOT WRITTEN COPY — THIS IS SPOKEN DIALOGUE. The person is casually talking to their front camera like they're telling a friend something. It must sound like a real ${langName} person naturally speaks.

KEY PRINCIPLES:
1) This is a SPOKEN monologue, not written text. Translate how a 30-year-old in ${country} would ACTUALLY SAY this to their friend.
2) Use native ${langName} filler words: ${fillers}. Replace English filler words (um, like, you know) with natural ${langName} equivalents.
3) Keep sentences SHORT and conversational. Real people don't speak in complex sentences.
4) Avoid literal translations that sound "dubbed". If a direct translation sounds stiff, rewrite it completely to convey the same meaning naturally.
5) No teen slang. No Gen Z style. Target age ~30-50. AVOID overusing "typ" and "alltså" — these are mostly used by younger generations. Use them VERY sparingly (max 1-2 times total). Prefer mature filler words like "liksom", "vet du", "men", "faktiskt".
6) The tone should match the delivery notes in [brackets] — keep those in English as-is.
7) Keep pauses (...) and self-corrections as they are — they're part of the natural speech pattern.
8) Keep [SHOT 1], [SHOT 2] etc. markers exactly as-is.
9) Preserve meaning and sales intent 1:1, but the WAY it's said must be 100% natural ${langName}.
10) Never use hyphens in spoken dialogue.

WHAT SOUNDS "DUBBED" (AVOID):
- Translating English idioms word-for-word
- Using formal/written ${langName} instead of casual spoken ${langName}
- Keeping English sentence structure when ${langName} would naturally reorder
- Using "big words" when a simple everyday word exists
- Sounding like a textbook or news anchor instead of a real person

QUALITY CHECK (do silently):
- Read it out loud in your head. Does it sound like a real person talking to their phone?
- Would a ${langName} native scroll past thinking "that's obviously translated"?
- Is every sentence something a real person would actually say out loud?

ADDITIONAL RULES:
${formatRules()}

Keep brand names unchanged: HappySleep, Hydro13, SwedishBalance, Nordic Cradle, HappySleep Ergo, Hälsobladet.
Keep person/character names exactly as-is — do NOT rename them.

OUTPUT:
Return ONLY valid JSON with the same keys as input and translated ${langName} values.
No explanations, no comments, no extra keys.`;
}

interface VideoProposal {
  script?: string;
  ad_copy_primary?: string;
  ad_copy_headline?: string;
  sora_prompt?: string;
  shots?: Array<{
    shot_number: number;
    shot_description: string;
    veo_prompt: string;
    duration_seconds: number;
  }>;
  [key: string]: unknown;
}

/**
 * Translate video proposal scripts from English to the target language.
 * Uses a custom spoken-dialogue translation prompt optimized for UGC video scripts.
 *
 * Translates: script, ad_copy_primary, ad_copy_headline, and dialogue in veo_prompts.
 * Keeps in English: shot_description, character_description, sora_prompt (technical prompts).
 */
export async function translateVideoProposals(
  proposals: VideoProposal[],
  language: string,
): Promise<{ proposals: VideoProposal[]; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const client = new OpenAI({ apiKey });
  const systemPrompt = buildVideoTranslationPrompt(language);

  // Build a flat key→value map of all translatable strings across all proposals
  const translatableTexts: Record<string, string> = {};

  for (let i = 0; i < proposals.length; i++) {
    const p = proposals[i];
    if (p.script) translatableTexts[`p${i}_script`] = p.script;
    if (p.ad_copy_primary) translatableTexts[`p${i}_ad_copy_primary`] = String(p.ad_copy_primary);
    if (p.ad_copy_headline) translatableTexts[`p${i}_ad_copy_headline`] = String(p.ad_copy_headline);

    // Extract dialogue from each shot's veo_prompt
    if (p.shots) {
      for (const shot of p.shots) {
        const dialogue = extractDialogue(shot.veo_prompt);
        if (dialogue) {
          translatableTexts[`p${i}_shot${shot.shot_number}_dialogue`] = dialogue;
        }
      }
    }
  }

  if (Object.keys(translatableTexts).length === 0) {
    return { proposals, inputTokens: 0, outputTokens: 0 };
  }

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(translatableTexts) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No translation response from GPT");

  const translated = JSON.parse(content) as Record<string, string>;

  // Apply translations back to proposals
  const result = proposals.map((p, i) => {
    const updated = { ...p };
    if (translated[`p${i}_script`]) updated.script = translated[`p${i}_script`];
    if (translated[`p${i}_ad_copy_primary`]) updated.ad_copy_primary = translated[`p${i}_ad_copy_primary`];
    if (translated[`p${i}_ad_copy_headline`]) updated.ad_copy_headline = translated[`p${i}_ad_copy_headline`];

    // Inject translated dialogue back into veo_prompts
    if (updated.shots) {
      updated.shots = updated.shots.map((shot) => {
        const translatedDialogue = translated[`p${i}_shot${shot.shot_number}_dialogue`];
        if (translatedDialogue) {
          return {
            ...shot,
            veo_prompt: replaceDialogue(shot.veo_prompt, translatedDialogue),
          };
        }
        return shot;
      });
    }

    return updated;
  });

  return {
    proposals: result,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
}

/** Extract the dialogue from a veo_prompt. Looks for: [word][optional punctuation] says: "..." */
export function extractDialogue(veoPrompt: string): string | null {
  // Allow optional comma/period/etc between the preceding word and "says"
  const match = veoPrompt.match(/\w+[,.]?\s+says?:\s*"([^"]*(?:\\.[^"]*)*)"/i)
    || veoPrompt.match(/\w+[,.]?\s+says?:\s*\\"([^\\]*(?:\\.[^\\]*)*)\\"/i);
  return match ? match[1].replace(/\\"/g, '"') : null;
}

/** Replace the dialogue in a veo_prompt with translated text */
export function replaceDialogue(veoPrompt: string, newDialogue: string): string {
  // Replace the dialogue portion while keeping the rest of the prompt intact
  // Allow optional comma/period between preceding word and "says"
  const escaped = newDialogue.replace(/"/g, '\\"');
  return veoPrompt
    .replace(
      /(\w+[,.]?\s+says?:\s*)"[^"]*(?:\\.[^"]*)*"/i,
      `$1"${escaped}"`
    )
    .replace(
      /(\w+[,.]?\s+says?:\s*)\\"[^\\]*(?:\\.[^\\]*)*\\"/i,
      `$1\\"${escaped}\\"`
    );
}
