"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload,
  Loader2,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  Download,
  Sparkles,
  RefreshCw,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PRODUCTS, ASSET_CATEGORIES, type Product, type Asset, type AssetCategory } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = "upload" | "uploading" | "analyzing" | "generating" | "done";

interface Analysis {
  composition: string;
  colors: string;
  mood: string;
  style: string;
}

interface Props {
  onAssetCreated?: (asset: Asset) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ImageSwiper({ onAssetCreated }: Props) {
  const [phase, setPhase] = useState<Phase>("upload");
  const [error, setError] = useState<string | null>(null);

  // Upload
  const [competitorImageFile, setCompetitorImageFile] = useState<File | null>(null);
  const [competitorImageUrl, setCompetitorImageUrl] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [notes, setNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Analysis + Generation
  const [statusMessage, setStatusMessage] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [promptUsed, setPromptUsed] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // File selection
  const handleFileSelect = useCallback((file: File) => {
    setError(null);
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setError("Please upload a JPG, PNG, or WebP image.");
      return;
    }
    const url = URL.createObjectURL(file);
    setCompetitorImageFile(file);
    setCompetitorImageUrl(url);
    setUrlInput("");
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleUrlSubmit = useCallback(() => {
    if (!urlInput.trim()) return;
    if (!urlInput.startsWith("http")) {
      setError("Please enter a valid URL starting with http:// or https://");
      return;
    }
    setError(null);
    setCompetitorImageUrl(urlInput.trim());
    setCompetitorImageFile(null);
  }, [urlInput]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (text.startsWith("http")) {
      e.preventDefault();
      setUrlInput(text);
      setTimeout(() => handleUrlSubmit(), 100);
    }
  }, [handleUrlSubmit]);

  // Global clipboard paste — intercept Cmd+V / Ctrl+V with image data
  useEffect(() => {
    if (phase !== "upload") return;

    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handleFileSelect(file);
          return;
        }
      }
    }

    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [phase, handleFileSelect]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("upload");
    setStatusMessage("");
  }, []);

  // Start the full pipeline
  const handleAnalyze = useCallback(async () => {
    if (!competitorImageUrl && !competitorImageFile) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setAnalysis(null);
    setGeneratedImageUrl(null);
    setPromptUsed(null);

    try {
      let imageUrl = competitorImageUrl;

      // If file, upload to temp storage first
      if (competitorImageFile && !competitorImageUrl?.startsWith("http")) {
        setPhase("uploading");
        setStatusMessage("Uploading competitor image...");

        const formData = new FormData();
        formData.append("file", competitorImageFile);
        const uploadRes = await fetch("/api/upload-temp", { method: "POST", body: formData, signal: controller.signal });
        if (!uploadRes.ok) throw new Error("Failed to upload image");
        const { url } = await uploadRes.json();
        imageUrl = url;
      }

      if (!imageUrl) {
        throw new Error("No image URL available");
      }

      // Call image swiper API
      setPhase("analyzing");
      setStatusMessage("Analyzing competitor image...");

      const res = await fetch("/api/assets/image-swiper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: imageUrl,
          ...(product && { product }),
          notes: notes.trim() || undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `API error: ${res.status}`);
      }

      // Read NDJSON stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);

          if (event.step === "error") throw new Error(event.message);
          if (event.message) setStatusMessage(event.message);

          if (event.step === "analyzed" && event.analysis) {
            setAnalysis(event.analysis as Analysis);
          }

          if (event.step === "generating") {
            setPhase("generating");
          }

          if (event.step === "completed" && event.image_url) {
            setGeneratedImageUrl(event.image_url);
            setPromptUsed(event.prompt_used || null);
            setPhase("done");
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setPhase("upload");
    }
  }, [competitorImageUrl, competitorImageFile, product, notes]);

  // Save to assets modal
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveCategory, setSaveCategory] = useState<AssetCategory>("lifestyle");
  const [saveProduct, setSaveProduct] = useState<Product | null>(null);

  // Edit instructions for retry
  const [editInstructions, setEditInstructions] = useState("");

  // Generate a short AI name from the prompt JSON
  const generateNameFromPrompt = useCallback((prompt: string): string => {
    try {
      const parsed = JSON.parse(prompt);
      const parts: string[] = [];
      // Use scene setting
      if (parsed.scene?.setting) {
        const setting = parsed.scene.setting.split(",")[0].split(".")[0].trim();
        if (setting.length <= 40) parts.push(setting);
        else parts.push(setting.slice(0, 40));
      }
      // Use style category
      if (parsed.style?.category) parts.push(parsed.style.category);
      // Use first subject
      if (parsed.subjects?.[0]) {
        const subj = parsed.subjects[0];
        const desc = subj.description?.split(",")[0]?.split(".")[0]?.trim();
        if (desc && desc.length <= 30) parts.push(desc);
      }
      if (parts.length > 0) return parts.slice(0, 2).join(" — ");
    } catch { /* fallback */ }
    return `Swiped image${product ? ` - ${product}` : ""}`;
  }, [product]);

  const handleOpenSaveModal = useCallback(() => {
    const autoName = promptUsed ? generateNameFromPrompt(promptUsed) : `Swiped image`;
    setSaveName(autoName);
    setSaveCategory("lifestyle");
    setSaveProduct(product);
    setShowSaveModal(true);
  }, [promptUsed, product, generateNameFromPrompt]);

  const handleSaveToAssets = useCallback(async () => {
    if (!generatedImageUrl) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/assets/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: generatedImageUrl,
          name: saveName.trim() || "Swiped image",
          category: saveCategory,
          product: saveProduct || undefined,
          media_type: "image",
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Failed to save asset");
      }

      const asset = await res.json();
      if (onAssetCreated) onAssetCreated(asset);
      setSaved(true);
      setShowSaveModal(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  }, [generatedImageUrl, saveName, saveCategory, saveProduct, onAssetCreated]);

  // Retry — regenerate with same prompt + optional edit instructions
  const handleRetry = useCallback(async () => {
    if (!promptUsed) return;
    setRetrying(true);
    setError(null);
    setSaved(false);

    // Parse aspect ratio from the JSON prompt
    let aspectRatio = "4:5";
    try {
      const parsed = JSON.parse(promptUsed);
      const raw = parsed?.composition?.aspect_ratio ?? "";
      const valid = ["1:1", "4:5", "5:4", "3:2", "2:3", "16:9", "9:16"];
      if (valid.includes(raw)) aspectRatio = raw;
    } catch { /* use default */ }

    // If edit instructions provided, inject them into the prompt JSON
    let finalPrompt = promptUsed;
    if (editInstructions.trim()) {
      try {
        const parsed = JSON.parse(promptUsed);
        parsed.instruction = (parsed.instruction || "") + ` EDIT INSTRUCTIONS: ${editInstructions.trim()}`;
        finalPrompt = JSON.stringify(parsed);
      } catch {
        // Fallback — append as-is
        finalPrompt = promptUsed;
      }
    }

    try {
      const res = await fetch("/api/assets/image-swiper/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: finalPrompt,
          ...(product && { product }),
          aspect_ratio: aspectRatio,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Retry failed: ${res.status}`);
      }

      const { image_url } = await res.json();
      setGeneratedImageUrl(image_url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setRetrying(false);
    }
  }, [promptUsed, product, editInstructions]);

  // Reset
  const handleReset = useCallback(() => {
    if (competitorImageUrl && competitorImageFile) URL.revokeObjectURL(competitorImageUrl);
    setPhase("upload");
    setCompetitorImageFile(null);
    setCompetitorImageUrl(null);
    setUrlInput("");
    setNotes("");
    setError(null);
    setAnalysis(null);
    setGeneratedImageUrl(null);
    setPromptUsed(null);
    setStatusMessage("");
    setSaving(false);
    setSaved(false);
    setEditInstructions("");
    setShowSaveModal(false);
  }, [competitorImageUrl, competitorImageFile]);

  return (
    <div className="space-y-6">
      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Error</p>
            <p className="text-sm text-red-600 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* UPLOAD                                                             */}
      {/* ================================================================== */}
      {phase === "upload" && (
        <div className="space-y-4">
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-xl text-center cursor-pointer transition-colors",
              competitorImageUrl
                ? "border-indigo-300 bg-indigo-50/50 p-3"
                : "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50 p-8"
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
            {competitorImageUrl ? (
              <div className="flex items-center gap-3">
                <img
                  src={competitorImageUrl}
                  alt="Competitor"
                  className="h-20 rounded border border-gray-200"
                />
                <div className="text-left">
                  <p className="text-xs font-medium text-gray-700">Competitor image loaded</p>
                  <p className="text-xs text-indigo-600 mt-0.5">Click to change</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="w-8 h-8 text-gray-400 mx-auto" />
                <p className="text-sm font-medium text-gray-700">Drop, paste, or click to browse</p>
                <p className="text-xs text-gray-400">JPG, PNG, or WebP — also supports Ctrl/Cmd+V from clipboard</p>
              </div>
            )}
          </div>

          {!competitorImageUrl && (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 uppercase tracking-wider">or paste url</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <div className="flex gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onPaste={handlePaste}
                  placeholder="https://example.com/image.jpg"
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 focus:outline-none"
                />
                <button
                  onClick={handleUrlSubmit}
                  disabled={!urlInput.trim()}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    urlInput.trim()
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  )}
                >
                  Load
                </button>
              </div>
            </>
          )}

          <div className="flex items-center gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Product <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <div className="flex gap-2">
                {PRODUCTS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setProduct(prev => prev === p.value ? null : p.value)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                      product === p.value
                        ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                        : "bg-white border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. 'Use a different background color'"
              className="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 focus:outline-none"
            />
          </div>

          <button
            onClick={handleAnalyze}
            disabled={!competitorImageUrl}
            className={cn(
              "w-full py-2.5 rounded-lg text-sm font-semibold transition-colors",
              competitorImageUrl
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            )}
          >
            Analyze & Generate
          </button>
        </div>
      )}

      {/* ================================================================== */}
      {/* UPLOADING                                                          */}
      {/* ================================================================== */}
      {phase === "uploading" && (
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            <p className="text-sm font-medium text-gray-900">{statusMessage}</p>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* ANALYZING                                                          */}
      {/* ================================================================== */}
      {phase === "analyzing" && (
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-indigo-600 animate-pulse" />
            </div>
            <p className="text-sm font-medium text-gray-900">{statusMessage}</p>
            <p className="text-xs text-gray-400">Analyzing visual structure and generating prompt...</p>
            <button
              onClick={handleCancel}
              className="mt-2 flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-4 py-1.5 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* GENERATING                                                         */}
      {/* ================================================================== */}
      {phase === "generating" && (
        <div className="space-y-6">
          {analysis && (
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-gray-900">Analysis complete</span>
              </div>
              <div className="space-y-2 text-sm text-gray-600">
                <p><span className="font-medium">Composition:</span> {analysis.composition}</p>
                <p><span className="font-medium">Colors:</span> {analysis.colors}</p>
                <p><span className="font-medium">Mood:</span> {analysis.mood}</p>
                <p><span className="font-medium">Style:</span> {analysis.style}</p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-200 p-8">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-amber-600 animate-pulse" />
              </div>
              <p className="text-sm font-medium text-gray-900">{statusMessage}</p>
              <p className="text-xs text-gray-400">Generating adapted image with Nano Banana...</p>
              <button
                onClick={handleCancel}
                className="mt-2 flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-4 py-1.5 rounded-lg transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* DONE                                                               */}
      {/* ================================================================== */}
      {phase === "done" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <span className="text-sm font-medium text-gray-900">Image generated</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenSaveModal}
                disabled={saving || saved}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50",
                  saved
                    ? "bg-green-50 text-green-700"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                )}
              >
                {saved ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                {saved ? "Saved!" : "Save to Assets"}
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Start Over
              </button>
            </div>
          </div>

          {/* Side by side: competitor + generated */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Competitor */}
            {competitorImageUrl && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Competitor</p>
                <img
                  src={competitorImageUrl}
                  alt="Competitor"
                  className="w-full rounded-lg border border-gray-100"
                />
              </div>
            )}

            {/* Generated */}
            {generatedImageUrl && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Generated {product ? `(${product === "happysleep" ? "HappySleep" : "Hydro13"})` : "(Style)"}
                  </p>
                  <a
                    href={generatedImageUrl}
                    download={`image-swiper-${product || "style"}-${Date.now()}.png`}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </a>
                </div>
                <img
                  src={generatedImageUrl}
                  alt="Generated"
                  className="w-full rounded-lg border border-gray-100"
                />
              </div>
            )}
          </div>

          {/* Edit instructions + Retry */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Edit instructions <span className="text-gray-400 font-normal">(optional — describe what to change)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={editInstructions}
                onChange={(e) => setEditInstructions(e.target.value)}
                placeholder="e.g. 'Remove the tag on the pillow' or 'Make the background darker'"
                className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !retrying) handleRetry();
                }}
              />
              <button
                onClick={handleRetry}
                disabled={retrying || saving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", retrying && "animate-spin")} />
                {retrying ? "Regenerating..." : editInstructions.trim() ? "Regenerate with edits" : "Retry"}
              </button>
            </div>
          </div>

          {/* Analysis summary */}
          {analysis && (
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Analysis Summary</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <p><span className="font-medium">Composition:</span> {analysis.composition}</p>
                <p><span className="font-medium">Colors:</span> {analysis.colors}</p>
                <p><span className="font-medium">Mood:</span> {analysis.mood}</p>
                <p><span className="font-medium">Style:</span> {analysis.style}</p>
              </div>
              {promptUsed && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Prompt used</p>
                  <p className="text-sm text-gray-600 break-all">{promptUsed}</p>
                </div>
              )}
            </div>
          )}

          {/* Save to Assets Modal */}
          {showSaveModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowSaveModal(false)}>
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-base font-semibold text-gray-900">Save to Assets</h3>
                  <button onClick={() => setShowSaveModal(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Preview */}
                {generatedImageUrl && (
                  <img
                    src={generatedImageUrl}
                    alt="Preview"
                    className="w-full h-40 object-cover rounded-lg border border-gray-100 mb-4"
                  />
                )}

                {/* Name */}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Name</label>
                  <input
                    type="text"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 focus:outline-none"
                  />
                </div>

                {/* Category */}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Category</label>
                  <div className="flex flex-wrap gap-1.5">
                    {ASSET_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSaveCategory(cat)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors capitalize",
                          saveCategory === cat
                            ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                            : "bg-white border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
                        )}
                      >
                        {cat === "before_after" ? "Before/After" : cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Product */}
                <div className="mb-6">
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Product</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSaveProduct(null)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                        saveProduct === null
                          ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                          : "bg-white border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      )}
                    >
                      General
                    </button>
                    {PRODUCTS.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => setSaveProduct(p.value)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                          saveProduct === p.value
                            ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                            : "bg-white border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowSaveModal(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveToAssets}
                    disabled={saving || !saveName.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
