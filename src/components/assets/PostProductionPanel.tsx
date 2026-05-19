"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Post-production panel for the Before/After generator.
//
// Applies "cheap old phone camera" degradation effects to the freshly
// generated B/A image via Canvas API - entirely client-side, no server calls.
// Three presets cover the typical degradation curve. User clicks a preset,
// the canvas re-renders in <1s, and the processed JPEG blob is sent up via
// `onProcessedChange`. The parent (BeforeAfterGenerator) swaps the displayed
// <img>'s src to the processed blob's object URL and uses the blob for Save
// to Assets / Download.

export type PostProdPreset = "original" | "light" | "messenger" | "fried";

interface PresetConfig {
  label: string;
  description: string;
  passes: number;
  downscale: number; // 0..1 - downscale then upscale ratio
  blur: number; // px for ctx.filter blur
  saturation: number; // percentage for ctx.filter saturate
  chromaticAberration: number; // px channel offset
  noise: number; // 0..100 noise magnitude
  jpegQuality: number; // 0..100 JPEG encoder quality
}

const PRESETS: Record<Exclude<PostProdPreset, "original">, PresetConfig> = {
  light: {
    label: "Light",
    description: "Subtle - barely noticeable",
    passes: 1,
    downscale: 0.92,
    blur: 0.3,
    saturation: 96,
    chromaticAberration: 1,
    noise: 5,
    jpegQuality: 78,
  },
  messenger: {
    label: "Messenger 5x",
    description: "Forwarded a few times",
    passes: 3,
    downscale: 0.7,
    blur: 0.5,
    saturation: 90,
    chromaticAberration: 2,
    noise: 10,
    jpegQuality: 50,
  },
  fried: {
    label: "Deep fried",
    description: "Cheap Android, screenshotted 17x",
    passes: 5,
    downscale: 0.55,
    blur: 0.7,
    saturation: 112,
    chromaticAberration: 4,
    noise: 18,
    jpegQuality: 22,
  },
};

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
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const magnitude = strength * 2.55; // 0..100 -> 0..255
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

async function applyPipeline(
  source: HTMLImageElement,
  config: PresetConfig,
): Promise<{ canvas: HTMLCanvasElement; blob: Blob }> {
  const w = source.naturalWidth;
  const h = source.naturalHeight;

  let currentSource: HTMLImageElement | HTMLCanvasElement = source;

  for (let pass = 0; pass < config.passes; pass++) {
    // 1. Downscale (sensor softness)
    const downW = Math.max(1, Math.round(w * config.downscale));
    const downH = Math.max(1, Math.round(h * config.downscale));
    const downCanvas = document.createElement("canvas");
    downCanvas.width = downW;
    downCanvas.height = downH;
    const downCtx = downCanvas.getContext("2d");
    if (!downCtx) throw new Error("Cannot get downscale 2d context");
    downCtx.imageSmoothingEnabled = true;
    downCtx.imageSmoothingQuality = "low";
    downCtx.drawImage(currentSource, 0, 0, downW, downH);

    // 2. Upscale back with blur + saturation filter
    const upCanvas = document.createElement("canvas");
    upCanvas.width = w;
    upCanvas.height = h;
    const upCtx = upCanvas.getContext("2d");
    if (!upCtx) throw new Error("Cannot get upscale 2d context");
    upCtx.imageSmoothingEnabled = true;
    upCtx.imageSmoothingQuality = "low";
    upCtx.filter = `blur(${config.blur}px) saturate(${config.saturation}%)`;
    upCtx.drawImage(downCanvas, 0, 0, w, h);
    upCtx.filter = "none";

    // 3. Chromatic aberration (RGB channel offset)
    applyChromaticAberration(upCanvas, config.chromaticAberration);

    // 4. Noise injection
    applyNoise(upCanvas, config.noise);

    // 5. JPEG roundtrip - this creates the actual compression artifacts.
    // Per-pass quality varies slightly so multi-pass doesn't just compound
    // identically (real bilder är komprimerade vid olika tillfällen med
    // olika encoder-settings).
    const passQuality = Math.max(
      10,
      config.jpegQuality - pass * 4 + Math.round((Math.random() - 0.5) * 6),
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

  // Final render to the visible canvas
  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = w;
  finalCanvas.height = h;
  const finalCtx = finalCanvas.getContext("2d");
  if (!finalCtx) throw new Error("Cannot get final 2d context");
  finalCtx.drawImage(currentSource, 0, 0);
  const finalBlob = await canvasToBlob(finalCanvas, config.jpegQuality);
  return { canvas: finalCanvas, blob: finalBlob };
}

export default function PostProductionPanel({
  imageUrl,
  onProcessedChange,
}: Props) {
  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null);
  const [preset, setPreset] = useState<PostProdPreset>("original");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track latest preset request so a slow run doesn't clobber a newer fast run.
  const activeRunRef = useRef(0);

  // Load original via download-proxy so the canvas isn't tainted by
  // cross-origin reads from tempfile.aiquickdraw.com.
  useEffect(() => {
    let cancelled = false;
    setSourceImg(null);
    setPreset("original");
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

  const handlePresetClick = useCallback(
    async (next: PostProdPreset) => {
      if (next === preset || processing) return;
      setPreset(next);
      setError(null);

      if (next === "original" || !sourceImg) {
        onProcessedChange(null);
        return;
      }

      const config = PRESETS[next];
      const runId = ++activeRunRef.current;
      setProcessing(true);
      try {
        const { blob } = await applyPipeline(sourceImg, config);
        if (runId !== activeRunRef.current) return; // a newer click started
        onProcessedChange(blob);
      } catch (e) {
        if (runId !== activeRunRef.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Processing failed: ${msg}`);
        // Revert to original on failure
        onProcessedChange(null);
        setPreset("original");
      } finally {
        if (runId === activeRunRef.current) setProcessing(false);
      }
    },
    [preset, processing, sourceImg, onProcessedChange],
  );

  const buttons: { value: PostProdPreset; label: string; description: string }[] = [
    { value: "original", label: "Original", description: "Raw nano banana output" },
    { value: "light", label: PRESETS.light.label, description: PRESETS.light.description },
    { value: "messenger", label: PRESETS.messenger.label, description: PRESETS.messenger.description },
    { value: "fried", label: PRESETS.fried.label, description: PRESETS.fried.description },
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Post production</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Degrade the image to make it look like a real customer phone selfie
          </p>
        </div>
        {processing && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Processing…
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {buttons.map((b) => (
          <button
            key={b.value}
            type="button"
            disabled={processing && b.value !== preset}
            onClick={() => handlePresetClick(b.value)}
            className={cn(
              "rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50",
              preset === b.value
                ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50",
            )}
          >
            <div className="text-xs font-medium">{b.label}</div>
            <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">{b.description}</div>
          </button>
        ))}
      </div>
      {error && (
        <p className="text-xs text-red-600 mt-2">{error}</p>
      )}
    </div>
  );
}
