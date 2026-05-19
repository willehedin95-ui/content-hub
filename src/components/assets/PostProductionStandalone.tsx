"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  Download,
  RotateCcw,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Asset, AssetCategory } from "@/types";
import {
  applyOverlayOnly,
  applyPipeline,
  cropIsNoop,
  DEFAULT_CROP,
  DEFAULT_OVERLAY,
  DEFAULT_SETTINGS,
  isNoop,
  loadImage,
  overlayIsNoop,
  SLIDERS,
  type CropSettings,
  type OverlaySettings,
  type Settings,
} from "@/lib/post-production";
import OverlayControls from "./OverlayControls";
import CropControls from "./CropControls";
import DegradationPresetPicker from "./DegradationPresetPicker";

// Single-image Post Production tool. Pick OR upload one image, see live
// preview as you tweak sliders / overlays / crop, then save back to Assets
// or download.

interface Props {
  assets: Asset[];
  onAssetsChange: (assets: Asset[]) => void;
  /** Optional: an asset to load on mount. Set by AssetGrid's
   *  "Edit (Post Production)" button so user can jump from browsing
   *  straight into editing. */
  preselectedAsset?: Asset | null;
  /** Called once the preselected asset has been consumed - lets the parent
   *  clear its state so a stale asset doesn't re-trigger on every render. */
  onConsumePreselectedAsset?: () => void;
}

type SourceMode = "upload" | "existing";

const CATEGORY_OPTIONS: { value: AssetCategory; label: string }[] = [
  { value: "post_production", label: "Post Production" },
  { value: "before_after", label: "Before / After" },
  { value: "lifestyle", label: "Lifestyle" },
  { value: "model", label: "Model / People" },
  { value: "product", label: "Product" },
  { value: "other", label: "Other" },
];

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "asset";
}

