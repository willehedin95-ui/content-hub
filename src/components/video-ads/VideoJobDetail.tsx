"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  RefreshCw,
  Play,
  ChevronDown,
  ChevronRight,
  Film,
  Languages,
  Loader2,
} from "lucide-react";
import { VideoJob, VideoTranslation, LANGUAGES } from "@/types";
import { VIDEO_FORMATS, HOOK_TYPES, SCRIPT_STRUCTURES } from "@/lib/constants";

interface Props {
  initialJob: VideoJob;
}

// Status badge colors
function statusColor(status: string): string {
  switch (status) {
    case "draft":
      return "bg-gray-100 text-gray-600";
    case "generating":
    case "translating":
    case "pushing":
      return "bg-amber-100 text-amber-700";
    case "generated":
    case "translated":
      return "bg-blue-100 text-blue-700";
    case "live":
      return "bg-green-100 text-green-700";
    case "killed":
      return "bg-red-100 text-red-600";
    case "completed":
      return "bg-green-100 text-green-700";
    case "pending":
      return "bg-gray-100 text-gray-600";
    case "failed":
      return "bg-red-100 text-red-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColor(status)}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export default function VideoJobDetail({ initialJob }: Props) {
  const [job, setJob] = useState<VideoJob>(initialJob);
  const [generating, setGenerating] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Derived lookups
  const formatLabel =
    VIDEO_FORMATS.find((f) => f.id === job.format_type)?.label ?? job.format_type;
  const hookLabel =
    HOOK_TYPES.find((h) => h.id === job.hook_type)?.label ?? job.hook_type;
  const structureLabel =
    SCRIPT_STRUCTURES.find((s) => s.id === job.script_structure)?.label ??
    job.script_structure;

  // Refresh job from API
  const refreshJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/video-jobs/${job.id}`);
      if (res.ok) {
        const data = await res.json();
        setJob(data);
        return data as VideoJob;
      }
    } catch {
      // Silently ignore refresh errors
    }
    return null;
  }, [job.id]);

  // Polling: when job is generating or translating, poll every 3s
  useEffect(() => {
    const shouldPoll =
      job.status === "generating" || job.status === "translating";

    if (shouldPoll) {
      pollRef.current = setInterval(() => {
        refreshJob();
      }, 3000);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [job.status, refreshJob]);

  // Generate source video
  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/video-jobs/${job.id}/generate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Generation failed");
      }
      await refreshJob();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  // Create translations then generate them
  async function handleTranslate() {
    setTranslating(true);
    setError(null);
    try {
      // Step 1: Create translations (translates scripts via Claude)
      const createRes = await fetch(
        `/api/video-jobs/${job.id}/create-translations`,
        { method: "POST" }
      );
      const createData = await createRes.json();
      if (!createRes.ok) {
        setError(createData.error || "Failed to create translations");
        setTranslating(false);
        return;
      }

      await refreshJob();

      // Step 2: Generate translated videos via Sora
      const genRes = await fetch(
        `/api/video-jobs/${job.id}/generate-translations`,
        { method: "POST" }
      );
      const genData = await genRes.json();
      if (!genRes.ok) {
        setError(genData.error || "Failed to generate translations");
      }
      await refreshJob();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Translation failed"
      );
    } finally {
      setTranslating(false);
    }
  }

  // Find source video
  const sourceVideo =
    job.source_videos?.find((sv) => sv.status === "completed") ??
    job.source_videos?.[0] ??
    null;

  const translations = job.video_translations ?? [];
  const hasTargetLanguages =
    job.target_languages && job.target_languages.length > 0;

  // Title
  const title = [
    job.concept_number ? `#${job.concept_number}` : null,
    job.concept_name,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="p-8 max-w-6xl">
      {/* Back */}
      <Link
        href="/video-ads"
        className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900 text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Video Ads
      </Link>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* === LEFT COLUMN: Script & Prompt === */}
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>

            {/* Metadata pills */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-gray-100 text-xs font-medium text-gray-700 capitalize">
                {job.product}
              </span>
              <StatusBadge status={job.status} />
              {formatLabel && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-indigo-50 text-xs font-medium text-indigo-700">
                  {formatLabel}
                </span>
              )}
              {hookLabel && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-purple-50 text-xs font-medium text-purple-700">
                  {hookLabel}
                </span>
              )}
              {structureLabel && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-teal-50 text-xs font-medium text-teal-700">
                  {structureLabel}
                </span>
              )}
              <span className="text-xs text-gray-400">
                {job.duration_seconds}s
              </span>
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Script panel */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Script</h2>
            </div>
            <div className="p-4">
              {job.script ? (
                <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">
                  {job.script}
                </pre>
              ) : (
                <p className="text-sm text-gray-400 italic">
                  No script written yet
                </p>
              )}
            </div>
          </div>

          {/* Sora Prompt panel (collapsible) */}
          {job.sora_prompt && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setShowPrompt(!showPrompt)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <h2 className="text-sm font-semibold text-gray-700">
                  Sora Prompt
                </h2>
                {showPrompt ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
              </button>
              {showPrompt && (
                <div className="p-4 border-t border-gray-100">
                  <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">
                    {job.sora_prompt}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Character description panel */}
          {job.character_description && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-700">
                  Character
                </h2>
                {job.character_tag && (
                  <span className="text-xs text-gray-400 font-mono">
                    {job.character_tag}
                  </span>
                )}
              </div>
              <div className="p-4">
                <p className="text-sm text-gray-700 leading-relaxed">
                  {job.character_description}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* === RIGHT COLUMN: Video + Translations === */}
        <div className="space-y-6">
          {/* Video preview panel */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Film className="w-4 h-4 text-gray-400" />
                Source Video
              </h2>
              <button
                onClick={() => refreshJob()}
                className="text-gray-400 hover:text-gray-700 p-1 transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-4">
              {sourceVideo?.video_url ? (
                <video
                  src={sourceVideo.video_url}
                  controls
                  className="w-full rounded-lg bg-black"
                  preload="metadata"
                />
              ) : sourceVideo?.status === "generating" ? (
                <div className="aspect-[9/16] max-h-[400px] bg-gray-100 rounded-lg flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                  <p className="text-sm text-gray-500">
                    Generating video...
                  </p>
                </div>
              ) : sourceVideo?.status === "failed" ? (
                <div className="aspect-[9/16] max-h-[400px] bg-red-50 rounded-lg flex flex-col items-center justify-center gap-3 p-6">
                  <AlertTriangle className="w-8 h-8 text-red-400" />
                  <p className="text-sm text-red-600 text-center">
                    {sourceVideo.error_message || "Generation failed"}
                  </p>
                </div>
              ) : (
                <div className="aspect-[9/16] max-h-[400px] bg-gray-100 rounded-lg flex flex-col items-center justify-center gap-3">
                  <Play className="w-8 h-8 text-gray-300" />
                  <p className="text-sm text-gray-400">
                    No video generated yet
                  </p>
                </div>
              )}

              {/* Generate button */}
              {(job.status === "draft" || job.status === "generated") &&
                job.sora_prompt && (
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Film className="w-4 h-4" />
                        {sourceVideo?.video_url
                          ? "Re-generate Video"
                          : "Generate Video"}
                      </>
                    )}
                  </button>
                )}

              {/* Generate Translations button */}
              {job.status === "generated" && hasTargetLanguages && (
                <button
                  onClick={handleTranslate}
                  disabled={translating}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {translating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Translating...
                    </>
                  ) : (
                    <>
                      <Languages className="w-4 h-4" />
                      Generate Translations (
                      {job.target_languages.length} languages)
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Translations panel */}
          {translations.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Languages className="w-4 h-4 text-gray-400" />
                  Translations
                  <span className="text-xs text-gray-400 font-normal">
                    ({translations.filter((t) => t.status === "completed").length}
                    /{translations.length} complete)
                  </span>
                </h2>
              </div>
              <div className="divide-y divide-gray-100">
                {translations.map((t) => (
                  <TranslationCard key={t.id} translation={t} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Translation Card Sub-component ---

function TranslationCard({ translation }: { translation: VideoTranslation }) {
  const [showScript, setShowScript] = useState(false);

  const langInfo = LANGUAGES.find((l) => l.value === translation.language);
  const flag = langInfo?.flag ?? "";
  const label = langInfo?.label ?? translation.language;

  return (
    <div className="p-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">{flag}</span>
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </div>
        <StatusBadge status={translation.status} />
      </div>

      {/* Video player */}
      {translation.video_url && (
        <video
          src={translation.video_url}
          controls
          className="w-full rounded-lg bg-black mb-3"
          preload="metadata"
        />
      )}

      {/* Generating state */}
      {translation.status === "generating" && (
        <div className="flex items-center gap-2 text-sm text-amber-600 mb-3">
          <Loader2 className="w-4 h-4 animate-spin" />
          Generating video...
        </div>
      )}

      {/* Translating state */}
      {translation.status === "translating" && (
        <div className="flex items-center gap-2 text-sm text-amber-600 mb-3">
          <Loader2 className="w-4 h-4 animate-spin" />
          Translating script...
        </div>
      )}

      {/* Error display */}
      {translation.error_message && (
        <div className="bg-red-50 rounded-md px-3 py-2 mb-3">
          <p className="text-xs text-red-600">{translation.error_message}</p>
        </div>
      )}

      {/* Collapsible translated script */}
      {translation.translated_script && (
        <div>
          <button
            onClick={() => setShowScript(!showScript)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            {showScript ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            Translated script
          </button>
          {showScript && (
            <pre className="mt-2 text-xs text-gray-600 whitespace-pre-wrap font-mono leading-relaxed bg-gray-50 rounded-md p-3">
              {translation.translated_script}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
