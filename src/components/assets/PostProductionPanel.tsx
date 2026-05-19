"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  applyPipeline,
  DEFAULT_SETTINGS,
  isNoop,
  loadImage,
  PRESETS,
  SLIDERS,
  settingsMatch,
  type Preset,
  type Settings,
} from "@/lib/post-production";

// Per-image post-production panel for the Before/After generator.
// Slider-driven + presets. Pipeline logic lives in @/lib/post-production so
// the bulk tool uses the exact same code path and presets.

interface Props {
  imageUrl: string;
  onProcessedChange: (blob: Blob | null) => void;
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

  // Re-process when settings change. Debounce 200ms.
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

  const setValue = useCallback(
    (key: keyof Settings, value: number) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

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
