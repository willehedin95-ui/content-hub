"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  X,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Asset, AssetCategory, Product } from "@/types";
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

// Bulk Post Production tool. Two source modes:
// - Upload from computer (one or many files)
// - Pick from existing assets (passed in from AssetManager)
//
// Pick a preset (or tweak sliders), click "Process N images" - each runs the
// same applyPipeline as the per-image B/A panel, in sequence (memory safety
// for many images). Results can be saved back to Assets and/or downloaded as
// a ZIP.

interface Props {
  assets: Asset[];
  onAssetsChange: (assets: Asset[]) => void;
}

type SourceMode = "upload" | "existing";

interface SourceItem {
  id: string; // unique within selection (file name or asset id)
  source: "upload" | "asset";
  name: string;
  /** For "upload" source: the File object. */
  file?: File;
  /** For "asset" source: the asset record. */
  asset?: Asset;
  /** Local preview URL (object URL for files, asset.url for assets). */
  previewUrl: string;
}

interface ProcessedResult {
  sourceId: string;
  name: string;
  originalPreviewUrl: string;
  blob: Blob;
  processedUrl: string;
  saved?: boolean;
  savedAssetId?: string;
}

const CATEGORY_OPTIONS: { value: AssetCategory; label: string }[] = [
  { value: "before_after", label: "Before / After" },
  { value: "lifestyle", label: "Lifestyle" },
  { value: "model", label: "Model / People" },
  { value: "product", label: "Product" },
  { value: "other", label: "Other" },
];

const PRODUCT_OPTIONS: { value: Product | ""; label: string }[] = [
  { value: "", label: "General (no product)" },
  { value: "happysleep", label: "HappySleep" },
  { value: "hydro13", label: "Hydro13" },
];

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "asset";
}

