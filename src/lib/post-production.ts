/**
 * Post-production degradation pipeline (Canvas API, client-side).
 *
 * Shared between the per-image Before/After PostProductionPanel and the bulk
 * Post Production tool. Both consume the same Settings type, the same PRESETS,
 * and the same applyPipeline function so a preset that looks right on a single
 * generation produces identical output when applied in bulk.
 */

export interface Settings {
  passes: number;
  downscale: number;
  blur: number;
  saturation: number;
  chromaticAberration: number;
  noise: number;
  jpegQuality: number;
}

export const DEFAULT_SETTINGS: Settings = {
  passes: 1,
  downscale: 1.0,
  blur: 0,
  saturation: 100,
  chromaticAberration: 0,
  noise: 0,
  jpegQuality: 95,
};

export interface Preset {
  key: string;
  label: string;
  description: string;
  settings: Settings;
}

// Hand-tuned presets. Add new ones here as William dials them in via the
// sliders + "Copy current values (JSON)" loop.
export const PRESETS: Preset[] = [
  {
    key: "subtle",
    label: "Subtle",
    description: "Light JPG compression, mild grain, slight desaturation",
    settings: {
      passes: 2,
      downscale: 0.95,
      blur: 0.2,
      saturation: 92,
      chromaticAberration: 0,
      noise: 4,
      jpegQuality: 66,
    },
  },
];

export function settingsMatch(a: Settings, b: Settings): boolean {
  return (
    a.passes === b.passes &&
    Math.abs(a.downscale - b.downscale) < 0.001 &&
    Math.abs(a.blur - b.blur) < 0.001 &&
    a.saturation === b.saturation &&
    a.chromaticAberration === b.chromaticAberration &&
    a.noise === b.noise &&
    a.jpegQuality === b.jpegQuality
  );
}

export function isNoop(s: Settings): boolean {
  return (
    s.downscale >= 0.999 &&
    s.blur <= 0 &&
    s.saturation === 100 &&
    s.chromaticAberration <= 0 &&
    s.noise <= 0 &&
    s.jpegQuality >= 95 &&
    s.passes <= 1
  );
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

function applyNoise(canvas: HTMLCanvasElement, strength: number) {
  if (strength <= 0) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const magnitude = strength * 2.55;
  for (let i = 0; i < data.length; i += 4) {
    const delta = (Math.random() - 0.5) * magnitude;
    data[i] = clamp(data[i] + delta);
    data[i + 1] = clamp(data[i + 1] + delta);
    data[i + 2] = clamp(data[i + 2] + delta);
  }
  ctx.putImageData(imgData, 0, 0);
}

function applyChromaticAberration(canvas: HTMLCanvasElement, offsetPx: number) {
  if (offsetPx <= 0) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const src = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);
  const off = Math.round(offsetPx);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const rX = x + off < 0 ? 0 : x + off >= w ? w - 1 : x + off;
      const bX = x - off < 0 ? 0 : x - off >= w ? w - 1 : x - off;
      const rI = (y * w + rX) * 4;
      const bI = (y * w + bX) * 4;
      dst.data[i] = src.data[rI];
      dst.data[i + 1] = src.data[i + 1];
      dst.data[i + 2] = src.data[bI + 2];
      dst.data[i + 3] = src.data[i + 3];
    }
  }
  ctx.putImageData(dst, 0, 0);
}

export async function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      "image/jpeg",
      quality / 100,
    );
  });
}

/**
 * Apply the full degradation pipeline to a source image. Each pass:
 * - downscale -> upscale with blur + saturate filter
 * - chromatic aberration (RGB channel offset)
 * - noise injection
 * - JPEG roundtrip via canvas.toBlob (creates real compression artifacts)
 *
 * Per-pass JPEG quality jitters +/-2 randomly so multi-pass doesn't compound
 * identically to a single deep compression.
 */
