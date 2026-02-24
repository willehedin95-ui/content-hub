"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  X,
  Image as ImageIcon,
  Wand2,
  Loader2,
  RefreshCw,
  Pencil,
  AlertCircle,
} from "lucide-react";
import type { ProductImage, ImageAnalysis, ImageGenerationState } from "@/types";

interface Props {
  pageImages: { src: string; alt: string }[];
  productImages: ProductImage[];
  productId: string;
  angle: string;
  replacements: Record<string, string>;
  onReplacementsChange: (replacements: Record<string, string>) => void;
}

export default function ImageMapper({
  pageImages,
  productImages,
  productId,
  angle,
  replacements,
  onReplacementsChange,
}: Props) {
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [aiSelected, setAiSelected] = useState<Set<string>>(new Set());
  const [genStates, setGenStates] = useState<
    Record<string, ImageGenerationState>
  >({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null);

  function handlePick(originalSrc: string, newSrc: string) {
    onReplacementsChange({ ...replacements, [originalSrc]: newSrc });
    setPickingFor(null);
  }

  function handleRemoveReplacement(originalSrc: string) {
    const next = { ...replacements };
    delete next[originalSrc];
    onReplacementsChange(next);
    // Also clear AI generation state if any
    setGenStates((prev) => {
      const next = { ...prev };
      delete next[originalSrc];
      return next;
    });
  }

  function toggleAiSelect(src: string) {
    setAiSelected((prev) => {
      const next = new Set(prev);
      if (next.has(src)) {
        next.delete(src);
      } else {
        next.add(src);
      }
      return next;
    });
  }

  // Filter out tiny images (likely icons/tracking pixels)
  const meaningfulImages = pageImages.filter((img) => {
    const src = img.src.toLowerCase();
    return (
      !src.includes("pixel") &&
      !src.includes("tracking") &&
      !src.includes("favicon") &&
      !src.endsWith(".svg") &&
      !src.includes("1x1")
    );
  });

  async function handleAnalyze() {
    if (aiSelected.size === 0) return;
    setIsAnalyzing(true);

    // Mark selected images as analyzing
    const initialStates: Record<string, ImageGenerationState> = {};
    aiSelected.forEach((src) => {
      initialStates[src] = { src, status: "analyzing" };
    });
    setGenStates((prev) => ({ ...prev, ...initialStates }));

    try {
      const selectedImages = meaningfulImages.filter((img) =>
        aiSelected.has(img.src)
      );

      const res = await fetch("/api/swipe/analyze-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: selectedImages,
          productId,
          angle,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Analysis failed");
      }

      const { analyses, failures } = (await res.json()) as {
        analyses: {
          src: string;
          analysis: ImageAnalysis;
          nanoBananaPrompt: string;
          referenceImages: string[];
        }[];
        failures?: { src: string; error: string }[];
      };

      const updatedStates: Record<string, ImageGenerationState> = {};

      for (const a of analyses) {
        updatedStates[a.src] = {
          src: a.src,
          status: "prompt-ready",
          analysis: a.analysis,
          prompt: a.nanoBananaPrompt,
          referenceImages: a.referenceImages,
        };
      }

      if (failures) {
        for (const f of failures) {
          updatedStates[f.src] = {
            src: f.src,
            status: "error",
            error: f.error,
          };
        }
      }

      setGenStates((prev) => ({ ...prev, ...updatedStates }));
    } catch (err) {
      // Mark all as error
      const errorStates: Record<string, ImageGenerationState> = {};
      aiSelected.forEach((src) => {
        errorStates[src] = {
          src,
          status: "error",
          error: err instanceof Error ? err.message : "Analysis failed",
        };
      });
      setGenStates((prev) => ({ ...prev, ...errorStates }));
    }

    setIsAnalyzing(false);
  }

  async function handleGenerate(src: string) {
    const state = genStates[src];
    if (!state?.prompt) return;

    setGenStates((prev) => ({
      ...prev,
      [src]: { ...prev[src], status: "generating" },
    }));

    try {
      const res = await fetch("/api/swipe/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: state.prompt,
          referenceImages: state.referenceImages || [],
          originalSrc: src,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Generation failed");
      }

      const { generatedUrl } = await res.json();

      setGenStates((prev) => ({
        ...prev,
        [src]: { ...prev[src], status: "done", generatedUrl },
      }));

      // Auto-apply as replacement
      onReplacementsChange({ ...replacements, [src]: generatedUrl });
    } catch (err) {
      setGenStates((prev) => ({
        ...prev,
        [src]: {
          ...prev[src],
          status: "error",
          error: err instanceof Error ? err.message : "Generation failed",
        },
      }));
    }
  }

  async function handleGenerateAll() {
    const readyImages = Object.entries(genStates).filter(
      ([, s]) => s.status === "prompt-ready"
    );
    for (const [src] of readyImages) {
      handleGenerate(src);
    }
  }

  function handlePromptEdit(src: string, newPrompt: string) {
    setGenStates((prev) => ({
      ...prev,
      [src]: { ...prev[src], prompt: newPrompt },
    }));
  }

  if (meaningfulImages.length === 0) return null;

  const hasAiSelected = aiSelected.size > 0;
  const hasPromptReady = Object.values(genStates).some(
    (s) => s.status === "prompt-ready"
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-900">
          Replace Images
        </h3>
        {hasPromptReady && (
          <button
            onClick={handleGenerateAll}
            className="flex items-center gap-1.5 text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 transition-colors"
          >
            <Wand2 className="w-3 h-3" />
            Generate All Ready
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Check images for AI replacement, or click &quot;Replace&quot; to pick
        from your product bank
      </p>

      <div className="space-y-3">
        {meaningfulImages.map((img, i) => {
          const replacement = replacements[img.src];
          const isReplaced = !!replacement;
          const genState = genStates[img.src];
          const isAiSelected = aiSelected.has(img.src);

          return (
            <div key={`${img.src}-${i}`} className="space-y-2">
              {/* Image row */}
              <div
                className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${
                  isReplaced
                    ? "border-emerald-200 bg-emerald-50/50"
                    : isAiSelected
                      ? "border-violet-200 bg-violet-50/30"
                      : "border-gray-100 hover:border-gray-200"
                }`}
              >
                {/* AI checkbox */}
                <input
                  type="checkbox"
                  checked={isAiSelected}
                  onChange={() => toggleAiSelect(img.src)}
                  disabled={isReplaced || genState?.status === "generating"}
                  className="w-4 h-4 text-violet-600 rounded border-gray-300 shrink-0"
                />

                {/* Original image */}
                <div className="relative shrink-0">
                  <img
                    src={img.src}
                    alt={img.alt}
                    className="w-16 h-16 rounded-md object-cover border border-gray-200"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  {isReplaced && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                </div>

                {/* Arrow + replacement */}
                {isReplaced && (
                  <>
                    <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
                    <img
                      src={replacement}
                      alt="Replacement"
                      className="w-16 h-16 rounded-md object-cover border border-emerald-200 shrink-0"
                    />
                  </>
                )}

                {/* Info & actions */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 truncate">
                    {img.alt || img.src.split("/").pop()?.slice(0, 40)}
                  </p>
                  {genState?.status === "analyzing" && (
                    <p className="text-xs text-violet-500 flex items-center gap-1 mt-0.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Analyzing...
                    </p>
                  )}
                  {genState?.status === "generating" && (
                    <p className="text-xs text-violet-500 flex items-center gap-1 mt-0.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Generating (up to 5 min)...
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {isReplaced ? (
                    <button
                      onClick={() => handleRemoveReplacement(img.src)}
                      className="text-xs text-gray-400 hover:text-red-500 p-1 rounded"
                      title="Remove replacement"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setPickingFor(img.src)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                    >
                      Replace
                    </button>
                  )}
                </div>
              </div>

              {/* AI generation panel */}
              {genState?.status === "prompt-ready" && (
                <div className="ml-10 p-3 bg-violet-50/50 border border-violet-200 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-violet-700">
                      AI Replacement Prompt
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          setEditingPrompt(
                            editingPrompt === img.src ? null : img.src
                          )
                        }
                        className="text-xs text-violet-600 hover:text-violet-800 p-1 rounded hover:bg-violet-100 transition-colors"
                        title="Edit prompt"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleGenerate(img.src)}
                        className="flex items-center gap-1 text-xs bg-violet-600 text-white px-2.5 py-1 rounded-md hover:bg-violet-700 transition-colors"
                      >
                        <Wand2 className="w-3 h-3" />
                        Generate
                      </button>
                    </div>
                  </div>

                  {genState.analysis && (
                    <p className="text-xs text-gray-500">
                      <span className="font-medium">Detected:</span>{" "}
                      {genState.analysis.subjects}
                    </p>
                  )}

                  {editingPrompt === img.src ? (
                    <textarea
                      value={genState.prompt || ""}
                      onChange={(e) =>
                        handlePromptEdit(img.src, e.target.value)
                      }
                      className="w-full text-xs bg-white border border-violet-200 rounded-md p-2 focus:outline-none focus:border-violet-400 resize-y min-h-[80px]"
                      rows={4}
                    />
                  ) : (
                    <p className="text-xs text-gray-600 line-clamp-2">
                      {genState.prompt}
                    </p>
                  )}
                </div>
              )}

              {/* Done state with regenerate option */}
              {genState?.status === "done" && genState.generatedUrl && (
                <div className="ml-10 p-3 bg-emerald-50/50 border border-emerald-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-emerald-700">
                      AI Generated — Applied
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          // Remove the replacement but keep genState as prompt-ready
                          const next = { ...replacements };
                          delete next[img.src];
                          onReplacementsChange(next);
                          setGenStates((prev) => ({
                            ...prev,
                            [img.src]: {
                              ...prev[img.src],
                              status: "prompt-ready",
                            },
                          }));
                        }}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Regenerate
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Error state */}
              {genState?.status === "error" && (
                <div className="ml-10 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <p className="text-xs text-red-700">
                      {genState.error || "Something went wrong"}
                    </p>
                    <button
                      onClick={() => {
                        setGenStates((prev) => {
                          const next = { ...prev };
                          delete next[img.src];
                          return next;
                        });
                      }}
                      className="text-xs text-red-500 hover:text-red-700 ml-auto"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* AI Generate button */}
      {hasAiSelected && !isAnalyzing && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <button
            onClick={handleAnalyze}
            className="flex items-center gap-2 bg-violet-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-violet-700 transition-colors"
          >
            <Wand2 className="w-4 h-4" />
            Analyze & Generate Prompts ({aiSelected.size} selected)
          </button>
          <p className="text-xs text-gray-400 mt-1.5">
            GPT-4o will analyze each image and create a generation prompt for
            Nano Banana Pro
          </p>
        </div>
      )}

      {isAnalyzing && (
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-violet-600" />
          <p className="text-sm text-violet-600">
            Analyzing {aiSelected.size} images with GPT-4o...
          </p>
        </div>
      )}

      {/* Picker modal (manual replacement) */}
      {pickingFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPickingFor(null);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg max-h-[80vh] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">
                Pick Replacement Image
              </h4>
              <button
                onClick={() => setPickingFor(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {productImages.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <ImageIcon className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">
                    No product images yet. Add them in the Product Bank.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {productImages.map((pImg) => (
                    <button
                      key={pImg.id}
                      onClick={() => handlePick(pickingFor, pImg.url)}
                      className="group relative rounded-lg overflow-hidden border border-gray-200 hover:border-indigo-400 transition-colors"
                    >
                      <img
                        src={pImg.url}
                        alt={pImg.alt_text || "Product image"}
                        className="w-full aspect-square object-cover"
                      />
                      <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/10 transition-colors flex items-center justify-center">
                        <Check className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 drop-shadow-lg transition-opacity" />
                      </div>
                      {pImg.description && (
                        <p className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1.5 py-0.5 truncate">
                          {pImg.description}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
