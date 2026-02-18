"use client";

import { useState, useEffect } from "react";
import { X, Download, RotateCcw } from "lucide-react";
import { SourceImage, Version, LANGUAGES } from "@/types";
import QualityDetails from "./QualityDetails";

interface Props {
  sourceImage: SourceImage;
  activeLang: string | null;
  onChangeLang: (lang: string | null) => void;
  onClose: () => void;
  onRetry: (translationId: string) => void;
}

export default function ImagePreviewModal({
  sourceImage,
  activeLang,
  onChangeLang,
  onClose,
  onRetry,
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

  // Reset active version when language changes
  useEffect(() => {
    setActiveVersionId(activeTranslation?.active_version_id ?? null);
  }, [activeLang, activeTranslation?.active_version_id]);

  const activeVersion = activeVersionId
    ? versions.find((v) => v.id === activeVersionId)
    : versions[0]; // default to latest

  const displayUrl = activeVersion?.translated_url ?? activeTranslation?.translated_url ?? sourceImage.original_url;
  const isOriginal = !activeLang;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white border border-gray-200 rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
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
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
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

        {/* Image */}
        <div className="flex-1 overflow-auto p-5 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl}
            alt={isOriginal ? "Original" : `${activeLang} translation`}
            className="max-w-full max-h-[65vh] object-contain rounded-lg"
          />
        </div>

        {/* Footer with download */}
        {!isOriginal && (activeVersion?.translated_url || activeTranslation?.translated_url) && (
          <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between shrink-0">
            {activeVersion?.generation_time_seconds != null && (
              <span className="text-xs text-gray-400">
                Generated in {Math.round(activeVersion.generation_time_seconds)}s
              </span>
            )}
            <a
              href={activeVersion?.translated_url ?? activeTranslation?.translated_url ?? ""}
              download={`${activeLang}_${sourceImage.filename ?? "image"}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-700 border border-gray-200 hover:border-indigo-200 rounded-lg px-3 py-2 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