export async function applyPipeline(
  source: HTMLImageElement,
  settings: Settings,
  overlay?: OverlaySettings,
  crop?: CropSettings,
): Promise<Blob> {
  // If crop is active, pre-process the source: create a new canvas with
  // each half cropped/zoomed independently, then run the rest of the
  // pipeline against that canvas instead of the raw image.
  const initialSource: HTMLImageElement | HTMLCanvasElement =
    crop && !cropIsNoop(crop) ? applyCrop(source, crop) : source;
  const w = "naturalWidth" in initialSource ? initialSource.naturalWidth : initialSource.width;
  const h = "naturalHeight" in initialSource ? initialSource.naturalHeight : initialSource.height;
  let currentSource: HTMLImageElement | HTMLCanvasElement = initialSource;

  for (let pass = 0; pass < settings.passes; pass++) {
    const downW = Math.max(1, Math.round(w * settings.downscale));
    const downH = Math.max(1, Math.round(h * settings.downscale));
    const downCanvas = document.createElement("canvas");
    downCanvas.width = downW;
    downCanvas.height = downH;
    const downCtx = downCanvas.getContext("2d");
    if (!downCtx) throw new Error("Cannot get 2d context (downscale)");
    downCtx.imageSmoothingEnabled = true;
    downCtx.imageSmoothingQuality = "low";
    downCtx.drawImage(currentSource, 0, 0, downW, downH);

    const upCanvas = document.createElement("canvas");
    upCanvas.width = w;
    upCanvas.height = h;
    const upCtx = upCanvas.getContext("2d");
    if (!upCtx) throw new Error("Cannot get 2d context (upscale)");
    upCtx.imageSmoothingEnabled = true;
    upCtx.imageSmoothingQuality = "low";
    upCtx.filter = `blur(${settings.blur}px) saturate(${settings.saturation}%)`;
    upCtx.drawImage(downCanvas, 0, 0, w, h);
    upCtx.filter = "none";

    applyChromaticAberration(upCanvas, settings.chromaticAberration);
    applyNoise(upCanvas, settings.noise);

    const passQuality = Math.max(
      10,
      Math.min(
        95,
        settings.jpegQuality -
          pass * 3 +
          Math.round((Math.random() - 0.5) * 4),
      ),
    );
    const blob = await canvasToBlob(upCanvas, passQuality);
    const blobUrl = URL.createObjectURL(blob);
    try {
      const nextImg = await loadImage(blobUrl);
      currentSource = nextImg;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = w;
  finalCanvas.height = h;
  const finalCtx = finalCanvas.getContext("2d");
  if (!finalCtx) throw new Error("Cannot get 2d context (final)");
  finalCtx.drawImage(currentSource, 0, 0);

  const hasOverlay = !!(overlay && !overlayIsNoop(overlay));
  if (hasOverlay) {
    await ensureLabelFontLoaded(overlay!);
    applyOverlay(finalCanvas, overlay!);
  }

  // Final encode: when an overlay is drawn we bump quality to >=92 so the
  // labels/arrow/divider stay sharp. The image data underneath already
  // carries the cumulative compression artifacts from the multi-pass loop,
  // so a high final encode preserves the degraded look without smashing
  // the freshly-drawn overlay pixels. Without overlay, honor the user's
  // chosen jpegQuality.
  const finalQuality = hasOverlay
    ? Math.max(92, settings.jpegQuality)
    : settings.jpegQuality;
  return canvasToBlob(finalCanvas, finalQuality);
}

/**
 * Apply ONLY the overlay (no degradation). Used when the user wants day
 * labels / arrow on the raw image without degradation.
 */
export async function applyOverlayOnly(
  source: HTMLImageElement,
  overlay: OverlaySettings,
  crop?: CropSettings,
  quality = 92,
): Promise<Blob> {
  const base: HTMLImageElement | HTMLCanvasElement =
    crop && !cropIsNoop(crop) ? applyCrop(source, crop) : source;
  const w = "naturalWidth" in base ? base.naturalWidth : base.width;
  const h = "naturalHeight" in base ? base.naturalHeight : base.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot get 2d context (overlay-only)");
  ctx.drawImage(base, 0, 0);
  await ensureLabelFontLoaded(overlay);
  applyOverlay(canvas, overlay);
  return canvasToBlob(canvas, quality);
}

// ===== Overlays (day labels + arrow) =====
//
// Drawn on top of the degraded image, in the final canvas pass. Real B/A
// product-page galleries (OsloSkinLab, Hydro13 examples) use small colored
// "dag 0 / dag X" corner tags and sometimes an arrow between halves to make
// the comparison parseable at a glance.

export type LabelPosition =
  | "bottom-left"
  | "bottom-right"
  | "top-left"
  | "top-right";

export interface OverlaySettings {
  /** Master switch for the day-label tags. */
  dayLabelEnabled: boolean;
  beforeText: string;
  afterText: string;
  labelBgColor: string;
  labelTextColor: string;
  labelPosition: LabelPosition;
  /** Label height as % of the overall image height. 4 = ~4% of image height. */
  labelSize: number;
  /** CSS font-family stack for the label text. */
  labelFontFamily: string;
  /** Numeric weight (400 normal, 700 bold). */
  labelFontWeight: number;
  /** Italic style. */
  labelFontItalic: boolean;

  /** Master switch for the centered arrow between halves. */
  arrowEnabled: boolean;
  arrowColor: string;

  /** Thin vertical line drawn between the BEFORE and AFTER halves. */
  dividerEnabled: boolean;
  dividerColor: string;
  /** Divider width in pixels. */
  dividerWidth: number;
}

export const DEFAULT_OVERLAY: OverlaySettings = {
  dayLabelEnabled: false,
  beforeText: "dag 0",
  afterText: "dag 60",
  labelBgColor: "#F5A623",
  labelTextColor: "#FFFFFF",
  labelPosition: "bottom-left",
  labelSize: 4,
  labelFontFamily: "Inter, system-ui, -apple-system, sans-serif",
  labelFontWeight: 700,
  labelFontItalic: false,
  arrowEnabled: false,
  arrowColor: "#FFFFFF",
  dividerEnabled: false,
  dividerColor: "#FFFFFF",
  dividerWidth: 3,
};

/** Font family options for label text. Each value is a complete CSS
 * font-family stack with fallbacks - if the primary isn't installed, the
 * browser falls back to the next. Brand fonts (Instrument Serif, Figtree,
 * Azeret Mono) loaded via Google Fonts <link> in app/layout.tsx. */
export const LABEL_FONT_OPTIONS: { value: string; label: string }[] = [
  // Brand fonts (Renew / Hydro13 / HappySleep)
  { value: "'Instrument Serif', Georgia, serif", label: "Instrument Serif (brand serif)" },
  { value: "Figtree, Inter, system-ui, sans-serif", label: "Figtree (brand sans)" },
  { value: "'Azeret Mono', 'Courier New', monospace", label: "Azeret Mono (brand mono)" },
  // System
  { value: "Inter, system-ui, -apple-system, sans-serif", label: "System (Inter)" },
  // Generic safe families
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "'Helvetica Neue', Helvetica, Arial, sans-serif", label: "Helvetica" },
  { value: "'Arial Narrow', 'Helvetica Condensed', Tahoma, sans-serif", label: "Arial Narrow (condensed)" },
  { value: "Tahoma, Verdana, sans-serif", label: "Tahoma" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
  { value: "Georgia, 'Times New Roman', serif", label: "Georgia (serif)" },
  { value: "'Times New Roman', Times, serif", label: "Times" },
  { value: "Impact, 'Arial Black', 'Helvetica Inserat', sans-serif", label: "Impact (heavy display)" },
  { value: "'Arial Black', 'Helvetica Inserat', Impact, sans-serif", label: "Arial Black" },
  { value: "'Courier New', Courier, monospace", label: "Courier (monospace)" },
  { value: "'Brush Script MT', cursive", label: "Brush Script (cursive)" },
];

/** Brand color swatches available next to every color picker in
 * post-production overlays. Hydro13 / Renew palette. */
export const BRAND_COLOR_SWATCHES: { value: string; label: string }[] = [
  { value: "#EB8143", label: "Brand orange" },
  { value: "#E8B730", label: "Brand yellow" },
  { value: "#252121", label: "Brand near-black" },
  { value: "#FFFFFF", label: "White" },
  { value: "#000000", label: "Black" },
];

export const LABEL_FONT_WEIGHTS: { value: number; label: string }[] = [
  { value: 400, label: "Normal" },
  { value: 500, label: "Medium" },
  { value: 600, label: "Semibold" },
  { value: 700, label: "Bold" },
  { value: 800, label: "Black" },
];

export interface OverlayPreset {
  key: string;
  label: string;
  description: string;
  settings: OverlaySettings;
}

export const OVERLAY_PRESETS: OverlayPreset[] = [
  {
    key: "oslo-yellow",
    label: "Oslo yellow",
    description: "Yellow corner tags - dag 0 / dag 60, no arrow",
    settings: {
      ...DEFAULT_OVERLAY,
      dayLabelEnabled: true,
      labelBgColor: "#F5A623",
      labelTextColor: "#FFFFFF",
      labelPosition: "bottom-left",
      labelSize: 4,
    },
  },
];

export function overlayIsNoop(o: OverlaySettings): boolean {
  return !o.dayLabelEnabled && !o.arrowEnabled && !o.dividerEnabled;
}

export function overlaySettingsMatch(
  a: OverlaySettings,
  b: OverlaySettings,
): boolean {
  return (
    a.dayLabelEnabled === b.dayLabelEnabled &&
    a.beforeText === b.beforeText &&
    a.afterText === b.afterText &&
    a.labelBgColor.toLowerCase() === b.labelBgColor.toLowerCase() &&
    a.labelTextColor.toLowerCase() === b.labelTextColor.toLowerCase() &&
    a.labelPosition === b.labelPosition &&
    a.labelSize === b.labelSize &&
    a.labelFontFamily === b.labelFontFamily &&
    a.labelFontWeight === b.labelFontWeight &&
    a.labelFontItalic === b.labelFontItalic &&
    a.arrowEnabled === b.arrowEnabled &&
    a.arrowColor.toLowerCase() === b.arrowColor.toLowerCase() &&
    a.dividerEnabled === b.dividerEnabled &&
    a.dividerColor.toLowerCase() === b.dividerColor.toLowerCase() &&
    a.dividerWidth === b.dividerWidth
  );
}

// ===== Custom user presets (localStorage) =====

const DEGRADATION_PRESETS_STORAGE_KEY = "content-hub-degradation-presets-v1";
const OVERLAY_PRESETS_STORAGE_KEY = "content-hub-overlay-presets-v1";

export function loadCustomPresets(): Preset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DEGRADATION_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p) => ({
      key: p.key,
      label: p.label,
      description: p.description ?? "",
      settings: { ...DEFAULT_SETTINGS, ...p.settings },
    }));
  } catch {
    return [];
  }
}

