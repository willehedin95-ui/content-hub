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
} from "lucide-react";
import { ImageJob, SourceImage, Language, LANGUAGES } from "@/types";

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
}: ConceptImagesStepProps) {
  return (
    <>
      {job.status === "draft" ? (
        <div className="space-y-4">
          <div className="flex items-center gap-1.5 text-indigo-600 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Importing from Drive...
            {sourceImages.length > 0 && (
              <span className="text-gray-500 ml-1">{sourceImages.length} imported</span>
            )}
            <span className="text-gray-400 ml-1"><ElapsedTimer /></span>
          </div>

          {/* Skeleton image grid -- show imported images + placeholder skeletons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {sourceImages.map((si) => (
              <div key={si.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="aspect-square bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={si.original_url} alt={si.filename ?? ""} className="w-full h-full object-cover" />
                </div>
                {si.filename && <p className="text-xs text-gray-400 px-2 py-1.5 truncate">{si.filename}</p>}
              </div>
            ))}
            {/* Pulsing skeleton placeholders for images still loading */}
            {Array.from({ length: Math.max(0, 4 - sourceImages.length) }).map((_, i) => (
              <div key={`skel-${i}`} className="bg-white border border-gray-200 rounded-lg overflow-hidden animate-pulse">
                <div className="aspect-square bg-gray-200" />
                <div className="px-2 py-1.5">
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : job.status === "ready" ? (
        <>
          {/* Source images preview */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
            {sourceImages.map((si) => (
              <div key={si.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="aspect-square bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={si.original_url}
                    alt={si.filename ?? "Original"}
                    className="w-full h-full object-cover"
                  />
                </div>
                {si.filename && (
                  <p className="text-xs text-gray-400 px-2 py-1.5 truncate">{si.filename}</p>
                )}
              </div>
            ))}
          </div>

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
                    {sourceImages.length * selectedLanguages.size} translations
                    {" \u2248 "}{(sourceImages.length * selectedLanguages.size * 1).toFixed(0)} kr
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

      {/* Image grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredImages.map((si) => (
          <div
            key={si.id}
            className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm cursor-pointer hover:border-indigo-200 transition-colors"
            onClick={() => { setPreviewImage(si); setPreviewLang(null); }}
          >
            {/* Thumbnail */}
            <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
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
                      {t.aspect_ratio && t.aspect_ratio !== "1:1" && (
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
      </>
      )}
    </>
  );
}
