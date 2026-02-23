"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Globe,
  Upload,
  Pencil,
  Copy,
  Check,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  MoreHorizontal,
  Image as ImageIcon,
  XCircle,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { Translation, PageQualityAnalysis, LANGUAGES, TranslationStatus, PageImageSelection } from "@/types";
import StatusDot from "@/components/dashboard/StatusDot";
import PublishModal from "@/components/pages/PublishModal";
import ImageSelectionModal from "@/components/pages/ImageSelectionModal";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { getPageQualitySettings } from "@/lib/settings";

const MAX_FIX_ROUNDS = 3;

const STATUS_LABELS: Record<TranslationStatus | "none", string> = {
  none: "Not started",
  draft: "Draft",
  translating: "Translating…",
  translated: "Translated",
  publishing: "Publishing…",
  published: "Published",
  error: "Error",
};


function scoreColor(score: number): string {
  if (score >= 85) return "text-emerald-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

function scoreBg(score: number): string {
  if (score >= 85) return "bg-emerald-50 border-emerald-200";
  if (score >= 60) return "bg-yellow-50 border-yellow-200";
  return "bg-red-50 border-red-200";
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export default function TranslationRow({
  pageId,
  language,
  translation,
  imagesToTranslate,
  onRegisterTranslate,
  onUnregisterTranslate,
}: {
  pageId: string;
  language: (typeof LANGUAGES)[number];
  translation?: Translation;
  imagesToTranslate?: PageImageSelection[];
  onRegisterTranslate?: (fn: () => Promise<void>) => void;
  onUnregisterTranslate?: () => void;
}) {
  const router = useRouter();

  // Loading/progress states
  const [progress, setProgress] = useState<{
    loading: "translate" | "publish" | "analyze" | "regenerate" | "fix" | null;
    error: string;
    progressLabel: string;
    attempt: number;
    elapsedSeconds: number;
    timeEstimate: number | null;
  }>({ loading: null, error: "", progressLabel: "", attempt: 0, elapsedSeconds: 0, timeEstimate: null });

  // Quality states
  const [quality, setQuality] = useState<{
    score: number | null;
    analysis: PageQualityAnalysis | null;
  }>({ score: translation?.quality_score ?? null, analysis: translation?.quality_analysis ?? null });

  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [confirmRepublish, setConfirmRepublish] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [pageHtml, setPageHtml] = useState("");
  const [imageProgress, setImageProgress] = useState<{ done: number; total: number; errors: string[] } | null>(null);
  const [bgImageProgress, setBgImageProgress] = useState<{ done: number; total: number; status: string } | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const bgPollRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (bgPollRef.current) clearInterval(bgPollRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // Start polling if translation has background image work in progress (e.g. after page reload)
  useEffect(() => {
    if (translation?.image_status === "translating" && translation.id) {
      startImagePolling(translation.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translation?.id, translation?.image_status]);

  // Close "more" dropdown on outside click
  useEffect(() => {
    if (!showMore) return;
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setShowMore(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMore]);

  // Sync from props when translation changes
  useEffect(() => {
    if (translation?.quality_score != null || translation?.quality_analysis) {
      setQuality(prev => ({
        ...prev,
        ...(translation?.quality_score != null ? { score: translation.quality_score } : {}),
        ...(translation?.quality_analysis ? { analysis: translation.quality_analysis } : {}),
      }));
    }
  }, [translation?.quality_score, translation?.quality_analysis]);

  // Register translate function for "Translate All" callback ref pattern
  useEffect(() => {
    if (onRegisterTranslate) {
      onRegisterTranslate(handleTranslate);
    }
    return () => {
      if (onUnregisterTranslate) onUnregisterTranslate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRegisterTranslate, onUnregisterTranslate]);

  const status: TranslationStatus | "none" = translation?.status ?? "none";
  const canPublish =
    status === "translated" || status === "published" || status === "error";

  function handleCancel() {
    if (abortRef.current) abortRef.current.abort();
    setProgress({ loading: null, error: "Cancelled", progressLabel: "", attempt: 0, elapsedSeconds: 0, timeEstimate: null });
    setImageProgress(null);
    if (timerRef.current) clearInterval(timerRef.current);
    router.refresh();
  }

  function startImagePolling(tid: string) {
    if (bgPollRef.current) clearInterval(bgPollRef.current);

    // Show initial state
    setBgImageProgress({
      done: translation?.images_done ?? 0,
      total: translation?.images_total ?? 0,
      status: "translating",
    });

    bgPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/translations/${tid}/image-status`);
        if (!res.ok) return;
        const data = await res.json();

        setBgImageProgress({
          done: data.images_done,
          total: data.images_total,
          status: data.image_status,
        });

        if (data.image_status === "done" || data.image_status === "error") {
          if (bgPollRef.current) clearInterval(bgPollRef.current);
          bgPollRef.current = null;
          router.refresh();
          // Clear after 5s
          setTimeout(() => setBgImageProgress(null), 5000);
        }
      } catch {
        // Ignore polling errors
      }
    }, 5000);
  }

  async function doTranslate(): Promise<{ ok: boolean; translationId?: string }> {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page_id: pageId, language: language.value }),
      signal: abortRef.current?.signal,
    });
    const data = await res.json();
    if (!res.ok) return { ok: false };
    return { ok: true, translationId: data.id };
  }

  async function doAnalyze(
    translationId: string,
    previousContext?: {
      applied_corrections: { find: string; replace: string }[];
      previous_score: number;
      previous_issues: {
        fluency_issues: string[];
        grammar_issues: string[];
        context_errors: string[];
      };
    }
  ): Promise<PageQualityAnalysis | null> {
    const res = await fetch("/api/translate/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        translation_id: translationId,
        ...(previousContext && { previous_context: previousContext }),
      }),
      signal: abortRef.current?.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  }

  async function fetchTranslatedHtml(tid: string): Promise<string> {
    try {
      const res = await fetch(`/api/preview/${tid}`);
      if (res.ok) return await res.text();
    } catch { /* ignore */ }
    return "";
  }

  async function openImageModal(tid: string) {
    const html = await fetchTranslatedHtml(tid);
    if (html) {
      setPageHtml(html);
      setShowImageModal(true);
    }
  }

  async function translateImages(translationId: string): Promise<void> {
    const images = imagesToTranslate || [];
    if (images.length === 0) return;

    setImageProgress({ done: 0, total: images.length, errors: [] });

    for (let idx = 0; idx < images.length; idx++) {
      const img = images[idx];
      if (abortRef.current?.signal.aborted) return;
      try {
        const res = await fetch("/api/translate-page-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            translationId,
            imageUrl: img.src,
            language: language.value,
            // First call initializes batch tracking in DB
            ...(idx === 0 && { batchInit: true, batchTotal: images.length }),
          }),
          signal: abortRef.current?.signal,
        });

        if (!res.ok) {
          const data = await res.json();
          setImageProgress((prev) =>
            prev ? { ...prev, done: prev.done + 1, errors: [...prev.errors, data.error || "Image failed"] } : prev
          );
        } else {
          setImageProgress((prev) =>
            prev ? { ...prev, done: prev.done + 1 } : prev
          );
        }
      } catch {
        setImageProgress((prev) =>
          prev ? { ...prev, done: prev.done + 1, errors: [...prev.errors, "Network error"] } : prev
        );
      }
    }
  }

  function computeEstimateSeconds(): number {
    const settings = getPageQualitySettings();
    const imageCount = imagesToTranslate?.length ?? 0;
    return 15 + (settings.enabled ? 8 : 0) + imageCount * 20;
  }

  async function translateWithQualityLoop() {
    setQuality({ score: null, analysis: null });
    setShowDetails(false);
    setImageProgress(null);

    // Create new abort controller for this run
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    // Start time estimate + elapsed timer
    const estimate = computeEstimateSeconds();
    setProgress(prev => ({ ...prev, error: "", attempt: 0, timeEstimate: estimate, elapsedSeconds: 0 }));
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setProgress(prev => ({ ...prev, elapsedSeconds: prev.elapsedSeconds + 1 }));
    }, 1000);

    const settings = getPageQualitySettings();
    const tid = translation?.id;
    const hasImages = (imagesToTranslate?.length ?? 0) > 0;

    // Step 1: Translate once
    setProgress(prev => ({ ...prev, progressLabel: "Translating text\u2026" }));
    const result = await doTranslate();
    if (!result.ok) {
      setProgress(prev => ({ ...prev, error: "Translation failed" }));
      return;
    }

    const translationId = result.translationId || tid;
    if (!translationId) {
      setProgress(prev => ({ ...prev, error: "No translation ID returned" }));
      return;
    }

    // Step 2: Quality analysis + image translation in parallel
    const parallelTasks: Promise<unknown>[] = [];
    let analysisResult: PageQualityAnalysis | null = null;

    if (settings.enabled) {
      setProgress(prev => ({ ...prev, progressLabel: "Analyzing quality\u2026" }));
      parallelTasks.push(
        doAnalyze(translationId).then((a) => { analysisResult = a; })
      );
    }

    if (hasImages) {
      parallelTasks.push(translateImages(translationId));
    }

    await Promise.all(parallelTasks);

    if (!settings.enabled || !analysisResult) {
      router.refresh();
      return;
    }

    let currentAnalysis: PageQualityAnalysis = analysisResult;
    setQuality({ score: currentAnalysis.quality_score, analysis: currentAnalysis });

    // Step 3: Auto-fix loop — apply corrections up to MAX_FIX_ROUNDS times
    for (let fixRound = 0; fixRound < MAX_FIX_ROUNDS; fixRound++) {
      if (currentAnalysis.quality_score >= settings.threshold) {
        break; // Quality is good enough
      }

      const corrections = currentAnalysis.suggested_corrections;
      if (!corrections?.length) {
        break; // No corrections to apply
      }

      setProgress(prev => ({ ...prev, progressLabel: `Fixing issues (round ${fixRound + 1}/${MAX_FIX_ROUNDS})\u2026` }));

      // Apply corrections
      const fixRes = await fetch("/api/translate/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translation_id: translationId }),
        signal: abortRef.current?.signal,
      });

      if (!fixRes.ok) break;
      const fixData = await fixRes.json();

      if (!fixData.corrections_applied) break; // Nothing was applied

      // Re-analyze with context about what was fixed
      setProgress(prev => ({ ...prev, progressLabel: `Re-analyzing (round ${fixRound + 1}/${MAX_FIX_ROUNDS})\u2026` }));
      const newAnalysis = await doAnalyze(translationId, {
        applied_corrections: fixData.applied_corrections ?? [],
        previous_score: fixData.previous_score ?? currentAnalysis.quality_score ?? 0,
        previous_issues: fixData.previous_issues ?? {
          fluency_issues: [],
          grammar_issues: [],
          context_errors: [],
        },
      });

      if (!newAnalysis) break;

      currentAnalysis = newAnalysis;
      setQuality({ score: newAnalysis.quality_score, analysis: newAnalysis });
    }

    router.refresh();
  }

  async function handleTranslate() {
    setProgress(prev => ({ ...prev, loading: "translate" }));
    try {
      await translateWithQualityLoop();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setProgress(prev => ({ ...prev, error: "Translation failed \u2014 check your connection and try again" }));
    } finally {
      setProgress(prev => ({ ...prev, loading: null, progressLabel: "", attempt: 0 }));
      setImageProgress(null);
      // Keep timeEstimate and elapsedSeconds so the final time stays visible
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }

  async function handleRegenerate() {
    setProgress(prev => ({ ...prev, loading: "regenerate" }));
    try {
      await translateWithQualityLoop();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setProgress(prev => ({ ...prev, error: "Regeneration failed \u2014 check your connection and try again" }));
    } finally {
      setProgress(prev => ({ ...prev, loading: null, progressLabel: "", attempt: 0, timeEstimate: null, elapsedSeconds: 0 }));
      setImageProgress(null);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }

  async function handleFixQuality() {
    if (!translation?.id) return;
    setProgress(prev => ({ ...prev, loading: "fix", error: "" }));

    // Create abort controller for fix operation
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      // If the current analysis has no suggested_corrections (old format),
      // re-analyze first to get corrections, then apply them
      const needsReanalysis = !quality.analysis?.suggested_corrections?.length;

      if (needsReanalysis) {
        setProgress(prev => ({ ...prev, progressLabel: "Analyzing for corrections\u2026" }));
        const freshAnalysis = await doAnalyze(translation.id);
        if (freshAnalysis) {
          setQuality({ score: freshAnalysis.quality_score, analysis: freshAnalysis });
        }
        if (!freshAnalysis?.suggested_corrections?.length) {
          setProgress(prev => ({ ...prev, error: "Analysis found no actionable corrections" }));
          return;
        }
      }

      // Apply the corrections from the analysis
      setProgress(prev => ({ ...prev, progressLabel: "Applying corrections\u2026" }));
      const res = await fetch("/api/translate/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translation_id: translation.id }),
        signal: abortRef.current?.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        setProgress(prev => ({ ...prev, error: data.error || "Fix failed" }));
        return;
      }

      const fixData = await res.json();

      // Re-analyze with context about what was just fixed (prevents endless loop)
      setProgress(prev => ({ ...prev, progressLabel: "Re-analyzing quality\u2026" }));
      const analysis = await doAnalyze(translation.id, {
        applied_corrections: fixData.applied_corrections ?? [],
        previous_score: fixData.previous_score ?? quality.score ?? 0,
        previous_issues: fixData.previous_issues ?? {
          fluency_issues: [],
          grammar_issues: [],
          context_errors: [],
        },
      });
      if (analysis) {
        setQuality({ score: analysis.quality_score, analysis: analysis });
      }

      router.refresh();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setProgress(prev => ({ ...prev, error: "Fix failed \u2014 check your connection and try again" }));
    } finally {
      setProgress(prev => ({ ...prev, loading: null, progressLabel: "" }));
    }
  }

  function handlePublish() {
    if (!translation?.id) return;
    if (translation.status === "published") {
      setConfirmRepublish(true);
      return;
    }
    setProgress(prev => ({ ...prev, error: "" }));
    setShowPublishModal(true);
  }

  function confirmAndPublish() {
    setConfirmRepublish(false);
    setProgress(prev => ({ ...prev, error: "" }));
    setShowPublishModal(true);
  }

  async function handleDelete() {
    if (!translation?.id) return;
    setProgress(prev => ({ ...prev, loading: "translate", error: "" }));
    try {
      const res = await fetch(`/api/translations/${translation.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setProgress(prev => ({ ...prev, error: data.error || "Failed to delete translation" }));
        return;
      }
      router.refresh();
    } catch {
      setProgress(prev => ({ ...prev, error: "Failed to delete — check your connection" }));
    } finally {
      setProgress(prev => ({ ...prev, loading: null }));
    }
  }

  function handleCopyUrl() {
    const url = translation?.published_url;
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }

  const isProcessing = progress.loading === "translate" || progress.loading === "regenerate" || progress.loading === "fix";

  // Not started — compact row
  if (!translation) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-base" role="img" aria-label={language.label}>{language.flag}</span>
            <span className="text-gray-500 text-sm">{language.label}</span>
            <span className="text-xs text-gray-300">{language.domain}</span>
          </div>
          <button
            onClick={handleTranslate}
            disabled={progress.loading !== null}
            className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 text-indigo-600 text-xs font-medium px-3 py-1.5 rounded-lg border border-indigo-200 transition-colors"
          >
            {isProcessing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Globe className="w-3.5 h-3.5" />
            )}
            {isProcessing ? (progress.progressLabel || "Translating\u2026") : "Translate"}
          </button>
          {isProcessing && (
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 transition-colors"
              title="Cancel"
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {isProcessing && (
          <div className="flex items-center gap-3 mt-1.5">
            {progress.timeEstimate !== null && (
              <span className="text-xs text-gray-400">
                {formatElapsed(progress.elapsedSeconds)}
              </span>
            )}
            {imageProgress && (
              <div className="flex items-center gap-1.5">
                {imageProgress.done < imageProgress.total ? (
                  <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                ) : (
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                )}
                <span className="text-xs text-amber-600">
                  Images {imageProgress.done}/{imageProgress.total}
                </span>
              </div>
            )}
          </div>
        )}

        {progress.error && (
          <div className="flex items-start gap-2 text-red-600 text-xs mt-2 bg-red-50 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {progress.error}
          </div>
        )}
      </div>
    );
  }

  const displayUrl = translation.published_url;
  const settings = getPageQualitySettings();

  // Has translation — show full row
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        {/* Language info */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-lg" role="img" aria-label={language.label}>{language.flag}</span>
          <div>
            <p className="text-gray-800 font-medium text-sm">{language.label}</p>
            <p className="text-gray-400 text-xs">{language.domain}</p>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isProcessing ? (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                <span className="text-xs text-indigo-600">{progress.progressLabel || "Translating\u2026"}</span>
                {progress.timeEstimate !== null && (
                  <span className="text-xs text-gray-400">
                    {formatElapsed(progress.elapsedSeconds)}
                  </span>
                )}
                <button
                  onClick={handleCancel}
                  className="text-gray-400 hover:text-red-600 transition-colors ml-1"
                  title="Cancel"
                >
                  <XCircle className="w-3.5 h-3.5" />
                </button>
              </div>
              {imageProgress && (
                <div className="flex items-center gap-1.5">
                  {imageProgress.done < imageProgress.total ? (
                    <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                  ) : (
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  )}
                  <span className="text-xs text-amber-600">
                    Images {imageProgress.done}/{imageProgress.total}
                    {imageProgress.errors.length > 0 && ` (${imageProgress.errors.length} failed)`}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <StatusDot status={status} />
                <span className="text-xs text-gray-500">{STATUS_LABELS[status]}</span>
              </div>
              {bgImageProgress && (
                <div className="flex items-center gap-1.5">
                  {bgImageProgress.status === "translating" ? (
                    <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                  ) : bgImageProgress.status === "done" ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <AlertCircle className="w-3 h-3 text-red-500" />
                  )}
                  <span className={`text-xs ${bgImageProgress.status === "done" ? "text-emerald-600" : bgImageProgress.status === "error" ? "text-red-600" : "text-amber-600"}`}>
                    Images {bgImageProgress.done}/{bgImageProgress.total}
                    {bgImageProgress.status === "done" && " — done!"}
                    {bgImageProgress.status === "error" && " — error"}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quality score badge */}
        {quality.score !== null && !isProcessing && (
          <div className="flex items-center gap-1.5 shrink-0">
            {progress.elapsedSeconds > 0 && (
              <span className="text-xs text-gray-400">{formatElapsed(progress.elapsedSeconds)}</span>
            )}
            <button
              onClick={() => setShowDetails((d) => !d)}
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${scoreBg(quality.score)}`}
            >
              {quality.score >= settings.threshold ? (
                <CheckCircle2 className={`w-3.5 h-3.5 ${scoreColor(quality.score)}`} />
              ) : null}
              <span className={scoreColor(quality.score)}>{quality.score}%</span>
              <span className="text-gray-400 font-normal">/ {settings.threshold}</span>
              {showDetails ? (
                <ChevronUp className="w-3 h-3 text-gray-400" />
              ) : (
                <ChevronDown className="w-3 h-3 text-gray-400" />
              )}
            </button>
            {quality.analysis?.suggested_corrections && quality.analysis.suggested_corrections.length > 0 && (
              <button
                onClick={() => { handleFixQuality(); }}
                disabled={progress.loading !== null}
                className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded-full transition-colors disabled:opacity-40"
              >
                <RefreshCw className="w-3 h-3" />
                Fix
              </button>
            )}
          </div>
        )}
        {/* Published URL + copy */}
        <div className="flex-1 min-w-0">
          {displayUrl ? (
            <div className="flex items-center gap-1.5">
              <a
                href={displayUrl.startsWith("http") ? displayUrl : `https://${displayUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-400 hover:text-indigo-600 truncate transition-colors"
              >
                {displayUrl.replace(/^https?:\/\//, "")}
              </a>
              <button
                onClick={handleCopyUrl}
                className="shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
                title="Copy URL"
                aria-label={copied ? "URL copied" : "Copy URL"}
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ) : (
            <span className="text-xs text-gray-400">Not published</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {(
            <>
              <Link
                href={`/pages/${pageId}/edit/${language.value}`}
                className="flex items-center gap-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </Link>
              <button
                onClick={handlePublish}
                disabled={!canPublish || progress.loading !== null}
                className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-700 text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-200 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                Publish
              </button>
              {/* Secondary actions menu */}
              {canPublish && (
                <div ref={moreRef} className="relative">
                  <button
                    onClick={() => setShowMore((p) => !p)}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    title="More actions"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {showMore && (
                    <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                      {quality.analysis?.suggested_corrections && quality.analysis.suggested_corrections.length > 0 && (
                        <button
                          onClick={() => { setShowMore(false); handleFixQuality(); }}
                          disabled={progress.loading !== null}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-40 transition-colors"
                        >
                          {progress.loading === "fix" ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                          Fix quality issues
                        </button>
                      )}
                      <button
                        onClick={() => { setShowMore(false); handleRegenerate(); }}
                        disabled={progress.loading !== null}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                      >
                        {progress.loading === "regenerate" ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        Regenerate translation
                      </button>
                      <button
                        onClick={async () => {
                          setShowMore(false);
                          if (translation?.id) await openImageModal(translation.id);
                        }}
                        disabled={progress.loading !== null}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        Translate images
                      </button>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={() => { setShowMore(false); setConfirmDelete(true); }}
                        disabled={progress.loading !== null}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete translation
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Quality details (expandable) */}
      {showDetails && quality.analysis && (
        <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
          <p className="text-xs text-gray-600">{quality.analysis.overall_assessment}</p>
          {quality.analysis.fluency_issues.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Fluency issues</p>
              <ul className="text-xs text-gray-500 space-y-0.5">
                {quality.analysis.fluency_issues.map((issue, i) => (
                  <li key={i}>- {issue}</li>
                ))}
              </ul>
            </div>
          )}
          {quality.analysis.grammar_issues.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Grammar issues</p>
              <ul className="text-xs text-gray-500 space-y-0.5">
                {quality.analysis.grammar_issues.map((issue, i) => (
                  <li key={i}>- {issue}</li>
                ))}
              </ul>
            </div>
          )}
          {quality.analysis.context_errors.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Context errors</p>
              <ul className="text-xs text-gray-500 space-y-0.5">
                {quality.analysis.context_errors.map((issue, i) => (
                  <li key={i}>- {issue}</li>
                ))}
              </ul>
            </div>
          )}
          {quality.analysis.name_localization.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Unlocalized names</p>
              <ul className="text-xs text-gray-500 space-y-0.5">
                {quality.analysis.name_localization.map((issue, i) => (
                  <li key={i}>- {issue}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {progress.error && (
        <div className="flex items-start gap-2 text-red-600 text-xs mt-2 bg-red-50 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {progress.error}
        </div>
      )}

      {/* Publish progress modal */}
      {translation?.id && (
        <PublishModal
          open={showPublishModal}
          translationId={translation.id}
          onClose={(published) => {
            setShowPublishModal(false);
            if (published) router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={confirmRepublish}
        title="Re-publish page"
        message="This page is already live. Re-publish with current content?"
        confirmLabel="Re-publish"
        variant="warning"
        onConfirm={confirmAndPublish}
        onCancel={() => setConfirmRepublish(false)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete translation"
        message={`Delete the ${language.label} translation? This removes all translated text and images. You can re-translate from the English source afterwards.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => { setConfirmDelete(false); handleDelete(); }}
        onCancel={() => setConfirmDelete(false)}
      />

      {translation?.id && (
        <ImageSelectionModal
          open={showImageModal}
          translationId={translation.id}
          language={language}
          pageHtml={pageHtml}
          onClose={(translated, stillTranslating) => {
            setShowImageModal(false);
            if (stillTranslating && translation?.id) {
              startImagePolling(translation.id);
            } else if (translated) {
              router.refresh();
            }
          }}
        />
      )}
    </div>
  );
}
