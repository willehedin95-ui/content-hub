"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, RotateCcw, ChevronLeft, ChevronRight, Columns2, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { SourceImage, Version, LANGUAGES } from "@/types";
import QualityDetails from "./QualityDetails";

interface Props {
  sourceImage: SourceImage;
  activeLang: string | null;
  onChangeLang: (lang: string | null) => void;
  onClose: () => void;
  onRetry: (translationId: string) => void;
  onPrev?: () => void;
  onNext?: () => void;
  currentIndex?: number;
  totalCount?: number;
}

export default function ImagePreviewModal({
  sourceImage,
  activeLang,
  onChangeLang,
  onClose,
  onRetry,
  onPrev,
  onNext,
  currentIndex,
  totalCount,
}: Props) {
  const translations = sourceImage.image_translations ?? [];
  const activeTranslation = activeLang
    ? translations.find((t) => t.language === activeLang)
    : null;

  // Get sorted versions for the active translation
  const versions = (activeTranslation?.versions ?? [])
    .filter((v) => v.translated_url)
    .sort((a, b) => b.version_number - a.version_number);

  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Reset active version when language changes
  useEffect(() => {
    setActiveVersionId(activeTranslation?.active_version_id ?? null);
  }, [activeLang, activeTranslation?.active_version_id]);

  // Reset zoom on language/image change
  useEffect(() => {
    setZoom(1);
  }, [activeLang, sourceImage.id]);

  const activeVersion = activeVersionId
    ? versions.find((v) => v.id === activeVersionId)
    : versions[0]; // default to latest

  const displayUrl = activeVersion?.translated_url ?? activeTranslation?.translated_url ?? sourceImage.original_url;
  const isOriginal = !activeLang;

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && onPrev) {
        onPrev();
      } else if (e.key === "ArrowRight" && onNext) {
        onNext();
      } else if (e.key === "c" && !e.metaKey && !e.ctrlKey) {
        setCompareMode(prev => !prev);
      } else if (e.key === "+" || e.key === "=") {
        setZoom(z => Math.min(z + 0.5, 4));
      } else if (e.key === "-") {
        setZoom(z => Math.max(z - 0.5, 0.5));
      } else if (e.key === "0") {
        setZoom(1);
      }
    },
    [onClose, onPrev, onNext]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* Prev arrow */}
      {onPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 bg-white/90 hover:bg-white text-gray-700 rounded-full p-2 shadow-lg transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      {/* Next arrow */}
      {onNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-white/90 hover:bg-white text-gray-700 rounded-full p-2 shadow-lg transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      <div
        className="bg-white border border-gray-200 rounded-2xl shadow-xl max-w-4xl w-full flex flex-col overflow-hidden"
        style={{ height: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div>
            <p className="text-sm font-medium text-gray-800">
              {sourceImage.filename ?? "Image"}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {isOriginal
                ? "Original"
                : `${LANGUAGES.find((l) => l.value === activeLang)?.label} translation${
                    activeVersion ? ` (v${activeVersion.version_number})` : ""
                  }`}
              {currentIndex != null && totalCount != null && (
                <span className="ml-2">{currentIndex + 1} / {totalCount}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Compare toggle */}
            {!isOriginal && (
              <button
                onClick={() => setCompareMode(prev => !prev)}
                className={`p-1.5 rounded-lg text-xs font-medium transition-colors ${
                  compareMode ? "bg-indigo-50 text-indigo-600" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                }`}
                title="Compare with original (C)"
              >
                <Columns2 className="w-4 h-4" />
              </button>
            )}
            {/* Zoom controls */}
            <button onClick={() => setZoom(z => Math.max(z - 0.5, 0.5))} className="text-gray-400 hover:text-gray-700 p-1.5 transition-colors" title="Zoom out (-)">
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-400 tabular-nums w-8 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(z + 0.5, 4))} className="text-gray-400 hover:text-gray-700 p-1.5 transition-colors" title="Zoom in (+)">
              <ZoomIn className="w-4 h-4" />
            </button>
            {zoom !== 1 && (
              <button onClick={() => setZoom(1)} className="text-gray-400 hover:text-gray-700 p-1.5 transition-colors" title="Reset zoom (0)">
                <Maximize2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors ml-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Language tabs */}
        <div className="flex items-center gap-1 px-5 pt-3 shrink-0">
          <button
            onClick={() => onChangeLang(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isOriginal
                ? "bg-indigo-50 text-indigo-600"
                : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            }`}
          >
            Original
          </button>
          {translations.map((t) => {
            const langInfo = LANGUAGES.find((l) => l.value === t.language);
            const isActive = activeLang === t.language;
            const isReady = t.status === "completed";
            return (
              <button
                key={t.id}
                onClick={() => isReady && onChangeLang(t.language)}
                disabled={!isReady}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-50 text-indigo-600"
                    : isReady
                    ? "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                    : "text-gray-300 cursor-not-allowed"
                }`}
              >
                <span>{langInfo?.flag}</span>
                {t.status === "completed" ? langInfo?.label : t.status === "failed" ? "Failed" : "Pending"}
                {t.aspect_ratio && t.aspect_ratio !== "1:1" && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-1 rounded">{t.aspect_ratio}</span>
                )}
                {t.status === "failed" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRetry(t.id); }}
                    className="ml-1 text-red-600 hover:text-indigo-700"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </button>
            );
          })}
        </div>

        {/* Version selector (only when viewing a translation with multiple versions) */}
        {!isOriginal && versions.length > 1 && (
          <div className="flex items-center gap-1.5 px-5 pt-2 shrink-0">
            <span className="text-xs text-gray-400 uppercase tracking-wider mr-1">Versions</span>
            {versions
              .sort((a, b) => a.version_number - b.version_number)
              .map((v) => {
                const isCurrent = v.id === (activeVersionId ?? versions[0]?.id);
                return (
                  <button
                    key={v.id}
                    onClick={() => setActiveVersionId(v.id)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                      isCurrent
                        ? "bg-indigo-50 text-indigo-600"
                        : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    v{v.version_number}
                    {v.quality_score != null && (
                      <span className={`ml-1 ${
                        v.quality_score >= 80 ? "text-emerald-600" :
                        v.quality_score >= 60 ? "text-yellow-600" : "text-red-600"
                      }`}>
                        {Math.round(v.quality_score)}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        )}

        {/* Quality analysis for active version */}
        {activeVersion?.quality_score != null && (
          <QualityDetails version={activeVersion} />
        )}

        {/* Image — fixed container so layout doesn't shift between tabs */}
        <div
          ref={imageContainerRef}
          className={`flex-1 min-h-0 overflow-auto p-5 flex items-center justify-center ${compareMode ? "gap-3" : ""}`}
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              setZoom(z => Math.min(Math.max(z + (e.deltaY < 0 ? 0.25 : -0.25), 0.5), 4));
            }
          }}
        >
          {compareMode && !isOriginal ? (
            <>
              <div className="flex-1 flex flex-col items-center min-w-0">
                <span className="text-xs text-gray-400 mb-1.5">Original</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={sourceImage.original_url}
                  alt="Original"
                  className="max-w-full max-h-full object-contain rounded-lg"
                  style={{ transform: `scale(${zoom})`, transformOrigin: "center center", transition: "transform 0.15s" }}
                />
              </div>
              <div className="w-px bg-gray-200 self-stretch shrink-0" />
              <div className="flex-1 flex flex-col items-center min-w-0">
                <span className="text-xs text-gray-400 mb-1.5">{LANGUAGES.find(l => l.value === activeLang)?.label} translation</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayUrl}
                  alt={`${activeLang} translation`}
                  className="max-w-full max-h-full object-contain rounded-lg"
                  style={{ transform: `scale(${zoom})`, transformOrigin: "center center", transition: "transform 0.15s" }}
                />
              </div>
            </>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayUrl}
              alt={isOriginal ? "Original" : `${activeLang} translation`}
              className="max-w-full max-h-full object-contain rounded-lg"
              style={{ transform: `scale(${zoom})`, transformOrigin: "center center", transition: "transform 0.15s" }}
              onDoubleClick={() => setZoom(z => z === 1 ? 2 : 1)}
            />
          )}
        </div>

        {/* Generation time (no download button) */}
        {!isOriginal && activeVersion?.generation_time_seconds != null && (
          <div className="px-5 py-2 border-t border-gray-200 shrink-0">
            <span className="text-xs text-gray-400">
              Generated in {Math.round(activeVersion.generation_time_seconds)}s
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
