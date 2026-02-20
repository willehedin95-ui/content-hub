export const OPENAI_MODEL = "gpt-5.2";
export const KIE_MODEL = "nano-banana-pro";
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
