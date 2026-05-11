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
  Shuffle,
  Plus,
  Copy,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ASSET_CATEGORIES, type Asset, type AssetCategory, type Product } from "@/types";
import { useProducts } from "@/hooks/useProducts";

type Phase = "upload" | "uploading" | "analyzing" | "generating" | "done";

type Intensity = "subtle" | "moderate" | "dramatic";

interface Demographic {
  age: string;
  ethnicity?: string;
  hair_color: string;
  hair_style: string;
  eye_color: string;
  skin_tone: string;
  accent: string | null;
}

const BODY_ZONES: { value: string; label: string; image?: string }[] = [
  { value: "full_face_front", label: "Full face", image: "/images/body-zones/full_face_front.webp" },
  { value: "face_profile", label: "Profile", image: "/images/body-zones/face_profile.webp" },
  { value: "eye_area", label: "Eye area", image: "/images/body-zones/eye_area.webp" },
  { value: "forehead", label: "Forehead", image: "/images/body-zones/forehead.webp" },
  { value: "neck_decolletage", label: "Neck", image: "/images/body-zones/neck_decolletage.webp" },
  { value: "chest_macro", label: "Chest", image: "/images/body-zones/chest_macro.webp" },
  { value: "cheek_closeup", label: "Cheek", image: "/images/body-zones/cheek_closeup.webp" },
  { value: "arm_skin", label: "Arm", image: "/images/body-zones/arm_skin.webp" },
  { value: "leg_thigh", label: "Leg", image: "/images/body-zones/leg_thigh.webp" },
  { value: "hands", label: "Hands", image: "/images/body-zones/hands.webp" },
  { value: "hair_scalp", label: "Hair", image: "/images/body-zones/hair_scalp.webp" },
  { value: "other", label: "Other" },
];

const INTENSITIES: { value: Intensity; label: string; description: string }[] = [
  { value: "subtle", label: "Subtle", description: "Marginal improvement, barely noticeable" },
  { value: "moderate", label: "Moderate", description: "Clear improvement, still realistic" },
  { value: "dramatic", label: "Dramatic", description: "Striking improvement, stops short of unreal" },
];

const AGE_OPTIONS = [
  { value: "", label: "Random" },
  { value: "30-35", label: "30-35" },
  { value: "36-40", label: "36-40" },
  { value: "40-45", label: "40-45" },
  { value: "46-50", label: "46-50" },
  { value: "51-55", label: "51-55" },
  { value: "56-60", label: "56-60" },
  { value: "61-65", label: "61-65" },
  { value: "66-70", label: "66-70" },
  { value: "71-75", label: "71-75" },
];

const ETHNICITY_OPTIONS = [
  { value: "scandinavian", label: "Scandinavian (default)" },
  { value: "north_european", label: "Northern European" },
  { value: "mediterranean", label: "Mediterranean" },
  { value: "east_asian", label: "East Asian" },
  { value: "south_asian", label: "South Asian" },
  { value: "latin", label: "Latin / Hispanic" },
  { value: "middle_eastern", label: "Middle Eastern" },
  { value: "african", label: "African / African American" },
];

interface Props {
  onAssetCreated?: (asset: Asset) => void;
  defaultProduct?: Product | null;
}

function demographicLine(d: Demographic): string {
  const accent = d.accent ? `, ${d.accent}` : "";
  return `${d.age} yrs, ${d.hair_color}, ${d.hair_style}, ${d.eye_color} eyes, ${d.skin_tone}${accent}`;
}

