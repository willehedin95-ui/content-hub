export const OPENAI_MODEL = "gpt-5.2";
export const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";
export const KIE_MODEL = "nano-banana-2";
export const STORAGE_BUCKET = "translated-images";

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

// Static ad styles from Creative Coverage framework
export const STATIC_STYLES = [
  { id: "product-hero", label: "Product Hero", description: "Product front and center, clean studio or lifestyle setting, benefit-driven" },
  { id: "bold-statement", label: "Bold Statement", description: "Large bold typography dominates, one powerful claim, minimal background visual" },
  { id: "before-after", label: "Before/After", description: "Split composition showing transformation contrast — pain state vs dream state" },
  { id: "social-proof", label: "Social Proof", description: "Product or lifestyle image with testimonial overlay boxes and review quotes" },
  { id: "native-medical", label: "Medical Illustration", description: "Anatomical cross-sections, medical diagrams, microscope close-ups — looks like it belongs next to a WebMD article" },
  { id: "native-closeup", label: "Uncomfortable Close-up", description: "Raw skin textures, swollen joints, body close-ups that trigger involuntary attention — mild disgust stops the scroll" },
  { id: "native-messy", label: "Messy Real-Life", description: "Cluttered medicine cabinet, messy bedside table with supplements, kitchen counter with health products — relatable, not aspirational" },
  { id: "comparison", label: "Comparison", description: "Side-by-side showing your product vs generic alternative, with clear advantage callouts" },
] as const;

export type StaticStyleId = (typeof STATIC_STYLES)[number]["id"];

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

export const EXPANSION_PROMPT = `Outpaint this square (1:1) image to 9:16 vertical format by seamlessly extending the canvas above and below.

CRITICAL RULES:
- The original image must remain PIXEL-PERFECT — do not redraw, recolor, warp, or alter ANY existing content
- Seamlessly CONTINUE the existing background, patterns, textures, and colors into the new areas
- If the image has a solid color background, extend that exact same color
- If the image has a gradient, texture, or pattern, continue it naturally
- If the image has a photographic background, outpaint realistic continuation of the scene
- Do NOT add empty space, halos, vignettes, or color shifts around the original content
- Do NOT add any new text, logos, watermarks, or design elements
- The transition between original and extended areas must be INVISIBLE`;
