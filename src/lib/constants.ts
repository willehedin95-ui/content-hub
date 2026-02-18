export const OPENAI_MODEL = "gpt-4o";
export const KIE_MODEL = "nano-banana-pro";
export const STORAGE_BUCKET = "translated-images";

export const EXPANSION_PROMPT = `Expand this square (1:1) image to a 9:16 vertical format.
Keep the ENTIRE original image content EXACTLY as-is — do not modify, redraw, or alter any existing elements, text, colors, or layout.
Extend the background/canvas vertically (top and bottom) to fill the 9:16 ratio.
The extended areas should seamlessly blend with the existing background style.
Do NOT add any new text, logos, or design elements.
The original content should remain centered in the expanded canvas.`;
