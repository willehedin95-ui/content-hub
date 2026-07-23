export const OPENAI_MODEL = "gpt-5.2";
export const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";
export const KIE_MODEL = "nano-banana-2";

// Selectable image-generation models for re-roll. Kie's createTask input schema
// differs per model family — the reference-image field name and whether
// resolution / output_format apply are model-specific — so each entry carries the
// schema shape consumed by src/lib/kie.ts. Verified against docs.kie.ai (2026-07):
//   nano-banana-2 / -pro  -> image_input,  resolution, output_format
//   nano-banana-2-lite    -> image_urls,   (no resolution, no output_format)
//   gpt-image-2-i2i       -> input_urls,   resolution (1K for 4:5), no output_format
export const IMAGE_MODELS = [
  { id: "gpt-image-2-image-to-image", label: "GPT Image 2", description: "OpenAI — hög precision, stark textrendering", imageField: "input_urls", includeResolution: true, resolutionOverride: "1K", outputFormat: false },
  { id: "nano-banana-2", label: "Nano Banana 2", description: "Gemini 3.1 Flash — snabb, billig (standard)", imageField: "image_input", includeResolution: true, resolutionOverride: null, outputFormat: true },
  { id: "nano-banana-2-lite", label: "Nano Banana 2 Lite", description: "Snabbast, lägst latens", imageField: "image_urls", includeResolution: false, resolutionOverride: null, outputFormat: false },
  { id: "nano-banana-pro", label: "Nano Banana Pro", description: "Gemini 3 Pro — bäst kvalitet + text", imageField: "image_input", includeResolution: true, resolutionOverride: null, outputFormat: true },
] as const;
export type ImageModelId = (typeof IMAGE_MODELS)[number]["id"];
export const IMAGE_MODEL_IDS = IMAGE_MODELS.map((m) => m.id) as readonly string[];
export const STORAGE_BUCKET = "translated-images";

// Feature flag: JSON-structured prompts for native ad styles (native-closeup, native-messy).
// JSON prompting separates subject/lighting/camera/mood into distinct keys, preventing
// "concept bleeding" and producing more realistic images. Set to false to revert to
// plain text narrative prompts.
export const USE_JSON_PROMPTING = true;

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Image translation defaults
export const DEFAULT_MAX_VERSIONS = 5;
export const DEFAULT_QUALITY_THRESHOLD = 80;
export const MAX_FIX_ROUNDS = 3;

// Rate limits (requests per minute)
export const RATE_LIMIT_FETCH_URL = 5;
export const RATE_LIMIT_TRANSLATE = 10;
export const RATE_LIMIT_IMAGE_TRANSLATE = 20;

// Translation timing
export const STALE_CLAIM_MS = 10 * 60 * 1000; // 10 minutes

// Client-side translate queue: how many images the browser processes in
// parallel (ImageJobDetail startQueue) and the per-image estimate used for
// the ETA in the translate-confirm dialog. Keep in sync so the ETA reflects
// actual queue behavior (audit ui8/ui13).
export const TRANSLATE_CONCURRENCY = 3;
export const TRANSLATE_SECONDS_PER_IMAGE = 75;

// Static ad styles from Creative Coverage framework
export const STATIC_STYLES = [
  { id: "product-hero", label: "Product Hero", description: "Product front and center, clean studio or lifestyle setting, benefit-driven" },
  { id: "bold-statement", label: "Bold Statement", description: "Large bold typography dominates, one powerful claim, minimal background visual" },
  { id: "before-after", label: "Before/After", description: "Split composition showing transformation contrast — pain state vs dream state" },
  { id: "social-proof", label: "Social Proof", description: "Product or lifestyle image with testimonial overlay boxes and review quotes" },
  { id: "native-medical", label: "Medical / Scientific", description: "Pencil sketches, CT scans, microscopy, fabric models, infographic diagrams, comic illustrations — educational imagery in varied visual media" },
  { id: "native-closeup", label: "Pattern Interrupt", description: "Disgusting objects, exhaustion portraits, scene-of-the-crime beds, metaphorical objects, intimate 3AM moments — raw and unexpected" },
  { id: "native-messy", label: "Real-Life Native", description: "Problem scenes (messy nightstands, stacked pillows, 3AM phones) AND outcome scenes (celebration selfies, couple moments, flat-lay comparisons) — iPhone aesthetic" },
  { id: "comparison", label: "Comparison", description: "Side-by-side showing your product vs generic alternative, with clear advantage callouts" },
] as const;

