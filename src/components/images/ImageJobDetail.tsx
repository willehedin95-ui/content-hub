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
  Upload,
  X,
} from "lucide-react";
import { ImageJob, ImageTranslation, SourceImage, QualityAnalysis, Language, LANGUAGES, ExpansionStatus } from "@/types";
import { getSettings } from "@/lib/settings";
import { exportJobAsZip } from "@/lib/export-zip";
import ImagePreviewModal from "./ImagePreviewModal";

const MAX_VERSIONS = 5;
const DEFAULT_QUALITY_THRESHOLD = 80;

interface Props {
  initialJob: ImageJob;
}

export default function ImageJobDetail({ initialJob }: Props) {
  const [job, setJob] = useState<ImageJob>(initialJob);
  const [activeTab, setActiveTab] = useState<"all" | string>("all");
  const [processing, setProcessing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [driveExporting, setDriveExporting] = useState(false);
  const [driveExportDone, setDriveExportDone] = useState(false);
  const [driveExportError, setDriveExportError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<SourceImage | null>(null);
  const [previewLang, setPreviewLang] = useState<string | null>(null);
  const [showRestartBanner, setShowRestartBanner] = useState(false);
  const processingRef = useRef(false);
  const expandProcessingRef = useRef(false);
  const [expandProcessing, setExpandProcessing] = useState(false);
  const [selectedLanguages, setSelectedLanguages] = useState<Set<Language>>(() => {
    // Init from job if already set, otherwise from settings defaults
    if (initialJob.target_languages?.length) {
      return new Set(initialJob.target_languages as Language[]);
    }
    try {
      const stored = localStorage.getItem("content-hub-settings");
      if (stored) {
        const settings = JSON.parse(stored);
        if (settings.static_ads_default_languages?.length) {
          return new Set(settings.static_ads_default_languages);
        }
      }
    } catch {}
    return new Set(LANGUAGES.map((l) => l.value));
  });

  const allTranslations = job.source_images?.flatMap(
    (si) => si.image_translations ?? []
  ) ?? [];
  const totalCount = allTranslations.length;
  const completedCount = allTranslations.filter((t) => t.status === "completed").length;
  const failedCount = allTranslations.filter((t) => t.status === "failed").length;
  const pendingCount = allTranslations.filter(
    (t) => t.status === "pending" || t.status === "processing"
  ).length;

  // Expansion counts
  const sourceImages = job.source_images ?? [];
  const expansionTotal = sourceImages.length;
  const expansionCompleted = sourceImages.filter(si => si.expansion_status === "completed").length;
  const expansionFailed = sourceImages.filter(si => si.expansion_status === "failed").length;

  const refreshJob = useCallback(async () => {
    const res = await fetch(`/api/image-jobs/${job.id}`);
    if (res.ok) {
      const data = await res.json();
      setJob(data);
      return data as ImageJob;
    }
    return null;
  }, [job.id]);

  // Start processing pending translations on mount (and auto-resume stalled ones)
  useEffect(() => {
    async function resumeOnMount() {
      const stalled = getStalledTranslations(initialJob);
      if (stalled.length > 0) {
        await fetch(`/api/image-jobs/${initialJob.id}/retry?include_stalled=true`, { method: "POST" });
        const updated = await refreshJob();
        if (updated) {
          const pending = getAllPending(updated);
          if (pending.length > 0 && !processingRef.current) {
            startQueue(pending);
          }
        }
        return;
      }
      const pending = getAllPending(initialJob);
      if (pending.length > 0 && !processingRef.current) {
        startQueue(pending);
      }
    }
    resumeOnMount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start expansion queue on mount if job is in expanding status
  useEffect(() => {
    if (initialJob.status !== "expanding") return;
    async function startExpansions() {
      const latest = await refreshJob();
      const j = latest ?? initialJob;
      if (j.status !== "expanding") return;
      const pending = (j.source_images ?? []).filter(
        (si) => si.expansion_status === "pending" || si.expansion_status === "processing"
      );
      if (pending.length > 0 && !expandProcessingRef.current) {
        startExpansionQueue(pending);
      }
    }
    startExpansions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watchdog timer: detect and recover stalled translations while processing
  useEffect(() => {
    if (!processing) return;
    const interval = setInterval(async () => {
      const updated = await refreshJob();
      if (!updated) return;
      const stalled = getStalledTranslations(updated);
      if (stalled.length > 0) {
        await fetch(`/api/image-jobs/${updated.id}/retry?include_stalled=true`, { method: "POST" });
        const refreshed = await refreshJob();
        if (refreshed) {
          const pending = getAllPending(refreshed);
          if (pending.length > 0 && !processingRef.current) {
            startQueue(pending);
          }
        }
      }
    }, 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processing]);

  // Stall detection banner
  useEffect(() => {
    if (
      job.status === "processing" &&
      !processingRef.current &&
      getStalledTranslations(job).length > 0
    ) {
      setShowRestartBanner(true);
    } else {
      setShowRestartBanner(false);
    }
  }, [job]);

  async function handleRestart() {
    await fetch(`/api/image-jobs/${job.id}/retry?include_stalled=true`, { method: "POST" });
    const updated = await refreshJob();
    if (updated) {
      const pending = getAllPending(updated);
      if (pending.length > 0) {
        startQueue(pending);
      }
    }
    setShowRestartBanner(false);
  }

  function getAllPending(j: ImageJob): ImageTranslation[] {
    return (
      j.source_images?.flatMap(
        (si) =>
          si.image_translations?.filter((t) => t.status === "pending") ?? []
      ) ?? []
    );
  }

  function getStalledTranslations(j: ImageJob): ImageTranslation[] {
    const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
    return (
      j.source_images?.flatMap(
        (si) =>
          si.image_translations?.filter(
            (t) =>
              t.status === "processing" &&
              new Date(t.updated_at).getTime() < twoMinutesAgo
          ) ?? []
      ) ?? []
    );
  }

  async function startQueue(translations: ImageTranslation[]) {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);

    const queue = [...translations];
    const CONCURRENCY = 10;
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
    const finalJob = await refreshJob();

    // Auto-export to Drive if enabled
    if (finalJob) {
      const settings = getSettings();
      if (settings.static_ads_quality_enabled !== false && finalJob.source_folder_id) {
        try {
          const exportRes = await fetch("/api/drive/export", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId: finalJob.id }),
          });
          const exportData = await exportRes.json().catch(() => ({}));
          if (!exportRes.ok) {
            setDriveExportError(exportData.error ?? "Auto-export to Drive failed");
          } else if (exportData.errors?.length) {
            setDriveExportError(`Exported ${exportData.exported} files, but ${exportData.errors.length} failed`);
          } else {
            setDriveExportDone(true);
            setTimeout(() => setDriveExportDone(false), 5000);
          }
          await refreshJob();
        } catch (err) {
          setDriveExportError(err instanceof Error ? err.message : "Auto-export to Drive failed");
        }
      }

      // Send email notification if enabled
      if (settings.static_ads_email_enabled && settings.static_ads_notification_email) {
        try {
          await fetch("/api/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jobId: finalJob.id,
              email: settings.static_ads_notification_email,
            }),
          });
        } catch (err) {
          console.error("Email notification failed:", err);
        }
      }
    }
  }

  async function processOne(translation: ImageTranslation) {
    const settings = getSettings();
    const qualityEnabled = settings.static_ads_quality_enabled !== false && !settings.static_ads_economy_mode;
    const threshold = settings.static_ads_quality_threshold ?? DEFAULT_QUALITY_THRESHOLD;

    let corrected_text: string | undefined;
    let visual_instructions: string | undefined;
    let attempts = 0;

    while (attempts < MAX_VERSIONS) {
      attempts++;

      try {
        // Translate
        const translateRes = await fetch(`/api/image-jobs/${job.id}/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            translationId: translation.id,
            ...(corrected_text && { corrected_text }),
            ...(visual_instructions && { visual_instructions }),
          }),
        });

        if (!translateRes.ok) break;
        const { versionId } = await translateRes.json();
        await refreshJob();

        // Quality analysis (skip if disabled or no versionId)
        if (!qualityEnabled || !versionId) break;

        const analyzeRes = await fetch(`/api/image-jobs/${job.id}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ versionId }),
        });

        if (!analyzeRes.ok) break;
        const analysis: QualityAnalysis = await analyzeRes.json();
        await refreshJob();

        // Check quality — if good enough, stop
        if (analysis.quality_score >= threshold) break;

        // Build corrective prompt for retry
        const corrections: string[] = [];
        if (analysis.spelling_errors?.length) corrections.push(`Fix spelling: ${analysis.spelling_errors.join(", ")}`);
        if (analysis.grammar_issues?.length) corrections.push(`Fix grammar: ${analysis.grammar_issues.join(", ")}`);
        if (analysis.missing_text?.length) corrections.push(`Include missing text: ${analysis.missing_text.join(", ")}`);

        corrected_text = analysis.extracted_text
          ? `The translated text should read: ${analysis.extracted_text}\n${corrections.join("\n")}`
          : corrections.join("\n");
        visual_instructions = [
          analysis.overall_assessment,
          corrections.length > 0 ? `Please correct: ${corrections.join("; ")}` : "",
        ].filter(Boolean).join("\n");

      } catch (err) {
        console.error("Translation/analysis failed:", err);
        break;
      }
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

  async function startExpansionQueue(images: SourceImage[]) {
    if (expandProcessingRef.current) return;
    expandProcessingRef.current = true;
    setExpandProcessing(true);

    // Run all expansions in parallel instead of sequentially
    await Promise.all(
      images.map(async (si) => {
        try {
          await fetch(`/api/image-jobs/${job.id}/expand`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceImageId: si.id }),
          });
        } catch (err) {
          console.error("Expansion failed for", si.id, err);
        }
      })
    );

    expandProcessingRef.current = false;
    setExpandProcessing(false);
    await refreshJob();
  }

  async function handleRetryExpansion(sourceImageId: string) {
    try {
      await fetch(`/api/image-jobs/${job.id}/expand`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceImageId }),
      });
      await refreshJob();
    } catch (err) {
      console.error("Expansion retry failed:", err);
    }
  }

  async function handleTranslateAll() {
    if (selectedLanguages.size === 0) return;
    setProcessing(true);

    // Save selected languages to job before creating translations
    await fetch(`/api/image-jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_languages: Array.from(selectedLanguages) }),
    });

    const res = await fetch(`/api/image-jobs/${job.id}/create-translations`, { method: "POST" });
    if (!res.ok) {
      setProcessing(false);
      return;
    }
    const updated = await refreshJob();
    if (updated) {
      const pending = getAllPending(updated);
      if (pending.length > 0) {
        startQueue(pending);
      } else {
        setProcessing(false);
      }
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      await exportJobAsZip(job);
    } finally {
      setExporting(false);
    }
  }

  async function handleExportToDrive() {
    setDriveExporting(true);
    setDriveExportError(null);
    try {
      const res = await fetch("/api/drive/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setDriveExportError(data.error ?? "Export failed");
        return;
      }

      if (data.errors?.length) {
        setDriveExportError(`Exported ${data.exported} files, but ${data.errors.length} failed: ${data.errors[0]}`);
      }

      setDriveExportDone(true);
      setTimeout(() => setDriveExportDone(false), 5000);
      await refreshJob();
    } catch (err) {
      setDriveExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setDriveExporting(false);
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

      {/* Stall detection banner */}
      {showRestartBanner && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="text-sm text-amber-700">Processing appears stalled.</span>
          </div>
          <button
            onClick={handleRestart}
            className="flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-800 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restart Now
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{job.name}</h1>
          <p className="text-sm text-gray-400 mt-1">
            {job.total_images ?? job.source_images?.length ?? 0} images &times;{" "}
            {job.target_languages.length} languages
            {job.target_ratios && job.target_ratios.length > 1 && (
              <> &times; {job.target_ratios.length} ratios</>
            )}
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
            <>
              {job.source_folder_id && (
                <div className="flex flex-col items-end gap-1">
                  <button
                    onClick={handleExportToDrive}
                    disabled={driveExporting}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-700 border border-gray-200 hover:border-indigo-200 rounded-lg px-3 py-2 transition-colors"
                  >
                    {driveExporting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : driveExportDone ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ) : job.exported_at ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    {driveExporting
                      ? "Exporting..."
                      : driveExportDone
                      ? "Exported!"
                      : "Export to Drive"}
                  </button>
                  {job.exported_at && !driveExporting && !driveExportDone && (
                    <span className="text-xs text-gray-400">
                      Exported {new Date(job.exported_at).toLocaleDateString("sv-SE")}{" "}
                      {new Date(job.exported_at).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              )}
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
            </>
          )}
        </div>
      </div>

      {/* Drive export error */}
      {driveExportError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="text-sm text-red-700">{driveExportError}</span>
          </div>
          <button
            onClick={() => setDriveExportError(null)}
            className="text-red-400 hover:text-red-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {job.status === "expanding" || job.status === "ready" ? (
        <>
          {/* Expansion status */}
          <div className="flex items-center gap-3 mb-6">
            {expandProcessing || job.status === "expanding" ? (
              <div className="flex items-center gap-1.5 text-indigo-600 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Expanding to 9:16... ({expansionCompleted}/{expansionTotal})
                <span className="text-gray-400 ml-1"><ElapsedTimer /></span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-emerald-600 text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  {expansionCompleted} expanded
                </span>
                {expansionFailed > 0 && (
                  <span className="flex items-center gap-1.5 text-yellow-600 text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    {expansionFailed} failed
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Source images with expansion preview */}
          <div className="space-y-4">
            {sourceImages.map((si) => (
              <div key={si.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex gap-6 items-start">
                  {/* Original 1:1 */}
                  <div className="w-48 shrink-0">
                    <p className="text-xs text-gray-400 mb-2">Original (1:1)</p>
                    <div className="aspect-square bg-gray-50 rounded-lg overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={si.original_url}
                        alt={si.filename ?? "Original"}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {si.filename && (
                      <p className="text-xs text-gray-400 mt-1 truncate">{si.filename}</p>
                    )}
                  </div>

                  {/* Expanded 9:16 */}
                  <div className="w-36 shrink-0">
                    <p className="text-xs text-gray-400 mb-2">Expanded (9:16)</p>
                    <div className="aspect-[9/16] bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center">
                      {si.expansion_status === "completed" && si.expanded_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={si.expanded_url}
                          alt="Expanded 9:16"
                          className="w-full h-full object-cover"
                        />
                      ) : si.expansion_status === "processing" ? (
                        <div className="text-center">
                          <Loader2 className="w-5 h-5 animate-spin text-indigo-400 mx-auto mb-1" />
                          <p className="text-xs text-gray-400">Expanding...</p>
                          <p className="text-xs text-gray-300 mt-0.5"><ElapsedTimer /></p>
                        </div>
                      ) : si.expansion_status === "failed" ? (
                        <div className="text-center px-2">
                          <AlertTriangle className="w-5 h-5 text-red-400 mx-auto mb-1" />
                          <p className="text-xs text-red-500 mb-1">{si.expansion_error || "Failed"}</p>
                          <button
                            onClick={() => handleRetryExpansion(si.id)}
                            className="text-xs text-indigo-600 hover:underline"
                          >
                            Retry
                          </button>
                        </div>
                      ) : (
                        <div className="text-center">
                          <Loader2 className="w-5 h-5 text-gray-300 mx-auto" />
                          <p className="text-xs text-gray-400 mt-1">Pending</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Language selection + Translate All (ready state) */}
          {job.status === "ready" && (
            <div className="mt-6 space-y-4">
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
                        <span>{lang.flag}</span>
                        {lang.label}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={handleTranslateAll}
                  disabled={processing || selectedLanguages.size === 0}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50"
                >
                  {processing ? (
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
                    {(sourceImages.length + expansionCompleted) * selectedLanguages.size} translations
                    {" \u2248 $"}{((sourceImages.length + expansionCompleted) * selectedLanguages.size * 0.09).toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
      <>
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
