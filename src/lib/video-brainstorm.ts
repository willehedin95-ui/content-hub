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
