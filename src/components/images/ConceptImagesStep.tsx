"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2,
  Loader2,
  AlertTriangle,
  RotateCcw,
  Square,
  EyeOff,
  Plus,
  Sparkles,
} from "lucide-react";
import { ImageJob, SourceImage, Language, LANGUAGES, ProductSegment } from "@/types";
import { KIE_IMAGE_COST } from "@/lib/pricing";
import { STATIC_STYLES, REPTILE_TRIGGERS } from "@/lib/constants";

/* ------------------------------------------------------------------ */
/*  Sub-components (TabButton, ElapsedTimer, ProcessingTimer, badges)  */
/* ------------------------------------------------------------------ */

function TabButton({
  active,
  onClick,
  label,
  count,
  completed,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  completed?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
        active
          ? "text-indigo-600 border-indigo-500"
          : "text-gray-400 hover:text-gray-700 border-transparent"
      }`}
    >
      {label}
      <span
        className={`px-1.5 py-0.5 rounded text-xs font-medium ${
          completed !== undefined && completed === count
            ? "bg-emerald-50 text-emerald-600"
            : "bg-gray-200 text-gray-500"
        }`}
      >
        {completed !== undefined ? `${completed}/${count}` : count}
      </span>
    </button>
  );
}

function ElapsedTimer() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return (
    <span className="tabular-nums">
      {mins > 0 ? `${mins}m ${secs.toString().padStart(2, "0")}s` : `${secs}s`}
    </span>
  );
}

function ProcessingTimer({ startTime, processedCount, remainingCount }: {
  startTime: number;
  processedCount: number;
  remainingCount: number;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsed = Math.floor((now - startTime) / 1000);
  const elapsedMin = Math.floor(elapsed / 60);
  const elapsedSec = elapsed % 60;
  const elapsedStr = elapsedMin > 0
    ? `${elapsedMin}m ${elapsedSec.toString().padStart(2, "0")}s`
    : `${elapsedSec}s`;

  let etaStr = "";
  if (processedCount > 0 && remainingCount > 0) {
    const avgPerItem = elapsed / processedCount;
    const etaSec = Math.ceil(avgPerItem * remainingCount);
    const etaMin = Math.floor(etaSec / 60);
    const etaRemSec = etaSec % 60;
    etaStr = etaMin > 0
      ? `~${etaMin}m ${etaRemSec.toString().padStart(2, "0")}s left`
      : `~${etaRemSec}s left`;
  }

  return (
    <span className="text-xs text-gray-400 tabular-nums">
      {elapsedStr}{etaStr && <> &middot; {etaStr}</>}
    </span>
  );
}

function TranslationStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <span className="flex items-center gap-1 text-xs text-emerald-600">
          <CheckCircle2 className="w-3 h-3" />
          Ready
        </span>
      );
    case "processing":
      return (
        <span className="flex items-center gap-1 text-xs text-indigo-600">
          <Loader2 className="w-3 h-3 animate-spin" />
          Generating...
        </span>
      );
    case "failed":
      return (
        <span className="flex items-center gap-1 text-xs text-red-600">
          <AlertTriangle className="w-3 h-3" />
          Failed
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <Loader2 className="w-3 h-3" />
          Pending
        </span>
      );
  }
}

function ExpandablePrompt({ prompt }: { prompt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-1.5 py-1 border-t border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors w-full text-left"
      >
        {open ? "Hide prompt" : "Show prompt"}
      </button>
      {open && (
        <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed whitespace-pre-wrap">
          {prompt}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface ConceptImagesStepProps {
  job: ImageJob;
  sourceImages: SourceImage[];
  // Computed counts
  totalCount: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  langCounts: Map<string, { total: number; completed: number }>;
  // Filtered images for display
  filteredImages: Array<SourceImage & { image_translations?: SourceImage["image_translations"] }>;
  // Processing state
  proc: {
    processing: boolean;
    startTime: number | null;
    processedInSession: number;
    refreshing: boolean;
  };
  // Tab state
  activeTab: "all" | string;
  setActiveTab: (tab: "all" | string) => void;
  // Language selection (ready state)
  selectedLanguages: Set<Language>;
  setSelectedLanguages: React.Dispatch<React.SetStateAction<Set<Language>>>;
  // Translate confirm dialog
  showTranslateConfirm: boolean;
  setShowTranslateConfirm: (show: boolean) => void;
  handleTranslateAll: () => void;
  // Add language
  showAddLang: boolean;
  setShowAddLang: (show: boolean) => void;
  addLangSelected: Set<Language>;
  setAddLangSelected: React.Dispatch<React.SetStateAction<Set<Language>>>;
  addLangLoading: boolean;
  handleAddLanguages: () => void;
  // Image actions
  setPreviewImage: (si: SourceImage | null) => void;
  setPreviewLang: (lang: string | null) => void;
  handleCancel: () => void;
  handleRetryAll: () => void;
  handleRetrySingle: (translationId: string) => void;
  // Static ad generation
  generateState?: {
    generating: boolean;
    count: number;
    selectedStyles: string[];
    setCount: (n: number) => void;
    setSelectedStyles: (styles: string[]) => void;
    segmentId: string | null;
    setSegmentId: (id: string | null) => void;
    segments: ProductSegment[];
    progress: string | null;
    error: string | null;
    results: Array<{ label: string; original_url: string; style?: string; reptileTriggers?: string[]; prompt?: string }> | null;
  };
  handleGenerateStatic?: () => void;
  // Re-roll
  onReroll?: (sourceImageId: string) => void;
  rerollingId?: string | null;
  // Skip translation toggle
  onToggleSkip?: (sourceImageId: string, skip: boolean) => void;
  // 9:16 generation
  handleGenerate9x16?: () => void;
  show9x16Button?: boolean;
  count9x16?: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ConceptImagesStep({
  job,
  sourceImages,
  totalCount,
  completedCount,
  failedCount,
  pendingCount,
  langCounts,
  filteredImages,
  proc,
  activeTab,
  setActiveTab,
  selectedLanguages,
  setSelectedLanguages,
  showTranslateConfirm,
  setShowTranslateConfirm,
  handleTranslateAll,
  showAddLang,
  setShowAddLang,
  addLangSelected,
  setAddLangSelected,
  addLangLoading,
  handleAddLanguages,
  setPreviewImage,
  setPreviewLang,
  handleCancel,
  handleRetryAll,
  handleRetrySingle,
  generateState,
  handleGenerateStatic,
  onReroll,
  rerollingId,
  onToggleSkip,
  handleGenerate9x16,
  show9x16Button,
  count9x16,
}: ConceptImagesStepProps) {
  // Show generate section when job has visual_direction and isn't processing
  const showGenerateSection = !!job.visual_direction && job.status !== "processing" && handleGenerateStatic;
  const hasExistingImages = sourceImages.length > 0;

  // Existing styles that have already been generated
  const existingStyles = new Set(sourceImages.map(si => si.generation_style).filter(Boolean));

  const renderGenerateSection = () => {
    if (!showGenerateSection || !generateState) return null;
    return (
      <div className={`bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-6 ${hasExistingImages ? "mt-4" : "mb-6"}`}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          <h3 className="text-base font-semibold text-gray-900">
            {hasExistingImages ? "Generate More Styles" : "Generate Static Ads"}
          </h3>
        </div>

        {/* Style picker */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Styles to generate
          </label>
          <div className="flex flex-wrap gap-2">
            {STATIC_STYLES.map((style) => {
              const selected = generateState.selectedStyles.includes(style.id);
              const alreadyGenerated = existingStyles.has(style.id);
              const isNative = style.id.startsWith("native-");
              return (
                <button
                  key={style.id}
                  onClick={() => {
                    const next = selected
                      ? generateState.selectedStyles.filter((s) => s !== style.id)
                      : generateState.selectedStyles.length >= 5
                        ? generateState.selectedStyles
                        : [...generateState.selectedStyles, style.id];
                    generateState.setSelectedStyles(next);
                  }}
                  disabled={generateState.generating}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    selected
                      ? isNative
                        ? "bg-amber-50 border-amber-300 text-amber-700"
                        : "bg-indigo-50 border-indigo-300 text-indigo-700"
                      : "bg-white border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300"
                  } disabled:opacity-50`}
                  title={`${style.description}${alreadyGenerated ? " (already generated)" : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/styles/${style.id}.svg`} alt="" className="w-6 h-6 rounded object-cover" />
                  {style.label}
                  {alreadyGenerated && <span className="text-emerald-500 text-[10px]">&#10003;</span>}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            {generateState.selectedStyles.length}/5 selected
            {generateState.selectedStyles.length > 0 && (
              <> &middot; ~${(0.04 + generateState.selectedStyles.length * KIE_IMAGE_COST).toFixed(2)}</>
            )}
          </p>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerateStatic}
          disabled={generateState.generating || generateState.selectedStyles.length === 0}
          className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 flex items-center gap-2"
        >
          {generateState.generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate {generateState.selectedStyles.length} Static Ad{generateState.selectedStyles.length !== 1 ? "s" : ""}
            </>
          )}
        </button>

        {/* Progress */}
        {generateState.progress && (
          <p className="mt-3 text-sm text-indigo-600">{generateState.progress}</p>
        )}

        {/* Skeleton placeholders while generating — disappear as images arrive in the grid */}
        {generateState.generating && (() => {
          const pendingStyles = generateState.selectedStyles.filter(
            styleId => !existingStyles.has(styleId)
          );
          const doneCount = generateState.selectedStyles.length - pendingStyles.length;
          return (
            <div className="mt-4">
              <div className="flex items-center gap-2 text-sm text-indigo-600 mb-3">
                <Loader2 className="w-4 h-4 animate-spin" />
                {doneCount > 0
                  ? <>{doneCount} of {generateState.selectedStyles.length} done...</>
                  : <>Generating {generateState.selectedStyles.length} image{generateState.selectedStyles.length !== 1 ? "s" : ""}...</>
                }
                <span className="text-gray-400 text-xs"><ElapsedTimer /></span>
              </div>
              {pendingStyles.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {pendingStyles.map((styleId) => {
                    const styleInfo = STATIC_STYLES.find(s => s.id === styleId);
                    return (
                      <div key={styleId} className="rounded-lg overflow-hidden border border-gray-200">
                        <div className="aspect-square bg-gray-100 flex items-center justify-center">
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
                            <div className="h-2 w-16 bg-gray-200 rounded animate-pulse" />
                          </div>
                        </div>
                        {styleInfo && (
                          <p className="text-[10px] text-center text-gray-400 bg-gray-50 py-0.5 font-medium">{styleInfo.label}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Error */}
        {generateState.error && (
          <p className="mt-3 text-sm text-red-600">{generateState.error}</p>
        )}

        {/* Results preview */}
        {generateState.results && generateState.results.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-emerald-700 mb-2">
              <CheckCircle2 className="w-4 h-4 inline mr-1" />
              {generateState.results.length} images generated
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {generateState.results.map((r, i) => {
                const styleInfo = STATIC_STYLES.find(s => s.id === r.style);
                const triggers = (r.reptileTriggers ?? []).map(
                  tid => REPTILE_TRIGGERS.find(t => t.id === tid)
                ).filter(Boolean);
                return (
                  <div key={i} className="rounded-lg overflow-hidden border border-gray-200">
                    <div className="aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.original_url} alt={r.label} className="w-full h-full object-cover" />
                    </div>
                    {styleInfo && (
                      <p className="text-[10px] text-center text-purple-600 bg-purple-50 py-0.5 font-medium">{styleInfo.label}</p>
                    )}
                    {triggers.length > 0 && (
                      <p className="text-[9px] text-center text-amber-600 bg-amber-50 py-0.5 truncate" title={triggers.map(t => t!.label).join(", ")}>
                        {triggers.map(t => t!.label).join(" + ")}
                      </p>
                    )}
                    {r.prompt && <ExpandablePrompt prompt={r.prompt} />}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Generate section first when no images exist */}
      {!hasExistingImages && renderGenerateSection()}

      {job.status === "draft" && !(showGenerateSection && !hasExistingImages) ? (
        <div className="space-y-4">
          {(() => {
            const pendingCount = job.pending_competitor_gen
              ? job.pending_competitor_gen.image_prompts?.length ?? 5
              : 0;
            const totalExpected = Math.max(pendingCount, 4);
            const isCompetitorGen = pendingCount > 0 || job.tags?.includes("competitor-swipe");
            return (
              <>
                <div className="flex items-center gap-1.5 text-indigo-600 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isCompetitorGen
                    ? `Generating competitor-swipe images (${sourceImages.length}/${totalExpected})...`
                    : job.visual_direction ? "Generating images..." : "Importing from Drive..."}
                  <span className="text-gray-400 ml-1"><ElapsedTimer /></span>
                </div>

                {/* Progress bar for competitor generation */}
                {isCompetitorGen && totalExpected > 0 && (
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (sourceImages.length / totalExpected) * 100)}%` }}
                    />
                  </div>
                )}

                {/* Skeleton image grid -- show generated images + placeholder skeletons */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {sourceImages.map((si) => (
                    <div key={si.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      <div className="aspect-[4/5] bg-gray-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={si.original_url} alt={si.filename ?? ""} className="w-full h-full object-cover" />
                      </div>
                      {si.filename && <p className="text-xs text-gray-400 px-2 py-1.5 truncate">{si.filename}</p>}
                    </div>
                  ))}
                  {/* Skeleton placeholders for images still loading */}
                  {Array.from({ length: Math.max(0, totalExpected - sourceImages.length) }).map((_, i) => (
                    <div key={`skel-${i}`} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      <div className="aspect-[4/5] bg-gray-100 flex items-center justify-center relative">
                        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
                      </div>
                      <div className="px-2 py-1.5">
                        <div className="h-3 bg-gray-200 rounded w-3/4 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      ) : job.status === "ready" ? (
        <>
          {/* Source images preview */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
            {sourceImages.map((si) => (
              <div key={si.id} className={`bg-white border rounded-lg overflow-hidden relative group transition-colors ${si.skip_translation ? "border-gray-300 opacity-60" : "border-gray-200"}`}>
                <div className="aspect-[4/5] bg-gray-50 relative">
                  {rerollingId === si.id && (
                    <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                      <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                    </div>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={si.original_url}
                    alt={si.filename ?? "Original"}
                    className="w-full h-full object-cover"
                  />
                  {si.skip_translation && (
                    <div className="absolute inset-0 bg-white/40 flex items-center justify-center">
                      <span className="bg-gray-800/70 text-white text-xs px-2 py-1 rounded">No text</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between px-2 py-1.5">
                  {onToggleSkip && (
                    <label className="flex items-center gap-1.5 cursor-pointer flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={!si.skip_translation}
                        onChange={() => onToggleSkip(si.id, !si.skip_translation)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                      />
                      <span className="text-xs text-gray-400 truncate">{si.skip_translation ? "Skip" : "Translate"}</span>
                    </label>
                  )}
                  {!onToggleSkip && si.filename && (
                    <p className="text-xs text-gray-400 truncate flex-1">{si.filename}</p>
                  )}
                  {onReroll && si.generation_style && !rerollingId && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onReroll(si.id); }}
                      className="text-gray-300 hover:text-indigo-600 transition-colors opacity-0 group-hover:opacity-100 ml-1 shrink-0"
                      title="Re-roll this image"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Generate more styles (shown below existing images) */}
          {hasExistingImages && renderGenerateSection()}

          {/* Language selection + Translate All */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Target Languages</label>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((lang) => {
                  const selected = selectedLanguages.has(lang.value);
                  return (
                    <label
                      key={lang.value}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium cursor-pointer transition-colors ${
                        selected
                          ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                          : "bg-white border-gray-200 text-gray-400 hover:text-gray-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => {
                          setSelectedLanguages((prev) => {
                            const next = new Set(prev);
                            if (next.has(lang.value)) next.delete(lang.value);
                            else next.add(lang.value);
                            return next;
                          });
                        }}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span role="img" aria-label={lang.label}>{lang.flag}</span>
                      {lang.label}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowTranslateConfirm(true)}
                disabled={proc.processing || selectedLanguages.size === 0}
                className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50"
              >
                  {proc.processing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                      Starting translations...
                    </>
                  ) : (
                    "Translate All"
                  )}
                </button>
                {selectedLanguages.size > 0 && (
                  <p className="text-sm text-gray-400">
                    {sourceImages.filter(si => !si.skip_translation).length * selectedLanguages.size} translations (4:5)
                    {" \u2248 "}{(sourceImages.filter(si => !si.skip_translation).length * selectedLanguages.size * 1).toFixed(0)} kr
                  </p>
                )}
              </div>
            </div>

            {/* Translate confirmation dialog */}
            {showTranslateConfirm && (() => {
              const translatableCount = sourceImages.filter(si => !si.skip_translation).length;
              const totalTranslations = translatableCount * selectedLanguages.size;
              const estCost = totalTranslations * 0.09;
              const estMinutes = Math.ceil(Math.ceil(totalTranslations / 10) * 75 / 60);
              return (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowTranslateConfirm(false)}>
                  <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
                    <h3 className="text-base font-semibold text-gray-900 mb-3">Start translation batch?</h3>
                    <div className="space-y-2 mb-5">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Images</span>
                        <span className="text-gray-800 font-medium">{translatableCount}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Languages</span>
                        <span className="text-gray-800 font-medium">{selectedLanguages.size} ({Array.from(selectedLanguages).map(l => { const li = LANGUAGES.find(li => li.value === l); return <span key={l} role="img" aria-label={li?.label ?? l}>{li?.flag}</span>; })})</span>
                      </div>
                      <div className="flex justify-between text-sm border-t border-gray-100 pt-2">
                        <span className="text-gray-500">Total translations</span>
                        <span className="text-gray-800 font-medium">{totalTranslations}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Estimated cost</span>
                        <span className="text-gray-800 font-medium">{(estCost * 11).toFixed(0)} kr</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Estimated time</span>
                        <span className="text-gray-800 font-medium">~{estMinutes} min</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowTranslateConfirm(false)} className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                        Cancel
                      </button>
                      <button onClick={handleTranslateAll} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors">
                        Start
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
        </>
      ) : (
      <>
      {/* Status summary */}
      <div className="flex items-center gap-3 mb-3">
        {pendingCount > 0 || proc.processing ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-indigo-600 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing... ({completedCount}/{totalCount})
            </div>
            {proc.startTime && (
              <ProcessingTimer
                startTime={proc.startTime}
                processedCount={proc.processedInSession}
                remainingCount={pendingCount}
              />
            )}
            {proc.processing && (
              <button
                onClick={handleCancel}
                className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors"
              >
                <Square className="w-3 h-3 fill-current" />
                Stop
              </button>
            )}
          </div>
        ) : failedCount > 0 ? (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-emerald-600 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              {completedCount} ready
            </span>
            <span className="flex items-center gap-1.5 text-yellow-600 text-sm">
              <AlertTriangle className="w-4 h-4" />
              {failedCount} failed
            </span>
            <button
              onClick={handleRetryAll}
              className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry all
            </button>
          </div>
        ) : (
          <span className="flex items-center gap-1.5 text-emerald-600 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            {completedCount} ready
          </span>
        )}
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="mb-6">
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden flex">
            {completedCount > 0 && (
              <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${(completedCount / totalCount) * 100}%` }} />
            )}
            {failedCount > 0 && (
              <div className="bg-red-400 h-full transition-all duration-500" style={{ width: `${(failedCount / totalCount) * 100}%` }} />
            )}
          </div>
          <div className="flex items-center gap-4 mt-1.5">
            {job.target_languages.map((lang) => {
              const langInfo = LANGUAGES.find((l) => l.value === lang);
              const counts = langCounts.get(lang);
              return (
                <span key={lang} className="text-xs text-gray-400">
                  <span role="img" aria-label={langInfo?.label ?? lang}>{langInfo?.flag}</span> {counts?.completed ?? 0}/{counts?.total ?? 0}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Generate 9:16 CTA */}
      {show9x16Button && handleGenerate9x16 && (
        <div className="mb-6 bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">4:5 translations ready</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Generate 9:16 versions for Stories &amp; Reels ({count9x16} images)
              {count9x16 ? <> &asymp; {(count9x16 * 0.09 * 11).toFixed(0)} kr</> : null}
            </p>
          </div>
          <button
            onClick={handleGenerate9x16}
            className="px-5 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium text-sm flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Generate 9:16 Versions
          </button>
        </div>
      )}

      {/* Language tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-6">
        <TabButton
          active={activeTab === "all"}
          onClick={() => setActiveTab("all")}
          label="All"
          count={totalCount}
        />
        {job.target_languages.map((lang) => {
          const langInfo = LANGUAGES.find((l) => l.value === lang);
          const counts = langCounts.get(lang);
          return (
            <TabButton
              key={lang}
              active={activeTab === lang}
              onClick={() => setActiveTab(lang)}
              label={`${langInfo?.label ?? lang.toUpperCase()}`}
              count={counts?.total ?? 0}
              completed={counts?.completed}
            />
          );
        })}
        {/* Add language button -- only show if there are languages not yet added */}
        {LANGUAGES.filter((l) => !job.target_languages.includes(l.value)).length > 0 && (
          <div className="relative ml-1">
            <button
              onClick={() => { setShowAddLang(!showAddLang); setAddLangSelected(new Set()); }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              title="Add language"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            {showAddLang && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 p-4 w-64">
                <p className="text-sm font-medium text-gray-900 mb-3">Add languages</p>
                <div className="space-y-2 mb-4">
                  {LANGUAGES.filter((l) => !job.target_languages.includes(l.value)).map((lang) => (
                    <label
                      key={lang.value}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
                        addLangSelected.has(lang.value)
                          ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                          : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={addLangSelected.has(lang.value)}
                        onChange={() => {
                          setAddLangSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(lang.value)) next.delete(lang.value);
                            else next.add(lang.value);
                            return next;
                          });
                        }}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span role="img" aria-label={lang.label}>{lang.flag}</span>
                      {lang.label}
                    </label>
                  ))}
                </div>
                {addLangSelected.size > 0 && (() => {
                  const imgCount = (job.source_images ?? []).filter((si) => !si.skip_translation).length;
                  const newTrans = imgCount * addLangSelected.size;
                  return (
                    <p className="text-xs text-gray-400 mb-3">
                      {newTrans} new translations &asymp; {(newTrans * 1).toFixed(0)} kr
                    </p>
                  );
                })()}
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddLang(false)}
                    className="flex-1 px-3 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddLanguages}
                    disabled={addLangSelected.size === 0 || addLangLoading}
                    className="flex-1 px-3 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {addLangLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                    ) : null}
                    Add & Translate
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Image grid — grouped by batch */}
      {(() => {
        // Group images by batch
        const batches = new Map<number, { label: string | null; images: typeof filteredImages }>();
        for (const si of filteredImages) {
          const b = (si as SourceImage & { batch?: number }).batch ?? 1;
          const bl = (si as SourceImage & { batch_label?: string | null }).batch_label ?? null;
          if (!batches.has(b)) batches.set(b, { label: bl, images: [] });
          batches.get(b)!.images.push(si);
          // Use first non-null label for the batch
          if (bl && !batches.get(b)!.label) batches.get(b)!.label = bl;
        }
        const sortedBatches = [...batches.entries()].sort((a, b) => a[0] - b[0]);
        const hasMulitpleBatches = sortedBatches.length > 1;

        return sortedBatches.map(([batchNum, { label, images }]) => (
          <div key={batchNum} className={hasMulitpleBatches ? "mb-6" : ""}>
            {hasMulitpleBatches && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  {batchNum === 1 ? "Original" : `Iteration ${batchNum - 1}`}
                </span>
                {label && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {label}
                  </span>
                )}
                <span className="text-xs text-gray-300">
                  {images.length} image{images.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {images.map((si) => (
          <div
            key={si.id}
            className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm cursor-pointer hover:border-indigo-200 transition-colors"
            onClick={() => { setPreviewImage(si); setPreviewLang(null); }}
          >
            {/* Thumbnail */}
            <div className="aspect-[4/5] bg-gray-50 flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={si.original_url}
                alt={si.filename ?? "Source image"}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Translation statuses */}
            <div className="p-2.5 space-y-1">
              {si.skip_translation ? (
                <div className="flex items-center gap-1.5">
                  <EyeOff className="w-3 h-3 text-gray-400" />
                  <span className="text-xs text-gray-400">Original only</span>
                </div>
              ) : (si.image_translations ?? []).map((t) => {
                const langInfo = LANGUAGES.find((l) => l.value === t.language);
                const versionCount = t.versions?.length ?? 0;
                return (
                  <div key={t.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs" role="img" aria-label={langInfo?.label ?? t.language}>{langInfo?.flag}</span>
                      {t.aspect_ratio && t.aspect_ratio !== "4:5" && (
                        <span className="text-xs text-gray-400 bg-gray-100 px-1 rounded">{t.aspect_ratio}</span>
                      )}
                      <TranslationStatusBadge status={t.status} />
                      {versionCount > 1 && (
                        <span className="text-xs text-gray-400">v{versionCount}</span>
                      )}
                    </div>
                    {t.status === "failed" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRetrySingle(t.id); }}
                        className="text-gray-400 hover:text-indigo-700 transition-colors"
                        title="Retry"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
            </div>
          </div>
        ));
      })()}
      </>
      )}
    </>
  );
}