export default function PostProductionBulk({ assets, onAssetsChange }: Props) {
  const [sourceMode, setSourceMode] = useState<SourceMode>("upload");
  const [selectedItems, setSelectedItems] = useState<SourceItem[]>([]);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<Settings>(PRESETS[0]?.settings ?? DEFAULT_SETTINGS);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [saveCategory, setSaveCategory] = useState<AssetCategory>("before_after");
  const [saveProduct, setSaveProduct] = useState<Product | "">("");
  const [autoSaveOnProcess, setAutoSaveOnProcess] = useState(true);

  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<ProcessedResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Clean up object URLs on unmount / re-list
  useEffect(() => {
    return () => {
      results.forEach((r) => URL.revokeObjectURL(r.processedUrl));
      selectedItems.forEach((it) => {
        if (it.source === "upload" && it.previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(it.previewUrl);
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const imageAssets = useMemo(
    () => assets.filter((a) => a.media_type === "image"),
    [assets],
  );

  // ----- selection helpers -----

  const handleFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    setSelectedItems((prev) => [
      ...prev,
      ...files.map<SourceItem>((f) => ({
        id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${f.name}`,
        source: "upload",
        name: f.name.replace(/\.[^.]+$/, ""),
        file: f,
        previewUrl: URL.createObjectURL(f),
      })),
    ]);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  };

  const toggleAssetSelection = useCallback(
    (asset: Asset) => {
      setSelectedItems((prev) => {
        const existing = prev.find(
          (it) => it.source === "asset" && it.asset?.id === asset.id,
        );
        if (existing) {
          return prev.filter((it) => it.id !== existing.id);
        }
        return [
          ...prev,
          {
            id: `asset-${asset.id}`,
            source: "asset",
            name: asset.name,
            asset,
            previewUrl: asset.url,
          },
        ];
      });
    },
    [],
  );

  const removeSelected = useCallback((id: string) => {
    setSelectedItems((prev) => {
      const removed = prev.find((it) => it.id === id);
      if (removed && removed.source === "upload" && removed.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return prev.filter((it) => it.id !== id);
    });
  }, []);

  const clearSelection = useCallback(() => {
    selectedItems.forEach((it) => {
      if (it.source === "upload" && it.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(it.previewUrl);
      }
    });
    setSelectedItems([]);
  }, [selectedItems]);

  // ----- settings -----

  const applyPreset = useCallback((preset: Preset) => {
    setSettings(preset.settings);
  }, []);

  const setSliderValue = useCallback((key: keyof Settings, value: number) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ----- run -----

  const handleProcess = useCallback(async () => {
    if (selectedItems.length === 0 || processing) return;
    if (isNoop(settings)) {
      setError("Settings are all at default - nothing to process. Pick a preset or tweak sliders.");
      return;
    }
    setError(null);

    // Clear previous results' object URLs
    results.forEach((r) => URL.revokeObjectURL(r.processedUrl));
    setResults([]);

    setProcessing(true);
    setProgress({ current: 0, total: selectedItems.length });

    const newResults: ProcessedResult[] = [];

    for (let i = 0; i < selectedItems.length; i++) {
      const item = selectedItems[i];
      setProgress({ current: i, total: selectedItems.length });
      try {
        let imgSrc: string;
        if (item.source === "upload" && item.file) {
          imgSrc = item.previewUrl; // already a blob: URL
        } else if (item.asset) {
          // Use download-proxy to avoid tainted-canvas issues for any
          // cross-origin urls
          imgSrc = `/api/download-proxy?url=${encodeURIComponent(item.asset.url)}&filename=src.png`;
        } else {
          continue;
        }
        const img = await loadImage(imgSrc);
        const blob = await applyPipeline(img, settings);
        const processedUrl = URL.createObjectURL(blob);
        const result: ProcessedResult = {
          sourceId: item.id,
          name: item.name,
          originalPreviewUrl: item.previewUrl,
          blob,
          processedUrl,
        };

        // Auto-save to assets if enabled
        if (autoSaveOnProcess) {
          try {
            const formData = new FormData();
            const filename = `${sanitizeFilename(item.name)}-postprod.jpg`;
            formData.append("file", blob, filename);
            formData.append("name", `${item.name} (post-prod)`);
            formData.append("category", saveCategory);
            if (saveProduct) formData.append("product", saveProduct);
            const res = await fetch("/api/assets", {
              method: "POST",
              body: formData,
            });
            if (res.ok) {
              const newAsset: Asset = await res.json();
              result.saved = true;
              result.savedAssetId = newAsset.id;
              onAssetsChange([newAsset, ...assets]);
            }
          } catch {
            // Save failures don't kill the run - the user can still download
            // from the results panel.
          }
        }

        newResults.push(result);
        setResults([...newResults]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Failed on item ${i + 1} (${item.name}): ${msg}`);
      }
    }

    setProgress({ current: selectedItems.length, total: selectedItems.length });
    setProcessing(false);
  }, [
    selectedItems,
    processing,
    settings,
    autoSaveOnProcess,
    saveCategory,
    saveProduct,
    assets,
    onAssetsChange,
    results,
  ]);

  const handleDownloadAll = useCallback(async () => {
    if (results.length === 0) return;
    // Single-result: direct download
    if (results.length === 1) {
      const a = document.createElement("a");
      a.href = results[0].processedUrl;
      a.download = `${sanitizeFilename(results[0].name)}-postprod.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    // Multi-result: build a zip in the browser
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const used = new Set<string>();
    for (const r of results) {
      let filename = `${sanitizeFilename(r.name)}-postprod.jpg`;
      let counter = 1;
      while (used.has(filename)) {
        filename = `${sanitizeFilename(r.name)}-postprod-${counter}.jpg`;
        counter += 1;
      }
      used.add(filename);
      zip.file(filename, r.blob);
    }
    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    const today = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `post-production-${today}-${results.length}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [results]);

  // ----- render -----

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Post Production</h1>
        <p className="text-sm text-gray-500">
          Apply degradation presets to existing assets or freshly uploaded files. Same pipeline
          as the Before/After per-image panel.
        </p>
      </div>

      {/* Source mode toggle */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Source</p>
        <div className="flex gap-2 mb-4">
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
            Pick from existing assets ({imageAssets.length})
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
            <p className="text-sm font-medium text-gray-700">Drag images here, or click to browse</p>
            <p className="text-xs text-gray-500 mt-1">Multiple files at once is fine</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileInput}
              className="hidden"
            />
          </div>
        )}

        {sourceMode === "existing" && (
          <div>
            <button
              type="button"
              onClick={() => setShowAssetPicker((v) => !v)}
              className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-200 bg-white text-gray-700 hover:border-gray-300"
            >
              {showAssetPicker ? "Hide asset picker" : "Browse assets"}
            </button>

            {showAssetPicker && (
              <div className="mt-3 max-h-[40vh] overflow-y-auto bg-gray-50 rounded-lg p-3">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {imageAssets.map((asset) => {
                    const isSelected = selectedItems.some(
                      (it) => it.source === "asset" && it.asset?.id === asset.id,
                    );
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => toggleAssetSelection(asset)}
                        className={cn(
                          "relative aspect-square bg-white rounded-lg border overflow-hidden",
                          isSelected
                            ? "border-indigo-500 ring-2 ring-indigo-200"
                            : "border-gray-200 hover:border-gray-300",
                        )}
                      >
                        <img
                          src={asset.url}
                          alt={asset.name}
                          className="w-full h-full object-cover"
                        />
                        {isSelected && (
                          <div className="absolute top-1 right-1 bg-indigo-600 text-white rounded-full p-0.5">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {imageAssets.length === 0 && (
                  <p className="text-xs text-gray-500 text-center py-4">No image assets yet</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected items */}
      {selectedItems.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Selected ({selectedItems.length})
            </p>
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs text-gray-500 hover:text-gray-700 underline-offset-2 hover:underline"
            >
              Clear all
            </button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {selectedItems.map((item) => (
              <div
                key={item.id}
                className="relative aspect-square bg-gray-50 rounded-lg overflow-hidden group border border-gray-200"
              >
                <img
                  src={item.previewUrl}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeSelected(item.id)}
                  className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5 text-gray-500 hover:text-red-600 opacity-0 group-hover:opacity-100"
                  title="Remove from selection"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings / preset */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Preset</p>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs text-gray-600 hover:text-gray-800 underline-offset-2 hover:underline"
          >
            {showAdvanced ? "Hide sliders" : "Tweak sliders"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const isActive = settingsMatch(settings, p.settings);
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

        {showAdvanced && (
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
                    onChange={(e) => setSliderValue(slider.key, Number(e.target.value))}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Save options */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Output</p>
          <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSaveOnProcess}
              onChange={(e) => setAutoSaveOnProcess(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Save to Assets while processing
          </label>
        </div>
        {autoSaveOnProcess && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Category</label>
              <select
                value={saveCategory}
                onChange={(e) => setSaveCategory(e.target.value as AssetCategory)}
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-900 bg-white"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Product</label>
              <select
                value={saveProduct}
                onChange={(e) => setSaveProduct(e.target.value as Product | "")}
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-900 bg-white"
              >
                {PRODUCT_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Run button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleProcess}
          disabled={processing || selectedItems.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {processing
            ? `Processing ${progress.current + 1}/${progress.total}…`
            : `Process ${selectedItems.length} image${selectedItems.length === 1 ? "" : "s"}`}
        </button>
        {results.length > 0 && !processing && (
          <button
            type="button"
            onClick={handleDownloadAll}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            Download {results.length > 1 ? "all as ZIP" : "result"}
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
            Results ({results.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {results.map((r) => (
              <div key={r.sourceId} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="grid grid-cols-2 gap-px bg-gray-200">
                  <div className="aspect-square bg-gray-50 flex items-center justify-center">
                    <img
                      src={r.originalPreviewUrl}
                      alt="Original"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  <div className="aspect-square bg-gray-50 flex items-center justify-center">
                    <img
                      src={r.processedUrl}
                      alt="Processed"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                </div>
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="text-xs text-gray-700 truncate" title={r.name}>
                    {r.name}
                  </span>
                  <div className="flex items-center gap-1">
                    {r.saved && (
                      <span className="text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                        Saved
                      </span>
                    )}
                    <a
                      href={r.processedUrl}
                      download={`${sanitizeFilename(r.name)}-postprod.jpg`}
                      className="p-1 text-gray-400 hover:text-indigo-600"
                      title="Download"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