export function saveCustomPresets(presets: Preset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      DEGRADATION_PRESETS_STORAGE_KEY,
      JSON.stringify(presets),
    );
  } catch {
    // ignore
  }
}

export function loadCustomOverlayPresets(): OverlayPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(OVERLAY_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Backfill any new fields the user's saved settings may be missing
    // (e.g. fonts added in a later version).
    return parsed.map((p) => ({
      key: p.key,
      label: p.label,
      description: p.description ?? "",
      settings: { ...DEFAULT_OVERLAY, ...p.settings },
    }));
  } catch {
    return [];
  }
}

export function saveCustomOverlayPresets(presets: OverlayPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      OVERLAY_PRESETS_STORAGE_KEY,
      JSON.stringify(presets),
    );
  } catch {
    // Storage full or blocked - silently ignore
  }
}

function drawDayLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  half: "left" | "right",
  o: OverlaySettings,
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const halfW = w / 2;
  const fontSize = Math.max(12, h * (o.labelSize / 100));

  ctx.save();
  const italic = o.labelFontItalic ? "italic " : "";
  ctx.font = `${italic}${o.labelFontWeight} ${fontSize}px ${o.labelFontFamily}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  const padX = fontSize * 0.6;
  const padY = fontSize * 0.25;
  const metrics = ctx.measureText(text);
  const tagW = metrics.width + padX * 2;
  const tagH = fontSize + padY * 2;

  const margin = Math.max(8, h * 0.015);
  const halfOffset = half === "left" ? 0 : halfW;

  let x: number;
  let y: number;
  switch (o.labelPosition) {
    case "bottom-left":
      x = halfOffset + margin;
      y = h - tagH - margin;
      break;
    case "bottom-right":
      x = halfOffset + halfW - tagW - margin;
      y = h - tagH - margin;
      break;
    case "top-left":
      x = halfOffset + margin;
      y = margin;
      break;
    case "top-right":
      x = halfOffset + halfW - tagW - margin;
      y = margin;
      break;
  }

  ctx.fillStyle = o.labelBgColor;
  ctx.fillRect(x, y, tagW, tagH);
  ctx.fillStyle = o.labelTextColor;
  ctx.fillText(text, x + padX, y + tagH / 2);
  ctx.restore();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  color: string,
) {
  const dim = Math.min(ctx.canvas.width, ctx.canvas.height);
  const size = dim * 0.035;
  const stroke = Math.max(2, size * 0.18);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = stroke;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = size * 0.6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = size * 0.1;

  // Horizontal arrow shaft
  ctx.beginPath();
  ctx.moveTo(centerX - size, centerY);
  ctx.lineTo(centerX + size, centerY);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(centerX + size * 0.4, centerY - size * 0.55);
  ctx.lineTo(centerX + size, centerY);
  ctx.lineTo(centerX + size * 0.4, centerY + size * 0.55);
  ctx.stroke();
  ctx.restore();
}

function drawDivider(
  ctx: CanvasRenderingContext2D,
  color: string,
  width: number,
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(w / 2 - width / 2), 0, width, h);
  ctx.restore();
}

/** Ensure the font is loaded before drawing to canvas - otherwise the first
 * paint can use a fallback. Resolves immediately if already cached. */
export async function ensureLabelFontLoaded(o: OverlaySettings): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  if (!o.dayLabelEnabled) return;
  try {
    const italic = o.labelFontItalic ? "italic " : "";
    // Use a moderate font-size hint; the load is keyed on family+weight+style.
    await document.fonts.load(
      `${italic}${o.labelFontWeight} 32px ${o.labelFontFamily}`,
    );
  } catch {
    // Font load failures are non-fatal - canvas will use fallback.
  }
}

export function applyOverlay(
  canvas: HTMLCanvasElement,
  o: OverlaySettings,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  // Divider goes first - day labels / arrow draw on top of it if positioned
  // near the center seam.
  if (o.dividerEnabled) {
    drawDivider(ctx, o.dividerColor, o.dividerWidth);
  }
  if (o.dayLabelEnabled) {
    drawDayLabel(ctx, o.beforeText, "left", o);
    drawDayLabel(ctx, o.afterText, "right", o);
  }
  if (o.arrowEnabled) {
    drawArrow(ctx, canvas.width / 2, canvas.height / 2, o.arrowColor);
  }
}

// ===== Per-half crop / zoom =====
//
// Each half (BEFORE on the left, AFTER on the right) can be zoomed and
// panned independently. The output canvas keeps the original dimensions -
// the cropped region of each half is upscaled to fill that half.

export interface HalfCrop {
  /** Zoom factor. 1.0 = no crop (full half visible). 3.0 = 3x zoom in. */
  zoom: number;
  /** Pan in normalized units. 0 = centered. -1 = max-pan toward left/top.
   *  1 = max-pan toward right/bottom. */
  panX: number;
  panY: number;
}

/** Target output aspect ratio. "source" = keep whatever the input image
 *  is. Other values force the output canvas to that ratio - each half
 *  becomes half-width of the target, cover-fit from the source so the
 *  user-requested crop region fills the new shape (cropping the long axis
 *  if the aspects don't match). */
export type OutputRatio = "source" | "1:1" | "4:3" | "3:4" | "16:9" | "9:16";

export interface CropSettings {
  enabled: boolean;
  outputRatio: OutputRatio;
  before: HalfCrop;
  after: HalfCrop;
}

export const DEFAULT_HALF_CROP: HalfCrop = { zoom: 1, panX: 0, panY: 0 };

export const DEFAULT_CROP: CropSettings = {
  enabled: false,
  outputRatio: "source",
  before: { ...DEFAULT_HALF_CROP },
  after: { ...DEFAULT_HALF_CROP },
};

export const OUTPUT_RATIO_OPTIONS: { value: OutputRatio; label: string }[] = [
  { value: "source", label: "Source" },
  { value: "1:1", label: "1:1 (square)" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4 (portrait)" },
  { value: "16:9", label: "16:9 (wide)" },
  { value: "9:16", label: "9:16 (vertical)" },
];

function parseRatio(r: OutputRatio): number {
  if (r === "source") return NaN;
  const [w, h] = r.split(":").map(Number);
  return w / h;
}

/** Compute output canvas dimensions for a given target ratio, preserving the
 *  source's longest dimension as the anchor (so we don't lose resolution). */
export function computeOutputDimensions(
  sourceW: number,
  sourceH: number,
  ratio: OutputRatio,
): { width: number; height: number } {
  if (ratio === "source") return { width: sourceW, height: sourceH };
  const target = parseRatio(ratio);
  const maxDim = Math.max(sourceW, sourceH);
  if (target >= 1) {
    // Landscape or square: anchor on width
    return { width: maxDim, height: Math.max(1, Math.round(maxDim / target)) };
  }
  // Portrait: anchor on height
  return { width: Math.max(1, Math.round(maxDim * target)), height: maxDim };
}

export function halfCropIsNoop(c: HalfCrop): boolean {
  return c.zoom <= 1.001 && c.panX === 0 && c.panY === 0;
}

export function cropIsNoop(c: CropSettings): boolean {
  // Output-ratio change always means we have to re-composite, even with
  // crop disabled and both halves at 1x.
  if (c.outputRatio !== "source") return false;
  return !c.enabled || (halfCropIsNoop(c.before) && halfCropIsNoop(c.after));
}

export function cropSettingsMatch(a: CropSettings, b: CropSettings): boolean {
  if (a.enabled !== b.enabled) return false;
  if (a.outputRatio !== b.outputRatio) return false;
  return (
    Math.abs(a.before.zoom - b.before.zoom) < 0.001 &&
    Math.abs(a.before.panX - b.before.panX) < 0.001 &&
    Math.abs(a.before.panY - b.before.panY) < 0.001 &&
    Math.abs(a.after.zoom - b.after.zoom) < 0.001 &&
    Math.abs(a.after.panX - b.after.panX) < 0.001 &&
    Math.abs(a.after.panY - b.after.panY) < 0.001
  );
}

/** Compute the source rectangle to extract from one half. Adjusts the crop
 *  rect's aspect to match the target half aspect via cover-fit (crop the
 *  long axis) so the user's zoom region fills a different-aspect output
 *  without stretching. */
function computeCropRect(
  halfOriginX: number,
  halfW: number,
  halfH: number,
  crop: HalfCrop,
  targetAspect: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const z = Math.max(1, crop.zoom);
  // Base crop dimensions from zoom, in source coordinates.
  let cropW = halfW / z;
  let cropH = halfH / z;

  // Cover-fit: if the cropped region's aspect doesn't match the output half
  // aspect, shrink one dimension to match (so drawImage doesn't stretch).
  const currentAspect = cropW / cropH;
  if (Math.abs(currentAspect - targetAspect) > 0.001) {
    if (currentAspect > targetAspect) {
      // Too wide -> narrow it
      cropW = cropH * targetAspect;
    } else {
      // Too tall -> shorten it
      cropH = cropW / targetAspect;
    }
  }

  const maxPanX = halfW - cropW;
  const maxPanY = halfH - cropH;
  const sx = halfOriginX + (halfW - cropW) / 2 + (maxPanX / 2) * crop.panX;
  const sy = (halfH - cropH) / 2 + (maxPanY / 2) * crop.panY;
  return {
    sx: Math.max(halfOriginX, Math.min(halfOriginX + halfW - cropW, sx)),
    sy: Math.max(0, Math.min(halfH - cropH, sy)),
    sw: cropW,
    sh: cropH,
  };
}

/**
 * Apply per-half crop/zoom to a source image, returning a canvas of the
 * configured output dimensions with each half composited from a cropped
 * region of the corresponding source half.
 *
 * If outputRatio is "source", output dimensions match the input image
 * exactly. Otherwise output is sized to the target ratio (anchored on
 * the source's longest dimension) and each half is cover-fit from the
 * source half.
 */
export function applyCrop(
  source: HTMLImageElement | HTMLCanvasElement,
  crop: CropSettings,
): HTMLCanvasElement {
  const sw = "naturalWidth" in source ? source.naturalWidth : source.width;
  const sh = "naturalHeight" in source ? source.naturalHeight : source.height;
  const sourceHalfW = sw / 2;

  const { width: outW, height: outH } = computeOutputDimensions(
    sw,
    sh,
    crop.outputRatio,
  );
  const outHalfW = outW / 2;
  const targetHalfAspect = outHalfW / outH;

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot get 2d context (applyCrop)");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const beforeRect = computeCropRect(0, sourceHalfW, sh, crop.before, targetHalfAspect);
  const afterRect = computeCropRect(sourceHalfW, sourceHalfW, sh, crop.after, targetHalfAspect);

  ctx.drawImage(
    source,
    beforeRect.sx,
    beforeRect.sy,
    beforeRect.sw,
    beforeRect.sh,
    0,
    0,
    outHalfW,
    outH,
  );
  ctx.drawImage(
    source,
    afterRect.sx,
    afterRect.sy,
    afterRect.sw,
    afterRect.sh,
    outHalfW,
    0,
    outHalfW,
    outH,
  );

  return canvas;
}

/** SLIDERS config for any UI that exposes per-effect tuning. Shared so the
 * bulk tool and the per-image panel render identical controls. */
export interface SliderConfig {
  key: keyof Settings;
  label: string;
  help: string;
  min: number;
  max: number;
  step: number;
  suffix: string;
  format?: (v: number) => string;
}

export const SLIDERS: SliderConfig[] = [
  {
    key: "passes",
    label: "Passes",
    help: "How many times to compound the full pipeline. Real phone images are often re-compressed multiple times.",
    min: 1,
    max: 5,
    step: 1,
    suffix: "",
  },
  {
    key: "downscale",
    label: "Downscale ratio",
    help: "Downscale then upscale - creates sensor softness. 1.0 = no change.",
    min: 0.3,
    max: 1.0,
    step: 0.05,
    suffix: "x",
    format: (v) => v.toFixed(2),
  },
  {
    key: "blur",
    label: "Blur",
    help: "Gaussian blur applied during upscale. 0 = sharp.",
    min: 0,
    max: 4,
    step: 0.1,
    suffix: "px",
    format: (v) => v.toFixed(1),
  },
  {
    key: "saturation",
    label: "Saturation",
    help: "100 = unchanged. <100 desaturates, >100 deep-fries.",
    min: 30,
    max: 150,
    step: 1,
    suffix: "%",
  },
  {
    key: "chromaticAberration",
    label: "Chromatic aberration",
    help: "RGB channel offset. Cheap-lens tell. 0 = off.",
    min: 0,
    max: 10,
    step: 1,
    suffix: "px",
  },
  {
    key: "noise",
    label: "Noise",
    help: "Random ±N on every pixel. Sensor grain. 0 = off.",
    min: 0,
    max: 40,
    step: 1,
    suffix: "%",
  },
  {
    key: "jpegQuality",
    label: "JPEG quality",
    help: "Encoder quality. Lower = more compression artifacts. 95 = nearly lossless.",
    min: 10,
    max: 95,
    step: 1,
    suffix: "",
  },
];
