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
  FlaskConical,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  MoreHorizontal,
  Image as ImageIcon,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { Translation, PageQualityAnalysis, ABTest, LANGUAGES, TranslationStatus, PageImageSelection } from "@/types";
import StatusDot from "@/components/dashboard/StatusDot";
import PublishModal from "@/components/pages/PublishModal";
import ImageSelectionModal from "@/components/pages/ImageSelectionModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
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

const AB_STATUS_LABELS: Record<string, string> = {
  draft: "A/B Draft",
  active: "A/B Active",
  completed: "A/B Completed",
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
  abTest,
  imagesToTranslate,
  onRegisterTranslate,
  onUnregisterTranslate,
}: {
  pageId: string;
  language: (typeof LANGUAGES)[number];
  translation?: Translation;
  abTest?: ABTest;
  imagesToTranslate?: PageImageSelection[];
  onRegisterTranslate?: (fn: () => Promise<void>) => void;
  onUnregisterTranslate?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"translate" | "publish" | "ab" | "analyze" | "regenerate" | "fix" | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [qualityScore, setQualityScore] = useState<number | null>(translation?.quality_score ?? null);
  const [qualityAnalysis, setQualityAnalysis] = useState<PageQualityAnalysis | null>(translation?.quality_analysis ?? null);
  const [attempt, setAttempt] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [confirmRepublish, setConfirmRepublish] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [pageHtml, setPageHtml] = useState("");
  const [imageProgress, setImageProgress] = useState<{ done: number; total: number; errors: string[] } | null>(null);
  const [timeEstimate, setTimeEstimate] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

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
    if (translation?.quality_score != null) setQualityScore(translation.quality_score);
    if (translation?.quality_analysis) setQualityAnalysis(translation.quality_analysis);
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
  const hasActiveTest = abTest && abTest.status !== "completed";

  function handleCancel() {
    if (abortRef.current) abortRef.current.abort();
    setLoading(null);
    setProgressLabel("");
    setAttempt(0);
    setImageProgress(null);
    setTimeEstimate(null);
    setElapsedSeconds(0);
    if (timerRef.current) clearInterval(timerRef.current);
    setError("Cancelled");
    router.refresh();
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

    for (const img of images) {
      if (abortRef.current?.signal.aborted) return;
      try {
        const res = await fetch("/api/translate-page-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            translationId,
            imageUrl: img.src,
            language: language.value,
            aspectRatio: "1:1",
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
    setError("");
    setQualityScore(null);
    setQualityAnalysis(null);
    setShowDetails(false);
    setAttempt(0);
    setImageProgress(null);

    // Create new abort controller for this run
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    // Start time estimate + elapsed timer
    const estimate = computeEstimateSeconds();
    setTimeEstimate(estimate);
    setElapsedSeconds(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    const settings = getPageQualitySettings();
    const tid = translation?.id;
    const hasImages = (imagesToTranslate?.length ?? 0) > 0;

    // Step 1: Translate once
    setProgressLabel("Translating text…");
    const result = await doTranslate();
    if (!result.ok) {
      setError("Translation failed");
      return;
    }

    const translationId = result.translationId || tid;
    if (!translationId) {
      setError("No translation ID returned");
      return;
    }

    // Step 2: Quality analysis + image translation in parallel
    const parallelTasks: Promise<unknown>[] = [];
    let analysisResult: PageQualityAnalysis | null = null;

    if (settings.enabled) {
      setProgressLabel("Analyzing quality…");
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
    setQualityScore(currentAnalysis.quality_score);
    setQualityAnalysis(currentAnalysis);

    // Step 3: Auto-fix loop — apply corrections up to MAX_FIX_ROUNDS times
    for (let fixRound = 0; fixRound < MAX_FIX_ROUNDS; fixRound++) {
      if (currentAnalysis.quality_score >= settings.threshold) {
        break; // Quality is good enough
      }

      const corrections = currentAnalysis.suggested_corrections;
      if (!corrections?.length) {
        break; // No corrections to apply
      }

      setProgressLabel(`Fixing issues (round ${fixRound + 1}/${MAX_FIX_ROUNDS})…`);

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
      setProgressLabel(`Re-analyzing (round ${fixRound + 1}/${MAX_FIX_ROUNDS})…`);
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
      setQualityScore(newAnalysis.quality_score);
      setQualityAnalysis(newAnalysis);
    }

    router.refresh();
  }

  async function handleTranslate() {
    setLoading("translate");
    try {
      await translateWithQualityLoop();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Translation failed — check your connection and try again");
    } finally {
      setLoading(null);
      setProgressLabel("");
      setAttempt(0);
      setImageProgress(null);
      // Keep timeEstimate and elapsedSeconds so the final time stays visible
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }

  async function handleRegenerate() {
    setLoading("regenerate");
    try {
      await translateWithQualityLoop();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Regeneration failed — check your connection and try again");
    } finally {
      setLoading(null);
      setProgressLabel("");
      setAttempt(0);
      setImageProgress(null);
      setTimeEstimate(null);
      setElapsedSeconds(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }

  async function handleFixQuality() {
    if (!translation?.id) return;
    setLoading("fix");
    setError("");

    // Create abort controller for fix operation
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      // If the current analysis has no suggested_corrections (old format),
      // re-analyze first to get corrections, then apply them
      const needsReanalysis = !qualityAnalysis?.suggested_corrections?.length;

      if (needsReanalysis) {
        setProgressLabel("Analyzing for corrections…");
        const freshAnalysis = await doAnalyze(translation.id);
        if (freshAnalysis) {
          setQualityScore(freshAnalysis.quality_score);
          setQualityAnalysis(freshAnalysis);
        }
        if (!freshAnalysis?.suggested_corrections?.length) {
          setError("Analysis found no actionable corrections");
          return;
        }
      }

      // Apply the corrections from the analysis
      setProgressLabel("Applying corrections…");
      const res = await fetch("/api/translate/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translation_id: translation.id }),
        signal: abortRef.current?.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Fix failed");
        return;
      }

      const fixData = await res.json();

      // Re-analyze with context about what was just fixed (prevents endless loop)
      setProgressLabel("Re-analyzing quality…");
      const analysis = await doAnalyze(translation.id, {
        applied_corrections: fixData.applied_corrections ?? [],
        previous_score: fixData.previous_score ?? qualityScore ?? 0,
        previous_issues: fixData.previous_issues ?? {
          fluency_issues: [],
          grammar_issues: [],
          context_errors: [],
        },
      });
      if (analysis) {
        setQualityScore(analysis.quality_score);
        setQualityAnalysis(analysis);
      }

      router.refresh();

      // Show brief success info
      if (fixData.corrections_applied !== undefined) {
        console.log(
          `Fix applied ${fixData.corrections_applied} corrections, ${fixData.corrections_failed} failed`
        );
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Fix failed — check your connection and try again");
    } finally {
      setLoading(null);
      setProgressLabel("");
    }
  }

  function handlePublish() {
    if (!translation?.id) return;
    if (translation.status === "published") {
      setConfirmRepublish(true);
      return;
    }
    setError("");
    setShowPublishModal(true);
  }

  function confirmAndPublish() {
    setConfirmRepublish(false);
    setError("");
    setShowPublishModal(true);
  }

  async function handleCreateABTest() {
    if (!translation?.id) return;
    setLoading("ab");
    setError("");

    try {
      const res = await fetch("/api/ab-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translation_id: translation.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 && data.id) {
          router.push(`/pages/${pageId}/ab-test/${language.value}`);
          return;
        }
        setError(data.error || "Failed to create A/B test");
        return;
      }

      router.push(`/pages/${pageId}/ab-test/${language.value}`);
    } catch {
      setError("Failed to create A/B test — check your connection");
    } finally {
      setLoading(null);
    }
  }

  function handleCopyUrl() {
    const url = abTest?.router_url || translation?.published_url;
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }

  const isProcessing = loading === "translate" || loading === "regenerate" || loading === "fix";

  // Not started — compact row
  if (!translation) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-base">{language.flag}</span>
            <span className="text-gray-500 text-sm">{language.label}</span>
            <span className="text-xs text-gray-300">{language.domain}</span>
          </div>
          <button
            onClick={handleTranslate}
            disabled={loading !== null}
            className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 text-indigo-600 text-xs font-medium px-3 py-1.5 rounded-lg border border-indigo-200 transition-colors"
          >
            {isProcessing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Globe className="w-3.5 h-3.5" />
            )}
            {isProcessing ? (progressLabel || "Translating…") : "Translate"}
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
            {timeEstimate !== null && (
              <span className="text-xs text-gray-400">
                {formatElapsed(elapsedSeconds)}
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

        {error && (
          <div className="flex items-start gap-2 text-red-600 text-xs mt-2 bg-red-50 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {error}
          </div>
        )}
      </div>
    );
  }

  const displayUrl = abTest?.router_url || translation.published_url;
  const settings = getPageQualitySettings();

  // Has translation — show full row
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        {/* Language info */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-lg">{language.flag}</span>
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
                <span className="text-xs text-indigo-600">{progressLabel || "Translating…"}</span>
                {timeEstimate !== null && (
                  <span className="text-xs text-gray-400">
                    {formatElapsed(elapsedSeconds)}
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
          ) : hasActiveTest ? (
            <>
              <FlaskConical className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-xs text-amber-600">
                {AB_STATUS_LABELS[abTest.status] ?? abTest.status}
              </span>
            </>
          ) : (
            <>
              <StatusDot status={status} />
              <span className="text-xs text-gray-500">{STATUS_LABELS[status]}</span>
            </>
          )}
        </div>

        {/* Quality score badge */}
        {qualityScore !== null && !isProcessing && (
          <div className="flex items-center gap-1.5 shrink-0">
            {elapsedSeconds > 0 && (
              <span className="text-xs text-gray-400">{formatElapsed(elapsedSeconds)}</span>
            )}
            <button
              onClick={() => setShowDetails((d) => !d)}
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${scoreBg(qualityScore)}`}
            >
              {qualityScore >= settings.threshold ? (
                <CheckCircle2 className={`w-3.5 h-3.5 ${scoreColor(qualityScore)}`} />
              ) : null}
              <span className={scoreColor(qualityScore)}>{qualityScore}%</span>
              <span className="text-gray-400 font-normal">/ {settings.threshold}</span>
              {showDetails ? (
                <ChevronUp className="w-3 h-3 text-gray-400" />
              ) : (
                <ChevronDown className="w-3 h-3 text-gray-400" />
              )}
            </button>
            {qualityAnalysis?.suggested_corrections && qualityAnalysis.suggested_corrections.length > 0 && (
              <button
                onClick={() => { handleFixQuality(); }}
                disabled={loading !== null}
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
          {hasActiveTest ? (
            <Link
              href={`/pages/${pageId}/ab-test/${language.value}`}
              className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-200 transition-colors"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              Manage Test
            </Link>
          ) : (
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
                disabled={!canPublish || loading !== null}
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
                      {qualityAnalysis?.suggested_corrections && qualityAnalysis.suggested_corrections.length > 0 && (
                        <button
                          onClick={() => { setShowMore(false); handleFixQuality(); }}
                          disabled={loading !== null}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-40 transition-colors"
                        >
                          {loading === "fix" ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                          Fix quality issues
                        </button>
                      )}
                      <button
                        onClick={() => { setShowMore(false); handleRegenerate(); }}
                        disabled={loading !== null}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                      >
                        {loading === "regenerate" ? (
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
                        disabled={loading !== null}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        Translate images
                      </button>
                      <button
                        onClick={() => { setShowMore(false); handleCreateABTest(); }}
                        disabled={loading !== null}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                      >
                        {loading === "ab" ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FlaskConical className="w-3.5 h-3.5" />
                        )}
                        Create A/B test
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
      {showDetails && qualityAnalysis && (
        <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
          <p className="text-xs text-gray-600">{qualityAnalysis.overall_assessment}</p>
          {qualityAnalysis.fluency_issues.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Fluency issues</p>
              <ul className="text-xs text-gray-500 space-y-0.5">
                {qualityAnalysis.fluency_issues.map((issue, i) => (
                  <li key={i}>- {issue}</li>
                ))}
              </ul>
            </div>
          )}
          {qualityAnalysis.grammar_issues.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Grammar issues</p>
              <ul className="text-xs text-gray-500 space-y-0.5">
                {qualityAnalysis.grammar_issues.map((issue, i) => (
                  <li key={i}>- {issue}</li>
                ))}
              </ul>
            </div>
          )}
          {qualityAnalysis.context_errors.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Context errors</p>
              <ul className="text-xs text-gray-500 space-y-0.5">
                {qualityAnalysis.context_errors.map((issue, i) => (
                  <li key={i}>- {issue}</li>
                ))}
              </ul>
            </div>
          )}
          {qualityAnalysis.name_localization.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Unlocalized names</p>
              <ul className="text-xs text-gray-500 space-y-0.5">
                {qualityAnalysis.name_localization.map((issue, i) => (
                  <li key={i}>- {issue}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 text-red-600 text-xs mt-2 bg-red-50 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {error}
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

      {translation?.id && (
        <ImageSelectionModal
          open={showImageModal}
          translationId={translation.id}
          language={language}
          pageHtml={pageHtml}
          onClose={(translated) => {
            setShowImageModal(false);
            if (translated) router.refresh();
          }}
        />
      )}
    </div>
  );
}