export type StaticStyleId = (typeof STATIC_STYLES)[number]["id"];

// Styles that use JSON prompting when USE_JSON_PROMPTING is enabled
export const JSON_PROMPT_STYLES: StaticStyleId[] = ["native-closeup", "native-messy"];

// V3.1: Awareness level → preferred styles (ordered by relevance)
export const AWARENESS_STYLE_MAP: Record<string, StaticStyleId[]> = {
  "Unaware":        ["native-medical", "native-closeup", "native-messy", "bold-statement"],
  "Problem Aware":  ["before-after", "bold-statement", "native-messy", "social-proof"],
  "Solution Aware": ["comparison", "before-after", "social-proof", "product-hero"],
  "Product Aware":  ["social-proof", "product-hero", "comparison"],
  "Most Aware":     ["product-hero", "social-proof"],
};

// V3.2: Reptile Triggers — 13 scroll-stopping visual patterns from the Flywheel
export const REPTILE_TRIGGERS = [
  { id: "ultra-real",      label: "Ultra-Real",      promptHint: "Hyper-realistic detail that makes viewers zoom in — every pore, fiber, and texture is crisp and almost uncomfortably detailed." },
  { id: "bizarre",         label: "Bizarre",          promptHint: "Something unexpected or surreal that doesn't belong — a visual that makes people think 'wait, what?' and stop scrolling." },
  { id: "voyeur",          label: "Voyeur",           promptHint: "Feels like spying on a private moment — the subject doesn't know they're being watched. Intimate, candid, unposed." },
  { id: "suffering",       label: "Suffering",        promptHint: "Visible pain, discomfort, or frustration — furrowed brow, tense muscles, visible exhaustion. Triggers empathy and recognition." },
  { id: "gorey",           label: "Gorey",            promptHint: "Visceral, shocking detail — close-up of something that makes you wince. Use carefully and tastefully for health products." },
  { id: "sexual",          label: "Sexual",           promptHint: "Attraction, beauty, desire, intimacy — not explicit, but the suggestion of closeness, smooth skin, or an alluring gaze." },
  { id: "primal-fear",     label: "Primal Fear",      promptHint: "Deep-rooted anxiety — darkness, isolation, loss, aging, missing out. Visually: shadows, empty spaces, vulnerable moments." },
  { id: "odd-contrast",    label: "Odd Contrast",     promptHint: "Two things that don't belong together — juxtaposition that creates visual tension and curiosity." },
  { id: "inside-joke",     label: "Inside Joke",      promptHint: "A visual reference the target audience immediately gets — meme-like, relatable, 'that's so me' energy." },
  { id: "time-warp",       label: "Time Warp",        promptHint: "Before/after, nostalgia, or future-shock — visual time contrast showing transformation or the passage of time." },
  { id: "victory-lap",     label: "Victory Lap",      promptHint: "Celebration, achievement, relief — a person who clearly won, overcame, or finally found the solution. Joyful, triumphant." },
  { id: "selfie",          label: "Selfie",           promptHint: "POV or first-person perspective — as if the viewer took this photo themselves. Front-facing camera angle, eye contact." },
  { id: "uncanny-objects", label: "Uncanny Objects",  promptHint: "Products or objects that look almost alive, anthropomorphic, or unnervingly perfect — triggers the uncanny valley response." },
] as const;

export type ReptileTriggerId = (typeof REPTILE_TRIGGERS)[number]["id"];

// --- Video UGC Constants ---

export const KIE_VIDEO_MODEL = "sora-2-pro-text-to-video";
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

