"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Post-production panel for the Before/After generator.
//
// Slider-driven degradation pipeline (Canvas API, client-side). User tweaks
// individual sliders, sees a live preview, and can copy the current settings
// to JSON so we can codify them as presets later.

interface Settings {
  passes: number;
  downscale: number;
  blur: number;
  saturation: number;
  chromaticAberration: number;
  noise: number;
  jpegQuality: number;
}

const DEFAULT_SETTINGS: Settings = {
  passes: 1,
  downscale: 1.0,
  blur: 0,
  saturation: 100,
  chromaticAberration: 0,
  noise: 0,
  jpegQuality: 95,
};

interface Preset {
  key: string;
  label: string;
  description: string;
  settings: Settings;
}

// Hand-tuned presets. Add new ones here as William dials them in via the
// sliders + "Copy current values (JSON)" loop.
const PRESETS: Preset[] = [
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

function settingsMatch(a: Settings, b: Settings): boolean {
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

type SliderKey = keyof Settings;

interface SliderConfig {
  key: SliderKey;
  label: string;
  help: string;
  min: number;
  max: number;
  step: number;
  suffix: string;
  format?: (v: number) => string;
}

const SLIDERS: SliderConfig[] = [
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

interface Props {
  imageUrl: string;
  onProcessedChange: (blob: Blob | null) => void;
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function loadImage(src: string): Promise<HTMLImageElement> {
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

async function canvasToBlob(
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

function isNoop(s: Settings): boolean {
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

async function applyPipeline(
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

    // Per-pass jitter so multi-pass doesn't compound identically. Real-world
    // re-compression always uses slightly different encoder settings.
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

export default function PostProductionPanel({
  imageUrl,
  onProcessedChange,
}: Props) {
  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedAt, setCopiedAt] = useState<number | null>(null);

  const activeRunRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load source image via the same-origin download proxy so the canvas
  // isn't tainted by cross-origin reads from tempfile.aiquickdraw.com.
  useEffect(() => {
    let cancelled = false;
    setSourceImg(null);
    setEnabled(false);
    setSettings(DEFAULT_SETTINGS);
    setError(null);
    onProcessedChange(null);

    const proxied = `/api/download-proxy?url=${encodeURIComponent(imageUrl)}&filename=src.png`;
    loadImage(proxied)
      .then((img) => {
        if (!cancelled) setSourceImg(img);
      })
      .catch((e) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(`Failed to load source image: ${msg}`);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  // Re-process when settings change. Debounce 200ms so dragging a slider
  // doesn't spawn dozens of pipeline runs.
  useEffect(() => {
    if (!sourceImg) return;
    if (!enabled || isNoop(settings)) {
      onProcessedChange(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const runId = ++activeRunRef.current;
      setProcessing(true);
      try {
        const blob = await applyPipeline(sourceImg, settings);
        if (runId !== activeRunRef.current) return;
        onProcessedChange(blob);
        setError(null);
      } catch (e) {
        if (runId !== activeRunRef.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Processing failed: ${msg}`);
      } finally {
        if (runId === activeRunRef.current) setProcessing(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [sourceImg, enabled, settings, onProcessedChange]);

  const setValue = useCallback((key: SliderKey, value: number) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const applyPreset = useCallback((preset: Preset) => {
    setSettings(preset.settings);
    setEnabled(true);
  }, []);

  const handleReset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const handleCopyValues = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(settings, null, 2));
      setCopiedAt(Date.now());
      setTimeout(() => setCopiedAt(null), 1500);
    } catch {
      setError("Copy failed - browser blocked clipboard access");
    }
  }, [settings]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Post production
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Degrade the image to cheap-phone aesthetic - tweak sliders, preview live
          </p>
        </div>
        <div className="flex items-center gap-3">
          {processing && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Processing…
            </div>
          )}
          <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Enable
          </label>
        </div>
      </div>

      {PRESETS.length > 0 && (
        <div className="mb-3 pb-3 border-b border-gray-100">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 font-medium">Presets</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const isActive = enabled && settingsMatch(settings, p.settings);
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyPreset(p)}
                  title={p.description}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive
                      ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className={cn("space-y-3", !enabled && "opacity-50 pointer-events-none")}>
        {SLIDERS.map((slider) => {
          const value = settings[slider.key];
          const display = slider.format ? slider.format(value) : String(value);
          return (
            <div key={slider.key}>
              <div className="flex justify-between items-baseline text-xs mb-1">
                <span className="text-gray-700 font-medium" title={slider.help}>
                  {slider.label}
                </span>
                <span className="text-gray-500 font-mono tabular-nums">
                  {display}
                  {slider.suffix}
                </span>
              </div>
              <input
                type="range"
                min={slider.min}
                max={slider.max}
                step={slider.step}
                value={value}
                onChange={(e) => setValue(slider.key, Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-100">
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-gray-600 hover:text-gray-800 underline-offset-2 hover:underline"
        >
          Reset all
        </button>
        <button
          type="button"
          onClick={handleCopyValues}
          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
        >
          {copiedAt ? "Copied!" : "Copy current values (JSON)"}
        </button>
      </div>

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
