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
} from "lucide-react";
import JSZip from "jszip";
import { ImageJob, ImageTranslation, LANGUAGES } from "@/types";

interface Props {
  initialJob: ImageJob;
}

export default function ImageJobDetail({ initialJob }: Props) {
  const [job, setJob] = useState<ImageJob>(initialJob);
  const [activeTab, setActiveTab] = useState<"all" | string>("all");
  const [processing, setProcessing] = useState(false);
  const [exporting, setExporting] = useState(false);
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
    // Reset this single translation to pending via the retry-like pattern
    // We'll just call the translate endpoint directly after a short reset
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
        className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Images
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{job.name}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {job.total_images ?? job.source_images?.length ?? 0} images &times;{" "}
            {job.target_languages.length} languages
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshJob}
            className="text-slate-500 hover:text-slate-300 p-2 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {completedCount > 0 && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-400 border border-[#1e2130] hover:border-indigo-500/30 rounded-lg px-3 py-2 transition-colors"
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
          <div className="flex items-center gap-1.5 text-indigo-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing... ({completedCount}/{totalCount})
          </div>
        ) : failedCount > 0 ? (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-emerald-400 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              {completedCount} ready
            </span>
            <span className="flex items-center gap-1.5 text-yellow-400 text-sm">
              <AlertTriangle className="w-4 h-4" />
              {failedCount} failed
            </span>
            <button
              onClick={handleRetryAll}
              className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry all
            </button>
          </div>
        ) : (
          <span className="flex items-center gap-1.5 text-emerald-400 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            {completedCount} ready
          </span>
        )}
      </div>

      {/* Language tabs */}
      <div className="flex items-center gap-1 border-b border-[#1e2130] mb-6">
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
            className="bg-[#141620] border border-[#1e2130] rounded-xl overflow-hidden"
          >
            {/* Thumbnail */}
            <div className="aspect-square bg-[#0a0c14] flex items-center justify-center overflow-hidden">
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
                return (
                  <div key={t.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs">{langInfo?.flag}</span>
                      <TranslationStatusBadge status={t.status} />
                    </div>
                    {t.status === "failed" && (
                      <button
                        onClick={() => handleRetrySingle(t.id)}
                        className="text-slate-600 hover:text-indigo-400 transition-colors"
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
          ? "text-indigo-300 border-indigo-500"
          : "text-slate-500 hover:text-slate-300 border-transparent"
      }`}
    >
      {label}
      <span
        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
          completed !== undefined && completed === count
            ? "bg-emerald-500/20 text-emerald-400"
            : "bg-[#1e2130] text-slate-400"
        }`}
      >
        {completed !== undefined ? `${completed}/${count}` : count}
      </span>
    </button>
  );
}

function TranslationStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <span className="flex items-center gap-1 text-[11px] text-emerald-400">
          <CheckCircle2 className="w-3 h-3" />
          Ready
        </span>
      );
    case "processing":
      return (
        <span className="flex items-center gap-1 text-[11px] text-indigo-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          Generating...
        </span>
      );
    case "failed":
      return (
        <span className="flex items-center gap-1 text-[11px] text-red-400">
          <AlertTriangle className="w-3 h-3" />
          Failed
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 text-[11px] text-slate-500">
          <Loader2 className="w-3 h-3" />
          Pending
        </span>
      );
  }
}