export default function PostProductionStandalone({
  assets,
  onAssetsChange,
  preselectedAsset,
  onConsumePreselectedAsset,
}: Props) {
  const [sourceMode, setSourceMode] = useState<SourceMode>("upload");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceAsset, setSourceAsset] = useState<Asset | null>(null);
  const [showAssetPicker, setShowAssetPicker] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [defaultName, setDefaultName] = useState<string>("");

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [overlay, setOverlay] = useState<OverlaySettings>(DEFAULT_OVERLAY);
  const [crop, setCrop] = useState<CropSettings>(DEFAULT_CROP);
  const [showSliders, setShowSliders] = useState(false);

  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveCategory, setSaveCategory] = useState<AssetCategory>("post_production");

  const activeRunRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag-to-pan on the preview image. Click+drag on left half = pan BEFORE,
  // right half = pan AFTER. Drag direction follows the image (drag right ->
  // image moves right -> revealing source-left content -> panX decreases).
  type DragState = {
    half: "before" | "after";
    startX: number;
    startY: number;
    initialPanX: number;
    initialPanY: number;
    rectHalfW: number;
    rectHalfH: number;
  };
  const [dragState, setDragState] = useState<DragState | null>(null);

  useEffect(() => {
    if (!dragState) return;
    function onMove(e: MouseEvent) {
      if (!dragState) return;
      const dxScreen = e.clientX - dragState.startX;
      const dyScreen = e.clientY - dragState.startY;
      // Drag direction is OPPOSITE to pan direction (drag image right ->
      // reveal source-left -> panX decreases). Map screen-pixels to the
      // -1..1 pan range using the displayed half size as the unit.
      const dPanX = (-2 * dxScreen) / dragState.rectHalfW;
      const dPanY = (-2 * dyScreen) / dragState.rectHalfH;
      const newPanX = Math.max(-1, Math.min(1, dragState.initialPanX + dPanX));
      const newPanY = Math.max(-1, Math.min(1, dragState.initialPanY + dPanY));
      setCrop((prev) => ({
        ...prev,
        [dragState.half]: { ...prev[dragState.half], panX: newPanX, panY: newPanY },
      }));
    }
    function onUp() {
      setDragState(null);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [dragState]);

  const handlePreviewMouseDown = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      const target = e.currentTarget;
      const rect = target.getBoundingClientRect();
      const xInImage = e.clientX - rect.left;
      const halfW = rect.width / 2;
      const half: "before" | "after" = xInImage < halfW ? "before" : "after";
      const cropHalf = crop[half];
      const canPanThisHalf =
        Math.abs(cropHalf.zoom - 1) > 0.001 || crop.outputRatio !== "source";
      if (!canPanThisHalf) return;
      e.preventDefault();
      setDragState({
        half,
        startX: e.clientX,
        startY: e.clientY,
        initialPanX: cropHalf.panX,
        initialPanY: cropHalf.panY,
        rectHalfW: halfW,
        rectHalfH: rect.height,
      });
    },
    [crop],
  );

  const previewCanPan =
    Math.abs(crop.before.zoom - 1) > 0.001 ||
    Math.abs(crop.after.zoom - 1) > 0.001 ||
    crop.outputRatio !== "source";

  const imageAssets = useMemo(
    () => assets.filter((a) => a.media_type === "image"),
    [assets],
  );

  // ----- source loading -----

  const resetEverything = useCallback(() => {
    setSourceFile(null);
    setSourceAsset(null);
    setSourceImg(null);
    if (sourcePreviewUrl && sourcePreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(sourcePreviewUrl);
    }
    setSourcePreviewUrl(null);
    setDefaultName("");
    setSaveName("");
    setSettings(DEFAULT_SETTINGS);
    setOverlay(DEFAULT_OVERLAY);
    setCrop(DEFAULT_CROP);
    setProcessedBlob(null);
    setError(null);
    setSourceError(null);
    setSaved(false);
    setShowAssetPicker(true);
  }, [sourcePreviewUrl]);

  // If parent passed a preselected asset (from AssetGrid's "Edit
  // (Post Production)" button), load it on mount and clear the parent's
  // state so a stale asset doesn't re-trigger after Start Over.
  useEffect(() => {
    if (preselectedAsset) {
      setSourceAsset(preselectedAsset);
      setSourceFile(null);
      onConsumePreselectedAsset?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedAsset]);

  // Load source image when sourceFile or sourceAsset changes
  useEffect(() => {
    setProcessedBlob(null);
    setSaved(false);
    setSettings(DEFAULT_SETTINGS);
    setOverlay(DEFAULT_OVERLAY);
    setCrop(DEFAULT_CROP);
    setError(null);

    if (sourceFile) {
      const objectUrl = URL.createObjectURL(sourceFile);
      setSourcePreviewUrl(objectUrl);
      const baseName = sourceFile.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
      setDefaultName(baseName);
      setSaveName(baseName);
      loadImage(objectUrl)
        .then((img) => {
          setSourceImg(img);
          setSourceError(null);
        })
        .catch((e) => setSourceError(`Failed to load: ${e instanceof Error ? e.message : String(e)}`));
      return () => URL.revokeObjectURL(objectUrl);
    }

    if (sourceAsset) {
      setSourcePreviewUrl(sourceAsset.url);
      setDefaultName(sourceAsset.name);
      setSaveName(`${sourceAsset.name} (post-prod)`);
      const proxied = `/api/download-proxy?url=${encodeURIComponent(sourceAsset.url)}&filename=src.png`;
      loadImage(proxied)
        .then((img) => {
          setSourceImg(img);
          setSourceError(null);
        })
        .catch((e) => setSourceError(`Failed to load: ${e instanceof Error ? e.message : String(e)}`));
      return;
    }

    setSourcePreviewUrl(null);
    setSourceImg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceFile, sourceAsset]);

  // ----- live processing -----

  useEffect(() => {
    if (!sourceImg) return;
    const degradationNoop = isNoop(settings);
    const overlayNoop = overlayIsNoop(overlay);
    const cropNoop = cropIsNoop(crop);
    if (degradationNoop && overlayNoop && cropNoop) {
      setProcessedBlob(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const runId = ++activeRunRef.current;
      setProcessing(true);
      try {
        let blob: Blob;
        if (degradationNoop) {
          blob = await applyOverlayOnly(sourceImg, overlay, cropNoop ? undefined : crop);
        } else {
          blob = await applyPipeline(
            sourceImg,
            settings,
            overlayNoop ? undefined : overlay,
            cropNoop ? undefined : crop,
          );
        }
        if (runId !== activeRunRef.current) return;
        setProcessedBlob(blob);
        setSaved(false);
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
  }, [sourceImg, settings, overlay, crop]);

  // Object URL for processed blob preview
  useEffect(() => {
    if (!processedBlob) {
      setProcessedUrl(null);
      return;
    }
    const url = URL.createObjectURL(processedBlob);
    setProcessedUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [processedBlob]);

  // ----- handlers -----

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    e.target.value = "";
    setSourceFile(file);
    setSourceAsset(null);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    setSourceFile(file);
    setSourceAsset(null);
  };

  const pickAsset = (asset: Asset) => {
    setSourceAsset(asset);
    setSourceFile(null);
    setShowAssetPicker(false);
  };

  const applyPreset = useCallback((next: Settings) => {
    setSettings(next);
  }, []);

  const setSliderValue = useCallback((key: keyof Settings, value: number) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!sourceImg || saving) return;
    setSaving(true);
    setError(null);
    try {
      // If no processing applied, save the original source as-is.
      let blob: Blob;
      if (processedBlob) {
        blob = processedBlob;
      } else if (sourceFile) {
        blob = sourceFile;
      } else if (sourceAsset) {
        const res = await fetch(
          `/api/download-proxy?url=${encodeURIComponent(sourceAsset.url)}&filename=src.png`,
        );
        blob = await res.blob();
      } else {
        throw new Error("No source");
      }
      const formData = new FormData();
      const filename = `${sanitizeFilename(saveName || defaultName)}.jpg`;
      formData.append("file", blob, filename);
      formData.append("name", saveName || defaultName);
      formData.append("category", saveCategory);
      // Product is inferred from the current workspace - no need to set
      // it explicitly. Workspace-per-product makes the product field
      // redundant.
      const res = await fetch("/api/assets", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Save failed");
      }
      const newAsset: Asset = await res.json();
      onAssetsChange([newAsset, ...assets]);
      setSaved(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  }, [
    sourceImg,
    saving,
    processedBlob,
    sourceFile,
    sourceAsset,
    saveName,
    defaultName,
    saveCategory,
    onAssetsChange,
    assets,
  ]);

  const handleDownload = useCallback(() => {
    const url = processedUrl ?? sourcePreviewUrl;
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeFilename(saveName || defaultName || "post-prod")}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [processedUrl, sourcePreviewUrl, saveName, defaultName]);

  // ----- render -----

  const displayedUrl = processedUrl ?? sourcePreviewUrl;
  const hasAnyTweak = !isNoop(settings) || !overlayIsNoop(overlay) || !cropIsNoop(crop);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Post Production</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            One image at a time. Live preview on the left, all controls on the right.
          </p>
        </div>
        {sourceImg && (
          <button
            type="button"
            onClick={resetEverything}
            className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-800"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Start over
          </button>
        )}
      </div>

      {/* Source picker - shown only before a source is selected */}
      {!sourceImg && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSourceMode("upload")}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium border",
                sourceMode === "upload"
                  ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
              )}
            >
              <Upload className="w-3.5 h-3.5 inline mr-1.5" />
              Upload from computer
            </button>
            <button
              type="button"
              onClick={() => setSourceMode("existing")}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium border",
                sourceMode === "existing"
                  ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
              )}
            >
              <ImageIcon className="w-3.5 h-3.5 inline mr-1.5" />
              Pick from assets ({imageAssets.length})
            </button>
          </div>

          {sourceMode === "upload" && (
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
              <p className="text-sm font-medium text-gray-700">Drag an image here, or click to browse</p>
              <p className="text-xs text-gray-500 mt-1">One image at a time</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          )}

          {sourceMode === "existing" && (
            <div className="max-h-[55vh] overflow-y-auto bg-gray-50 rounded-lg p-3">
              {imageAssets.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-6">No image assets yet</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {imageAssets.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => pickAsset(asset)}
                      className="relative aspect-[16/9] bg-gray-50 rounded-lg border border-gray-200 overflow-hidden hover:border-indigo-400 flex items-center justify-center p-1"
                    >
                      <img
                        src={asset.url}
                        alt={asset.name}
                        className="max-w-full max-h-full object-contain"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {sourceError && (
            <p className="text-xs text-red-600">{sourceError}</p>
          )}
        </div>
      )}

      {/* Main workspace - side-by-side on lg+ */}
      {sourceImg && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* LEFT: sticky image preview */}
          <div className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Preview{hasAnyTweak ? " (post-prod)" : ""}
                </p>
                {processing && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Processing…
                  </div>
                )}
              </div>
              {displayedUrl && (
                <img
                  src={displayedUrl}
                  alt="Preview"
                  draggable={false}
                  onMouseDown={handlePreviewMouseDown}
                  className={cn(
                    "w-full rounded-lg border border-gray-100 select-none",
                    previewCanPan && (dragState ? "cursor-grabbing" : "cursor-grab"),
                  )}
                />
              )}
              {previewCanPan && !dragState && (
                <p className="text-[10px] text-gray-400 mt-1">
                  Tip: drag the image to pan. Left half pans BEFORE, right half pans AFTER.
                </p>
              )}
              {error && (
                <p className="text-xs text-red-600 mt-2">{error}</p>
              )}

              {/* Save / Download row */}
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Save as</label>
                  <input
                    type="text"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder={defaultName}
                    className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Category</label>
                  <select
                    value={saveCategory}
                    onChange={(e) => setSaveCategory(e.target.value as AssetCategory)}
                    className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs bg-white"
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || saved}
                    className={cn(
                      "flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium",
                      saved
                        ? "bg-green-50 text-green-700"
                        : "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50",
                    )}
                  >
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : saved ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    {saving ? "Saving…" : saved ? "Saved!" : "Save to Assets"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-gray-200 bg-white text-gray-700 text-xs font-medium hover:bg-gray-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: all controls */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Preset</p>
                <button
                  type="button"
                  onClick={() => setShowSliders((v) => !v)}
                  className="text-xs text-gray-600 hover:text-gray-800 underline-offset-2 hover:underline"
                >
                  {showSliders ? "Hide sliders" : "Tweak sliders"}
                </button>
              </div>
              <DegradationPresetPicker settings={settings} onApply={applyPreset} />

              {showSliders && (
                <div className="mt-4 space-y-3 pt-4 border-t border-gray-100">
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
                            {display}{slider.suffix}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={slider.min}
                          max={slider.max}
                          step={slider.step}
                          value={value}
                          onChange={(e) => setSliderValue(slider.key, Number(e.target.value))}
                          className="w-full accent-indigo-600 cursor-pointer"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Crop / Zoom</p>
              <CropControls crop={crop} onChange={setCrop} />
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Overlays</p>
              <OverlayControls overlay={overlay} onChange={setOverlay} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
