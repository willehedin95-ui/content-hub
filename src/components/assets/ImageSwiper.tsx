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
import { IMAGE_MODELS, type ImageModelId } from "@/lib/constants";
import type { SwipeForm } from "@/lib/product-appearance";
import { shrinkForUpload } from "@/lib/shrink-for-upload";
import { unlockSound, playDoneSound } from "@/lib/notify-sound";
import { GENDER_OPTIONS, AGE_OPTIONS, ETHNICITY_OPTIONS, type PersonOverride } from "@/lib/person-options";

// "" = keep what the competitor's image shows.
const FROM_IMAGE = { value: "", label: "Från bilden" };
const PERSON_FIELDS = [
  { key: "gender", label: "Kön", options: [FROM_IMAGE, ...GENDER_OPTIONS] },
  { key: "age", label: "Ålder", options: [FROM_IMAGE, ...AGE_OPTIONS.filter((o) => o.value)] },
  { key: "ethnicity", label: "Etnicitet", options: [FROM_IMAGE, ...ETHNICITY_OPTIONS.map((o) => ({ ...o, label: o.label.replace(/ \(default\)$/, "") }))] },
] as const;

const SWIPE_FORM_OPTIONS: { id: SwipeForm; label: string; hint: string }[] = [
  { id: "bottle", label: "Flaska", hint: "Flaskan tar förpackningens plats i bilden" },
  { id: "shot", label: "Shotglas", hint: "Ett litet shotglas med outspätt kollagen" },
  { id: "glass", label: "Glas", hint: "Ett vanligt glas med kollagen utblandat i vatten" },
];
// Output format. "original" = same ratio as the competitor image (measured
// server-side). Models without the picked ratio get the nearest one and the
// result is cropped to the pick (swipe-image-store.ts).
const SWIPE_FORMATS = [
  { id: "4:5", hint: "Instagram-flöde" },
  { id: "1:1", hint: "Kvadrat" },
  { id: "9:16", hint: "Story och Reels" },
  { id: "16:9", hint: "Liggande" },
  { id: "original", hint: "Samma format som konkurrentbilden" },
];
import { ASSET_CATEGORIES, type Product, type Asset, type AssetCategory } from "@/types";
import { useProducts } from "@/hooks/useProducts";

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
  const products = useProducts();
  const [phase, setPhase] = useState<Phase>("upload");
  const [error, setError] = useState<string | null>(null);

  // Upload
  const [competitorImageFile, setCompetitorImageFile] = useState<File | null>(null);
  const [competitorImageUrl, setCompetitorImageUrl] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<"standard" | "ugc" | "replica">("standard");
  // Which forms of our product appear in the image. None picked = bottle.
  const [forms, setForms] = useState<SwipeForm[]>(["bottle"]);
  // Product reference photos (from the product bank). Default = hero images.
  const [refImages, setRefImages] = useState<{ id: string; url: string; category: string; description: string | null }[]>([]);
  const [refIds, setRefIds] = useState<string[]>([]);
  useEffect(() => {
    setRefImages([]);
    setRefIds([]);
    if (!product) return;
    let cancelled = false;
    fetch(`/api/assets/image-swiper/references?product=${encodeURIComponent(product)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (cancelled || !Array.isArray(rows)) return;
        setRefImages(rows);
        setRefIds(rows.filter((r: { category: string }) => r.category === "hero").map((r: { id: string }) => r.id));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [product]);
  // Person override. Empty = keep the person from the competitor's image.
  const [person, setPerson] = useState<PersonOverride>({ gender: "", age: "", ethnicity: "", hair_color: "" });
  // Image model for both the first generation and retries. GPT Image 2 won
  // the 2026-09-30 benchmark: Pro-level labels and size at a third of the cost.
  const [imageModel, setImageModel] = useState<ImageModelId>("gpt-image-2-image-to-image");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Analysis + Generation
  const [statusMessage, setStatusMessage] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [promptUsed, setPromptUsed] = useState<string | null>(null);
  const [format, setFormat] = useState("4:5");
  // Ratio of the shown result; Retry uses it and can change it.
  const [resultRatio, setResultRatio] = useState<string>("4:5");
  const [resolvedCompetitorUrl, setResolvedCompetitorUrl] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  // Which Kie model is running and since when - shown as "GPT Image 2 · 2:14".
  const [genInfo, setGenInfo] = useState<{ model: string; startedAt: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Set when Kie timed out: the finished prompt, so only the image is retried.
  const [timeoutRetry, setTimeoutRetry] = useState<{ prompt: string; ratio: string } | null>(null);
  useEffect(() => {
    if (!genInfo) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [genInfo]);
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
    unlockSound();
    if (!competitorImageUrl && !competitorImageFile) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setTimeoutRetry(null);
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
        formData.append("file", await shrinkForUpload(competitorImageFile));
        const uploadRes = await fetch("/api/upload-temp", { method: "POST", body: formData, signal: controller.signal });
        if (!uploadRes.ok) {
          const detail = await uploadRes.json().then((j) => j.error).catch(() => null);
          throw new Error(`Failed to upload image (${uploadRes.status}${detail ? `: ${detail}` : uploadRes.status === 413 ? ": bilden är för stor" : ""})`);
        }
        const { url } = await uploadRes.json();
        imageUrl = url;
      }

      if (!imageUrl) {
        throw new Error("No image URL available");
      }

      // Store the resolved HTTP URL for replica mode retries
      setResolvedCompetitorUrl(imageUrl);

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
          mode,
          forms,
          person,
          reference_ids: refIds,
          model: imageModel,
          aspect_ratio: format,
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
      let completed = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);

          if (event.step === "error") {
            if (event.timeout && event.prompt_used) {
              setTimeoutRetry({ prompt: event.prompt_used, ratio: event.aspect_ratio || "4:5" });
            }
            throw new Error(event.message);
          }
          if (event.message) setStatusMessage(event.message);

          if (event.step === "analyzed" && event.analysis) {
            setAnalysis(event.analysis as Analysis);
          }

          if (event.step === "generating") {
            setPhase("generating");
            if (event.model) setGenInfo({ model: event.model, startedAt: event.started_at || Date.now() });
          }

          if (event.step === "completed" && event.image_url) {
            completed = true;
            setGeneratedImageUrl(event.image_url);
            setPromptUsed(event.prompt_used || null);
            if (event.aspect_ratio) setResultRatio(event.aspect_ratio);
            setPhase("done");
            playDoneSound();
          }
        }
      }

      // Stream ended without a completed event - server likely timed out
      if (!completed) {
        throw new Error("Generation timed out - please try again.");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setPhase("upload");
    } finally {
      setGenInfo(null);
    }
  }, [competitorImageUrl, competitorImageFile, product, notes, mode, imageModel, forms, person, refIds, format]);

  // Kie timed out: generate the image again from the finished prompt with the
  // fastest model, without redoing Claude's analysis.
  const handleTimeoutRetry = useCallback(async () => {
    unlockSound();
    if (!timeoutRetry) return;
    const fallback = "nano-banana-2";
    setError(null);
    setImageModel(fallback);
    setPhase("generating");
    setStatusMessage("Generating adapted image...");
    setGenInfo({ model: fallback, startedAt: Date.now() });
    try {
      const res = await fetch("/api/assets/image-swiper/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: timeoutRetry.prompt,
          ...(product && { product: product }),
          aspect_ratio: timeoutRetry.ratio,
          model: fallback,
          reference_ids: refIds,
          forms,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.image_url) throw new Error(json.error || `API error: ${res.status}`);
      setGeneratedImageUrl(json.image_url);
      setPromptUsed(timeoutRetry.prompt);
      setResultRatio(timeoutRetry.ratio);
      setTimeoutRetry(null);
      setPhase("done");
      playDoneSound();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("upload");
    } finally {
      setGenInfo(null);
    }
  }, [timeoutRetry, product, refIds, forms]);

  // Download straight to disk. A plain <a download> to the Supabase URL is
  // cross-origin, so the browser ignores "download" and opens the image
  // instead - and going back from there wiped the page (2026-10-01).
  const [downloading, setDownloading] = useState(false);
  const handleDownload = useCallback(async () => {
    if (!generatedImageUrl) return;
    setDownloading(true);
    try {
      const res = await fetch(generatedImageUrl);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const ext = blob.type === "image/png" ? "png" : "jpg";
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `swipe-${product || "style"}-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  }, [generatedImageUrl, product]);

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
    unlockSound();
    setRetrying(true);
    setError(null);
    setSaved(false);

    const retryRatio = resultRatio;

    // Inject edit instructions and the (possibly changed) format into the
    // prompt JSON. Replica prompts are plain text and go as-is.
    let finalPrompt = promptUsed;
    try {
      const parsed = JSON.parse(promptUsed);
      if (editInstructions.trim()) {
        parsed.instruction = (parsed.instruction || "") + ` EDIT INSTRUCTIONS: ${editInstructions.trim()}`;
      }
      if (parsed.composition) parsed.composition.aspect_ratio = retryRatio;
      finalPrompt = JSON.stringify(parsed);
    } catch {
      finalPrompt = promptUsed;
    }

    try {
      const res = await fetch("/api/assets/image-swiper/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: finalPrompt,
          ...(product && { product }),
          aspect_ratio: retryRatio,
          model: imageModel,
          reference_ids: refIds,
          forms,
          // Only Replica uses the original photo as a visual reference.
          ...(mode === "replica" && resolvedCompetitorUrl && { competitor_image_url: resolvedCompetitorUrl }),
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Retry failed: ${res.status}`);
      }

      const { image_url } = await res.json();
      setGeneratedImageUrl(image_url);
      playDoneSound();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setRetrying(false);
    }
  }, [promptUsed, product, editInstructions, resultRatio, mode, resolvedCompetitorUrl, imageModel, refIds, forms]);

  // Reset
  const handleReset = useCallback(() => {
    if (competitorImageUrl && competitorImageFile) URL.revokeObjectURL(competitorImageUrl);
    setPhase("upload");
    setCompetitorImageFile(null);
    setCompetitorImageUrl(null);
    setUrlInput("");
    setNotes("");
    setMode("standard");
    setError(null);
    setAnalysis(null);
    setGeneratedImageUrl(null);
    setPromptUsed(null);
    setResolvedCompetitorUrl(null);
    setStatusMessage("");
    setSaving(false);
    setSaved(false);
    setEditInstructions("");
    setShowSaveModal(false);
    setResultRatio("4:5");
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
            {timeoutRetry && (
              <button
                onClick={handleTimeoutRetry}
                className="mt-2 px-3 py-1.5 rounded-lg border border-red-300 bg-white text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Försök igen med Nano Banana 2
              </button>
            )}
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

          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Product <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <div className="flex gap-2">
                {products.map((p) => (
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

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Mode
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setMode("standard")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                    mode === "standard"
                      ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                      : "bg-white border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  )}
                >
                  Standard
                </button>
                <button
                  onClick={() => setMode("ugc")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                    mode === "ugc"
                      ? "bg-amber-50 border-amber-300 text-amber-700"
                      : "bg-white border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  )}
                >
                  UGC
                </button>
                <button
                  onClick={() => setMode("replica")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                    mode === "replica"
                      ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                      : "bg-white border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  )}
                >
                  Replica
                </button>
              </div>
            </div>
            {product && mode !== "replica" && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Produkten visas som
                </label>
                <div className="flex gap-2">
                  {SWIPE_FORM_OPTIONS.map((f) => {
                    const on = forms.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        onClick={() =>
                          setForms((cur) => {
                            const next = on ? cur.filter((x) => x !== f.id) : [...cur, f.id];
                            return next.length > 0 ? next : ["bottle"];
                          })
                        }
                        title={f.hint}
                        className={cn(
                          "px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                          on
                            ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                            : "bg-white border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
                        )}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Format
              </label>
              <div className="flex gap-2">
                {SWIPE_FORMATS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFormat(f.id)}
                    title={f.hint}
                    className={cn(
                      "px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                      format === f.id
                        ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                        : "bg-white border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    )}
                  >
                    {f.id === "original" ? "Original" : f.id}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Bildmodell
              </label>
              <select
                value={imageModel}
                onChange={(e) => setImageModel(e.target.value as ImageModelId)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                title="Bildmodell för generering och Retry"
              >
                {IMAGE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label} - {m.description}</option>
                ))}
              </select>
            </div>
          </div>

          {product && refImages.length > 1 && forms.includes("bottle") && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Produktreferens{" "}
                <span className="text-gray-400 font-normal">
                  (modellen kopierar flaskan som den ser ut här - välj en hällbild när flaskan ska luta eller hälla)
                </span>
              </label>
              <div className="flex gap-2 flex-wrap">
                {refImages.map((img) => {
                  const on = refIds.includes(img.id);
                  return (
                    <button
                      key={img.id}
                      onClick={() =>
                        setRefIds((cur) => {
                          const next = on ? cur.filter((x) => x !== img.id) : [...cur, img.id];
                          // Never empty: falls back to the hero images.
                          return next.length > 0 ? next : refImages.filter((r) => r.category === "hero").map((r) => r.id);
                        })
                      }
                      title={img.description || img.category}
                      className={cn(
                        "relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors",
                        on ? "border-indigo-500" : "border-gray-200 opacity-60 hover:opacity-100"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={img.description || img.category} className="w-full h-full object-cover" />
                      {on && <span className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-indigo-500 border border-white" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <details className="bg-gray-50 rounded-lg border border-gray-200 p-3">
            <summary className="text-xs font-medium text-gray-700 cursor-pointer select-none">
              Anpassa person <span className="text-gray-400 font-normal">(valfritt, annars samma som i bilden)</span>
            </summary>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {PERSON_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="block text-[11px] text-gray-500 mb-1">{field.label}</label>
                  <select
                    value={person[field.key] ?? ""}
                    onChange={(e) => setPerson((p) => ({ ...p, [field.key]: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-900 bg-white focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 focus:outline-none"
                  >
                    {field.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              ))}
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Hårfärg</label>
                <input
                  type="text"
                  value={person.hair_color ?? ""}
                  onChange={(e) => setPerson((p) => ({ ...p, hair_color: e.target.value }))}
                  placeholder="Från bilden"
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 focus:outline-none"
                />
              </div>
            </div>
          </details>

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
              {genInfo && (
                <p className="text-xs text-gray-400 tabular-nums">
                  {IMAGE_MODELS.find((m) => m.id === genInfo.model)?.label ?? genInfo.model}
                  {" · "}
                  {Math.floor(Math.max(0, now - genInfo.startedAt) / 60000)}:{String(Math.floor(Math.max(0, now - genInfo.startedAt) / 1000) % 60).padStart(2, "0")}
                </p>
              )}
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
                    Generated {product ? `(${product === "happysleep" ? "HappySleep" : "Collagen Formula"})` : "(Style)"}
                  </p>
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {downloading ? "Laddar ner..." : "Download"}
                  </button>
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
              <select
                value={imageModel}
                onChange={(e) => setImageModel(e.target.value as ImageModelId)}
                disabled={retrying}
                className="rounded-lg border border-gray-200 px-2 py-2 text-sm text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 disabled:opacity-50 max-w-[10rem]"
                title="Bildmodell för Retry"
              >
                {IMAGE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              <select
                value={resultRatio}
                onChange={(e) => setResultRatio(e.target.value)}
                disabled={retrying}
                className="rounded-lg border border-gray-200 px-2 py-2 text-sm text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 disabled:opacity-50"
                title="Format för Retry"
              >
                {[...new Set([...SWIPE_FORMATS.filter((f) => f.id !== "original").map((f) => f.id), resultRatio])].map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
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
                    {products.map((p) => (
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