function formatPrompt(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export default function BeforeAfterGenerator({ onAssetCreated, defaultProduct = null }: Props) {
  const products = useProducts();
  const [phase, setPhase] = useState<Phase>("upload");
  const [error, setError] = useState<string | null>(null);

  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [bodyZone, setBodyZone] = useState<string>("full_face_front");
  const [customZone, setCustomZone] = useState("");
  const [intensity, setIntensity] = useState<Intensity>("moderate");
  const [notes, setNotes] = useState("");
  const [age, setAge] = useState<string>("");
  const [ethnicity, setEthnicity] = useState<string>("scandinavian");
  const [hairColor, setHairColor] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [statusMessage, setStatusMessage] = useState("");
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [promptUsed, setPromptUsed] = useState<string | null>(null);
  const [demographic, setDemographic] = useState<Demographic | null>(null);
  const [detectedZone, setDetectedZone] = useState<string | null>(null);
  const [sourceDemographic, setSourceDemographic] = useState<{
    age: string | null;
    ethnicity: string | null;
    hair_color: string | null;
  } | null>(null);
  const [resolvedSourceUrl, setResolvedSourceUrl] = useState<string | null>(null);
  const [detectingZone, setDetectingZone] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [rerolling, setRerolling] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const detectAbortRef = useRef<AbortController | null>(null);

  const applyDetection = useCallback(
    (json: {
      zone?: string | null;
      demographic?: {
        age?: string | null;
        ethnicity?: string | null;
        hair_color?: string | null;
      } | null;
    }) => {
      const zone = json.zone;
      if (zone && zone !== "other") {
        setBodyZone(zone);
      }
      // Store source demographic as implicit fallback (NOT auto-filled in the
      // UI overrides - user picks those separately). Backend uses this when
      // the user doesn't override the corresponding field.
      if (json.demographic) {
        setSourceDemographic({
          age: json.demographic.age ?? null,
          ethnicity: json.demographic.ethnicity ?? null,
          hair_color: json.demographic.hair_color ?? null,
        });
      }
    },
    []
  );

  const detectZoneFromUrl = useCallback(async (imageUrl: string) => {
    detectAbortRef.current?.abort();
    const controller = new AbortController();
    detectAbortRef.current = controller;

    setDetectingZone(true);
    try {
      const res = await fetch("/api/assets/before-after/detect-zone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl }),
        signal: controller.signal,
      });
      if (!res.ok) return;
      const json = await res.json();
      applyDetection(json);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Silent fail - user can still pick manually
    } finally {
      if (detectAbortRef.current === controller) {
        setDetectingZone(false);
      }
    }
  }, [applyDetection]);

  const uploadAndDetect = useCallback(async (file: File) => {
    detectAbortRef.current?.abort();
    const controller = new AbortController();
    detectAbortRef.current = controller;

    setDetectingZone(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload-temp", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      if (!uploadRes.ok) return;
      const { url } = await uploadRes.json();
      setResolvedSourceUrl(url);

      // Now run detection with the uploaded URL
      const detectRes = await fetch("/api/assets/before-after/detect-zone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: url }),
        signal: controller.signal,
      });
      if (!detectRes.ok) return;
      const json = await detectRes.json();
      applyDetection(json);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Silent fail
    } finally {
      if (detectAbortRef.current === controller) {
        setDetectingZone(false);
      }
    }
  }, [applyDetection]);

  const handleFileSelect = useCallback((file: File) => {
    setError(null);
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setError("Please upload a JPG, PNG, or WebP image.");
      return;
    }
    const url = URL.createObjectURL(file);
    setSourceFile(file);
    setSourceUrl(url);
    setUrlInput("");
    setResolvedSourceUrl(null);
    setSourceDemographic(null);
    void uploadAndDetect(file);
  }, [uploadAndDetect]);

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
    const url = urlInput.trim();
    setSourceUrl(url);
    setSourceFile(null);
    setResolvedSourceUrl(url);
    setSourceDemographic(null);
    void detectZoneFromUrl(url);
  }, [urlInput, detectZoneFromUrl]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const text = e.clipboardData.getData("text");
      if (text.startsWith("http")) {
        e.preventDefault();
        setUrlInput(text);
        setTimeout(() => handleUrlSubmit(), 100);
      }
    },
    [handleUrlSubmit]
  );

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

  const runGeneration = useCallback(
    async (overrides?: { reuseSourceUrl?: string }) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setError(null);
      setGeneratedImageUrl(null);
      setPromptUsed(null);
      setDetectedZone(null);

      try {
        let imageUrl: string | null = overrides?.reuseSourceUrl ?? resolvedSourceUrl ?? null;

        if (!imageUrl && sourceFile && !sourceUrl?.startsWith("http")) {
          setPhase("uploading");
          setStatusMessage("Uploading source image...");
          const formData = new FormData();
          formData.append("file", sourceFile);
          const uploadRes = await fetch("/api/upload-temp", {
            method: "POST",
            body: formData,
            signal: controller.signal,
          });
          if (!uploadRes.ok) throw new Error("Failed to upload image");
          const { url } = await uploadRes.json();
          imageUrl = url;
        } else if (!imageUrl && sourceUrl?.startsWith("http")) {
          imageUrl = sourceUrl;
        }

        if (imageUrl) setResolvedSourceUrl(imageUrl);

        setPhase(imageUrl ? "analyzing" : "generating");
        setStatusMessage(imageUrl ? "Analyzing source image..." : "Generating before/after image...");

        const res = await fetch("/api/assets/before-after", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: imageUrl || undefined,
            body_zone: bodyZone,
            custom_zone: bodyZone === "other" ? customZone.trim() : undefined,
            intensity,
            notes: notes.trim() || undefined,
            age: age || undefined,
            ethnicity: ethnicity || undefined,
            hair_color: hairColor.trim() || undefined,
            source_demographic: sourceDemographic ?? undefined,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `API error: ${res.status}`);
        }

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

            if (event.step === "error") throw new Error(event.message);
            if (event.message) setStatusMessage(event.message);

            if (event.step === "analyzed") {
              if (event.detected_zone) setDetectedZone(event.detected_zone);
            }
            if (event.step === "generating") {
              setPhase("generating");
              if (event.demographic) setDemographic(event.demographic);
            }
            if (event.step === "completed" && event.image_url) {
              completed = true;
              setGeneratedImageUrl(event.image_url);
              setPromptUsed(event.prompt_used || null);
              if (event.demographic) setDemographic(event.demographic);
              if (event.detected_zone) setDetectedZone(event.detected_zone);
              setPhase("done");
            }
          }
        }

        if (!completed) throw new Error("Generation timed out - please try again.");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setPhase("upload");
      }
    },
    [sourceFile, sourceUrl, bodyZone, customZone, intensity, notes, age, ethnicity, hairColor, sourceDemographic]
  );

  const handleGenerate = useCallback(() => {
    if (bodyZone === "other" && !customZone.trim()) {
      setError("Please describe the body zone, or pick a preset.");
      return;
    }
    void runGeneration();
  }, [bodyZone, customZone, runGeneration]);

  const handleReroll = useCallback(async () => {
    setRerolling(true);
    try {
      await runGeneration({ reuseSourceUrl: resolvedSourceUrl ?? undefined });
    } finally {
      setRerolling(false);
    }
  }, [runGeneration, resolvedSourceUrl]);

  const [editInstructions, setEditInstructions] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);

  const handleCopyPrompt = useCallback(() => {
    if (!promptUsed) return;
    void navigator.clipboard.writeText(formatPrompt(promptUsed));
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 1500);
  }, [promptUsed]);
  const handleRetry = useCallback(async () => {
    if (!promptUsed) return;
    setRetrying(true);
    setError(null);

    try {
      const res = await fetch("/api/assets/before-after/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptUsed,
          image_url: resolvedSourceUrl || undefined,
          edit_instructions: editInstructions.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Retry failed: ${res.status}`);
      }

      const json = await res.json();
      setGeneratedImageUrl(json.image_url);
      if (json.prompt_used) setPromptUsed(json.prompt_used);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setRetrying(false);
    }
  }, [promptUsed, resolvedSourceUrl, editInstructions]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveCategory, setSaveCategory] = useState<AssetCategory>("before_after");
  const [saveProduct, setSaveProduct] = useState<Product | null>(defaultProduct);

  const autoSaveName = useCallback(() => {
    const zoneLabel = BODY_ZONES.find((z) => z.value === bodyZone)?.label ?? "B/A";
    const ageBit = demographic?.age ? ` - ${demographic.age}` : "";
    return `Before/After - ${zoneLabel}${ageBit}`;
  }, [bodyZone, demographic]);

  const handleOpenSaveModal = useCallback(() => {
    setSaveName(autoSaveName());
    setSaveCategory("before_after");
    setSaveProduct(defaultProduct);
    setShowSaveModal(true);
  }, [autoSaveName, defaultProduct]);

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
          name: saveName.trim() || "Before/After",
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

  const handleReset = useCallback(() => {
    if (sourceUrl && sourceFile) URL.revokeObjectURL(sourceUrl);
    setPhase("upload");
    setSourceFile(null);
    setSourceUrl(null);
    setUrlInput("");
    setBodyZone("full_face_front");
    setCustomZone("");
    setIntensity("moderate");
    setNotes("");
    setAge("");
    setEthnicity("scandinavian");
    setHairColor("");
    setError(null);
    setGeneratedImageUrl(null);
    setPromptUsed(null);
    setDemographic(null);
    setDetectedZone(null);
    setResolvedSourceUrl(null);
    setSourceDemographic(null);
    setStatusMessage("");
    setSaving(false);
    setSaved(false);
    setEditInstructions("");
    setShowSaveModal(false);
  }, [sourceUrl, sourceFile]);

  const swipeMode = Boolean(sourceUrl);

  const formControls = (
    <>
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <label className="block text-xs font-medium text-gray-700">Body zone</label>
          {detectingZone && (
            <span className="flex items-center gap-1 text-xs text-indigo-600">
              <Loader2 className="w-3 h-3 animate-spin" />
              Detecting from source...
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {BODY_ZONES.map((z) => {
            const isActive = bodyZone === z.value;
            const isOther = z.value === "other";
            return (
              <button
                key={z.value}
                onClick={() => setBodyZone(z.value)}
                className={cn(
                  "group relative rounded-lg overflow-hidden border-2 text-left transition-all",
                  isActive
                    ? "border-indigo-500 ring-2 ring-indigo-200"
                    : "border-gray-200 hover:border-gray-300"
                )}
              >
                <div className="aspect-square w-full bg-gray-100 flex items-center justify-center overflow-hidden">
                  {z.image ? (
                    <img
                      src={z.image}
                      alt={z.label}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-gray-400">
                      <Plus className="w-6 h-6" />
                      <span className="text-[10px] uppercase tracking-wide">{isOther ? "Custom" : ""}</span>
                    </div>
                  )}
                </div>
                <div
                  className={cn(
                    "px-2 py-1.5 text-xs font-medium text-center transition-colors",
                    isActive ? "bg-indigo-50 text-indigo-700" : "bg-white text-gray-600"
                  )}
                >
                  {z.label}
                </div>
              </button>
            );
          })}
        </div>
        {bodyZone === "other" && (
          <input
            type="text"
            value={customZone}
            onChange={(e) => setCustomZone(e.target.value)}
            placeholder="Describe the body zone (e.g. 'tight crop on the brow bone between the brows')"
            className="w-full mt-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 focus:outline-none"
          />
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Intensity</label>
        <div className="flex gap-2">
          {INTENSITIES.map((i) => (
            <button
              key={i.value}
              onClick={() => setIntensity(i.value)}
              title={i.description}
              className={cn(
                "flex-1 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                intensity === i.value
                  ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                  : "bg-white border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
            >
              {i.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {INTENSITIES.find((i) => i.value === intensity)?.description}
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          Notes <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. 'subtle freckles' or 'wearing thin glasses'"
          className="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 focus:outline-none"
        />
      </div>

      <details className="bg-gray-50 rounded-lg border border-gray-200 p-3">
        <summary className="text-xs font-medium text-gray-700 cursor-pointer select-none">
          Customize person <span className="text-gray-400 font-normal">(optional)</span>
        </summary>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Age</label>
            <select
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-900 bg-white focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 focus:outline-none"
            >
              {AGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Ethnicity</label>
            <select
              value={ethnicity}
              onChange={(e) => setEthnicity(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-900 bg-white focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 focus:outline-none"
            >
              {ETHNICITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Hair color</label>
            <input
              type="text"
              value={hairColor}
              onChange={(e) => setHairColor(e.target.value)}
              placeholder="Random"
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 focus:outline-none"
            />
          </div>
        </div>
      </details>
    </>
  );

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Error</p>
            <p className="text-sm text-red-600 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {phase === "upload" && (
        <div className="space-y-4">
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-xl text-center cursor-pointer transition-colors",
              sourceUrl
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
            {sourceUrl ? (
              <div className="flex items-center gap-3">
                <img src={sourceUrl} alt="Source" className="h-20 rounded border border-gray-200" />
                <div className="text-left flex-1">
                  <p className="text-xs font-medium text-gray-700">Source loaded - ready to swipe</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {detectingZone
                      ? "Analyzing source..."
                      : "Everything is auto-detected. Just click Generate below, or expand Customize to tweak."}
                  </p>
                  <p className="text-xs text-indigo-600 mt-0.5">Click image to change source</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="w-8 h-8 text-gray-400 mx-auto" />
                <p className="text-sm font-medium text-gray-700">Drop, paste, or click to browse (optional)</p>
                <p className="text-xs text-gray-400">Use a competitor B/A as composition reference - or skip to generate from scratch.</p>
              </div>
            )}
          </div>

          {!sourceUrl && (
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

          {swipeMode ? (
            <details className="bg-gray-50 rounded-lg border border-gray-200 p-3">
              <summary className="text-xs font-medium text-gray-700 cursor-pointer select-none">
                Customize <span className="text-gray-400 font-normal">(optional - tweak what was auto-detected from source)</span>
              </summary>
              <div className="mt-4 space-y-4">
                {formControls}
              </div>
            </details>
          ) : (
            formControls
          )}

          <button
            onClick={handleGenerate}
            disabled={detectingZone}
            className={cn(
              "w-full py-2.5 rounded-lg text-sm font-semibold transition-colors",
              detectingZone
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            )}
          >
            {detectingZone
              ? "Analyzing source..."
              : swipeMode
              ? "Generate near-clone"
              : "Generate Before/After"}
          </button>
        </div>
      )}

      {(phase === "uploading" || phase === "analyzing" || phase === "generating") && (
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="flex flex-col items-center gap-4">
            {phase === "uploading" ? (
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-indigo-600 animate-pulse" />
              </div>
            )}
            <p className="text-sm font-medium text-gray-900">{statusMessage}</p>
            {phase === "generating" && demographic && (
              <p className="text-xs text-gray-400 max-w-md text-center">
                Generating with: {demographicLine(demographic)}
              </p>
            )}
            {phase !== "uploading" && (
              <button
                onClick={handleCancel}
                className="mt-2 flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-4 py-1.5 rounded-lg transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <span className="text-sm font-medium text-gray-900">Before/After generated</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReroll}
                disabled={rerolling || retrying || saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
              >
                <Shuffle className={cn("w-3.5 h-3.5", rerolling && "animate-spin")} />
                {rerolling ? "Re-rolling..." : "Re-roll demographic"}
              </button>
              <button
                onClick={handleOpenSaveModal}
                disabled={saving || saved}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50",
                  saved ? "bg-green-50 text-green-700" : "bg-indigo-600 text-white hover:bg-indigo-700"
                )}
              >
                {saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
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

          <div className={cn("grid gap-4", sourceUrl ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1")}>
            {sourceUrl && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Source reference</p>
                <img src={sourceUrl} alt="Source" className="w-full rounded-lg border border-gray-100" />
                {detectedZone && (
                  <p className="text-xs text-gray-400 mt-2">Detected zone: <span className="font-medium text-gray-600">{detectedZone}</span></p>
                )}
              </div>
            )}
            {generatedImageUrl && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Generated</p>
                  <a
                    href={generatedImageUrl}
                    download={`before-after-${Date.now()}.png`}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </a>
                </div>
                <img src={generatedImageUrl} alt="Generated" className="w-full rounded-lg border border-gray-100" />
                {demographic && (
                  <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                    <span className="font-medium text-gray-600">Slumpad demografi:</span> {demographicLine(demographic)}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Edit instructions <span className="text-gray-400 font-normal">(optional - describe what to change)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={editInstructions}
                onChange={(e) => setEditInstructions(e.target.value)}
                placeholder="e.g. 'make the after-half slightly more subtle' or 'add light freckles'"
                className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !retrying) handleRetry();
                }}
              />
              <button
                onClick={handleRetry}
                disabled={retrying || saving || rerolling}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", retrying && "animate-spin")} />
                {retrying ? "Regenerating..." : editInstructions.trim() ? "Regenerate with edits" : "Retry"}
              </button>
            </div>
          </div>

          {promptUsed && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Full prompt used</p>
                <button
                  onClick={handleCopyPrompt}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  {promptCopied ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <pre className="text-[11px] text-gray-600 bg-gray-50 rounded-lg p-3 overflow-auto max-h-96 font-mono leading-relaxed whitespace-pre-wrap break-words">
                {formatPrompt(promptUsed)}
              </pre>
            </div>
          )}

          {showSaveModal && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
              onClick={() => setShowSaveModal(false)}
            >
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-base font-semibold text-gray-900">Save to Assets</h3>
                  <button onClick={() => setShowSaveModal(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {generatedImageUrl && (
                  <img src={generatedImageUrl} alt="Preview" className="w-full h-40 object-cover rounded-lg border border-gray-100 mb-4" />
                )}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Name</label>
                  <input
                    type="text"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 focus:outline-none"
                  />
                </div>
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
                <div className="mb-6">
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Product</label>
                  <div className="flex gap-2 flex-wrap">
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
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
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
