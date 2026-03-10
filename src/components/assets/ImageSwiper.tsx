"use client";

import { useState, useRef, useCallback } from "react";
import {
  Upload,
  Loader2,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  Download,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PRODUCTS, type Product, type Asset } from "@/types";

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

  // Start the full pipeline
  const handleAnalyze = useCallback(async () => {
    if (!competitorImageUrl && !competitorImageFile) return;
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
        const uploadRes = await fetch("/api/upload-temp", { method: "POST", body: formData });
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
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setPhase("upload");
    }
  }, [competitorImageUrl, competitorImageFile, product, notes]);

  // Save to assets
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const handleSaveToAssets = useCallback(async () => {
    if (!generatedImageUrl) return;
    setSaving(true);
    setError(null);

    try {
      // Use import-url endpoint to let the server fetch the image (avoids CORS)
      const res = await fetch("/api/assets/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: generatedImageUrl,
          name: `Image Swiper${product ? ` - ${product}` : ""} - ${new Date().toLocaleDateString()}`,
          category: "lifestyle",
          product: product || undefined,
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  }, [generatedImageUrl, product, onAssetCreated]);

  // Retry — regenerate with same prompt, skip analysis
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

    try {
      const res = await fetch("/api/assets/image-swiper/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptUsed,
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
  }, [promptUsed, product]);

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
        <div className="space-y-6">
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors",
              competitorImageUrl
                ? "border-indigo-300 bg-indigo-50/50"
                : "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50"
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
              <div className="space-y-3">
                <img
                  src={competitorImageUrl}
                  alt="Competitor"
                  className="max-h-48 mx-auto rounded border border-gray-200"
                />
                <p className="text-xs text-indigo-600">Click to change</p>
              </div>
            ) : (
              <div className="space-y-3">
                <Upload className="w-12 h-12 text-gray-400 mx-auto" />
                <p className="text-sm font-medium text-gray-700">Drop a competitor image or click to browse</p>
                <p className="text-xs text-gray-400">JPG, PNG, or WebP</p>
              </div>
            )}
          </div>

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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Adapt for product <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="flex gap-2">
              {PRODUCTS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setProduct(prev => prev === p.value ? null : p.value)}
                  className={cn(
                    "px-4 py-2 rounded-lg border text-sm font-medium transition-colors",
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. 'Use a different background color' or 'Show the product more prominently'"
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 focus:outline-none"
            />
          </div>

          <button
            onClick={handleAnalyze}
            disabled={!competitorImageUrl}
            className={cn(
              "w-full py-3 rounded-lg text-sm font-semibold transition-colors",
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
                onClick={handleRetry}
                disabled={retrying || saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", retrying && "animate-spin")} />
                {retrying ? "Regenerating..." : "Retry"}
              </button>
              <button
                onClick={handleSaveToAssets}
                disabled={saving || saved}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50",
                  saved
                    ? "bg-green-50 text-green-700"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                )}
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : saved ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                {saving ? "Saving..." : saved ? "Saved!" : "Save to Assets"}
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
                  <p className="text-sm text-gray-600">{promptUsed}</p>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
