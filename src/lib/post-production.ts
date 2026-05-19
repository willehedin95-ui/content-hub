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
  arrowEnabled: false,
  arrowColor: "#FFFFFF",
  dividerEnabled: false,
  dividerColor: "#FFFFFF",
  dividerWidth: 3,
};

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
    a.arrowEnabled === b.arrowEnabled &&
    a.arrowColor.toLowerCase() === b.arrowColor.toLowerCase() &&
    a.dividerEnabled === b.dividerEnabled &&
    a.dividerColor.toLowerCase() === b.dividerColor.toLowerCase() &&
    a.dividerWidth === b.dividerWidth
  );
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
  ctx.font = `bold ${fontSize}px Inter, system-ui, -apple-system, sans-serif`;
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

export interface CropSettings {
  enabled: boolean;
  before: HalfCrop;
  after: HalfCrop;
}

export const DEFAULT_HALF_CROP: HalfCrop = { zoom: 1, panX: 0, panY: 0 };

export const DEFAULT_CROP: CropSettings = {
  enabled: false,
  before: { ...DEFAULT_HALF_CROP },
  after: { ...DEFAULT_HALF_CROP },
};

export function halfCropIsNoop(c: HalfCrop): boolean {
  return c.zoom <= 1.001 && c.panX === 0 && c.panY === 0;
}

export function cropIsNoop(c: CropSettings): boolean {
  return !c.enabled || (halfCropIsNoop(c.before) && halfCropIsNoop(c.after));
}

export function cropSettingsMatch(a: CropSettings, b: CropSettings): boolean {
  if (a.enabled !== b.enabled) return false;
  return (
    Math.abs(a.before.zoom - b.before.zoom) < 0.001 &&
    Math.abs(a.before.panX - b.before.panX) < 0.001 &&
    Math.abs(a.before.panY - b.before.panY) < 0.001 &&
    Math.abs(a.after.zoom - b.after.zoom) < 0.001 &&
    Math.abs(a.after.panX - b.after.panX) < 0.001 &&
    Math.abs(a.after.panY - b.after.panY) < 0.001
  );
}

/** Compute the source rectangle to extract from one half. */
function computeCropRect(
  halfOriginX: number,
  halfW: number,
  halfH: number,
  crop: HalfCrop,
): { sx: number; sy: number; sw: number; sh: number } {
  const z = Math.max(1, crop.zoom);
  const cropW = halfW / z;
  const cropH = halfH / z;
  const maxPanX = halfW - cropW;
  const maxPanY = halfH - cropH;
  // Center then offset. panX = -1 -> all the way left, 1 -> all the way right.
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
 * Apply per-half crop/zoom to a source image, returning a canvas with the
 * cropped halves composited at the original image dimensions.
 */
export function applyCrop(
  source: HTMLImageElement | HTMLCanvasElement,
  crop: CropSettings,
): HTMLCanvasElement {
  const sw = "naturalWidth" in source ? source.naturalWidth : source.width;
  const sh = "naturalHeight" in source ? source.naturalHeight : source.height;
  const halfW = sw / 2;

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot get 2d context (applyCrop)");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const beforeRect = computeCropRect(0, halfW, sh, crop.before);
  const afterRect = computeCropRect(halfW, halfW, sh, crop.after);

  ctx.drawImage(
    source,
    beforeRect.sx,
    beforeRect.sy,
    beforeRect.sw,
    beforeRect.sh,
    0,
    0,
    halfW,
    sh,
  );
  ctx.drawImage(
    source,
    afterRect.sx,
    afterRect.sy,
    afterRect.sw,
    afterRect.sh,
    halfW,
    0,
    halfW,
    sh,
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
