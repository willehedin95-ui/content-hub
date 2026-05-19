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
): Promise<Blob> {
  const w = source.naturalWidth;
  const h = source.naturalHeight;
  let currentSource: HTMLImageElement | HTMLCanvasElement = source;

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
  return canvasToBlob(finalCanvas, settings.jpegQuality);
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
