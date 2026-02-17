"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  RotateCcw,
  Download,
  RefreshCw,
  X,
} from "lucide-react";
import JSZip from "jszip";
import { ImageJob, ImageTranslation, SourceImage, Version, LANGUAGES } from "@/types";

interface Props {
  initialJob: ImageJob;
}

export default function ImageJobDetail({ initialJob }: Props) {
  const [job, setJob] = useState<ImageJob>(initialJob);
  const [activeTab, setActiveTab] = useState<"all" | string>("all");
  const [processing, setProcessing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewImage, setPreviewImage] = useState<SourceImage | null>(null);
  const [previewLang, setPreviewLang] = useState<string | null>(null);
  const processingRef = useRef(false);

  const allTranslations = job.source_images?.flatMap(
    (si) => si.image_translations ?? []
  ) ?? [];
  const totalCount = allTranslations.length;
  const completedCount = allTranslations.filter((t) => t.status === "completed").length;
  const failedCount = allTranslations.filter((t) => t.status === "failed").length;
  const pendingCount = allTranslations.filter(
    (t) => t.status === "pending" || t.status === "processing"
  ).length;

  const refreshJob = useCallback(async () => {
    const res = await fetch(`/api/image-jobs/${job.id}`);
    if (res.ok) {
      const data = await res.json();
      setJob(data);
      return data as ImageJob;
    }
    return null;
  }, [job.id]);

  // Start processing pending translations on mount
  useEffect(() => {
    const pending = getAllPending(initialJob);
    if (pending.length > 0 && !processingRef.current) {
      startQueue(pending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getAllPending(j: ImageJob): ImageTranslation[] {
    return (
      j.source_images?.flatMap(
        (si) =>
          si.image_translations?.filter((t) => t.status === "pending") ?? []
      ) ?? []
    );
  }

  async function startQueue(translations: ImageTranslation[]) {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);

    const queue = [...translations];
    const CONCURRENCY = 3;
    const executing = new Set<Promise<void>>();

    for (const item of queue) {
      const p = processOne(item).then(() => {
        executing.delete(p);
      });
      executing.add(p);
      if (executing.size >= CONCURRENCY) {
        await Promise.race(executing);
      }
    }
    await Promise.all(executing);

    processingRef.current = false;
    setProcessing(false);
    await refreshJob();
  }

  async function processOne(translation: ImageTranslation) {
    try {
      await fetch(`/api/image-jobs/${job.id}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translationId: translation.id }),
      });
    } catch (err) {
      console.error("Translation failed:", err);
    }
    await refreshJob();
  }

  async function handleRetryAll() {
    const res = await fetch(`/api/image-jobs/${job.id}/retry`, { method: "POST" });
    if (res.ok) {
      const { ids } = await res.json();
      const updated = await refreshJob();
      if (updated && ids.length > 0) {
        const pending = getAllPending(updated);
        startQueue(pending);
      }
    }
  }

  async function handleRetrySingle(translationId: string) {
    await fetch(`/api/image-jobs/${job.id}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ translationId }),
    });
    await refreshJob();
  }

  async function handleExport() {
    setExporting(true);
    try {
      const zip = new JSZip();
      const sourceImages = job.source_images ?? [];

      for (const si of sourceImages) {
        for (const t of si.image_translations ?? []) {
          if (t.status === "completed" && t.translated_url) {
            try {
              const imgRes = await fetch(t.translated_url);
              const blob = await imgRes.blob();
              const langLabel = LANGUAGES.find((l) => l.value === t.language)?.label ?? t.language;
              const filename = si.filename || `${si.id}.png`;
              zip.file(`${langLabel}/${filename}`, blob);
            } catch {
              // Skip failed downloads
            }
          }
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${job.name}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  // Filter images based on active tab
  const filteredImages = (job.source_images ?? []).map((si) => ({
    ...si,
    image_translations:
      activeTab === "all"
        ? si.image_translations
        : si.image_translations?.filter((t) => t.language === activeTab),
  }));

  // Count per language for tabs
  const langCounts = new Map<string, { total: number; completed: number }>();
  for (const t of allTranslations) {
    const curr = langCounts.get(t.language) ?? { total: 0, completed: 0 };
    curr.total++;
    if (t.status === "completed") curr.completed++;
    langCounts.set(t.language, curr);
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Back */}
      <Link
        href="/images"
        className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900 text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Static ads
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{job.name}</h1>
          <p className="text-sm text-gray-400 mt-1">
            {job.total_images ?? job.source_images?.length ?? 0} images &times;{" "}
            {job.target_languages.length} languages
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshJob}
            className="text-gray-400 hover:text-gray-700 p-2 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {completedCount > 0 && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-700 border border-gray-200 hover:border-indigo-200 rounded-lg px-3 py-2 transition-colors"
            >
              {exporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Export
            </button>
          )}
        </div>
      </div>

      {/* Status summary */}
      <div className="flex items-center gap-3 mb-6">
        {pendingCount > 0 || processing ? (
          <div className="flex items-center gap-1.5 text-indigo-600 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing... ({completedCount}/{totalCount})
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
              label={`${langInfo?.flag ?? ""} ${lang.toUpperCase()}`}
              count={counts?.total ?? 0}
              completed={counts?.completed}
            />
          );
        })}
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
              {(si.image_translations ?? []).map((t) => {
                const langInfo = LANGUAGES.find((l) => l.value === t.language);
                const versionCount = t.versions?.length ?? 0;
                return (
                  <div key={t.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs">{langInfo?.flag}</span>
                      <TranslationStatusBadge status={t.status} />
                      {versionCount > 1 && (
                        <span className="text-[10px] text-gray-400">v{versionCount}</span>
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

      {/* Preview modal */}
      {previewImage && (
        <ImagePreviewModal
          sourceImage={previewImage}
          activeLang={previewLang}
          onChangeLang={setPreviewLang}
          onClose={() => setPreviewImage(null)}
          onRetry={(id) => { handleRetrySingle(id); }}
        />
      )}
    </div>
  );
}

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
        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
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

function ImagePreviewModal({
  sourceImage,
  activeLang,
  onChangeLang,
  onClose,
  onRetry,
}: {
  sourceImage: SourceImage;
  activeLang: string | null;
  onChangeLang: (lang: string | null) => void;
  onClose: () => void;
  onRetry: (translationId: string) => void;
}) {
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
            <span className="text-[10px] text-gray-400 uppercase tracking-wider mr-1">Versions</span>
            {versions
              .sort((a, b) => a.version_number - b.version_number)
              .map((v) => {
                const isCurrent = v.id === (activeVersionId ?? versions[0]?.id);
                return (
                  <button
                    key={v.id}
                    onClick={() => setActiveVersionId(v.id)}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
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
          <div className="px-5 pt-2 shrink-0">
            <QualityBadge score={activeVersion.quality_score} />
          </div>
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
              <span className="text-[10px] text-gray-400">
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

function QualityBadge({ score }: { score: number }) {
  const classes = score >= 80
    ? "bg-emerald-50 text-emerald-700"
    : score >= 60
    ? "bg-yellow-50 text-yellow-700"
    : "bg-red-50 text-red-700";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${classes}`}>
      Quality: {Math.round(score)}/100
    </span>
  );
}

function TranslationStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <span className="flex items-center gap-1 text-[11px] text-emerald-600">
          <CheckCircle2 className="w-3 h-3" />
          Ready
        </span>
      );
    case "processing":
      return (
        <span className="flex items-center gap-1 text-[11px] text-indigo-600">
          <Loader2 className="w-3 h-3 animate-spin" />
          Generating...
        </span>
      );
    case "failed":
      return (
        <span className="flex items-center gap-1 text-[11px] text-red-600">
          <AlertTriangle className="w-3 h-3" />
          Failed
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 text-[11px] text-gray-400">
          <Loader2 className="w-3 h-3" />
          Pending
        </span>
      );
  }
}
