"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Film,
  Globe,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { Language, VideoJob, VideoTranslation, TranslatedShot } from "@/types";
import { VIDEO_FORMATS, HOOK_TYPES, SCRIPT_STRUCTURES } from "@/lib/constants";
import MultiClipPipeline from "./MultiClipPipeline";

const LANG_META: Record<string, { label: string; flag: string }> = {
  sv: { label: "SV", flag: "\u{1F1F8}\u{1F1EA}" },
  no: { label: "NO", flag: "\u{1F1F3}\u{1F1F4}" },
  da: { label: "DA", flag: "\u{1F1E9}\u{1F1F0}" },
};

const ALL_LANGUAGES: Language[] = ["sv", "no", "da"];

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
  const [showPrompt, setShowPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingScript, setEditingScript] = useState(false);
  const [scriptDraft, setScriptDraft] = useState(initialJob.script || "");
  const [savingScript, setSavingScript] = useState(false);

  // Language tabs
  const originalLang = job.target_languages?.[0] || "sv";
  const [activeLang, setActiveLang] = useState<string>(originalLang);
  const [translating, setTranslating] = useState(false);
  const [showTranslateMenu, setShowTranslateMenu] = useState(false);

  // Get translations map
  const translationsMap = new Map<string, VideoTranslation>();
  for (const t of job.video_translations || []) {
    translationsMap.set(t.language, t);
  }
  const coveredLanguages = [originalLang, ...Array.from(translationsMap.keys())];
  const uncoveredLanguages = ALL_LANGUAGES.filter((l) => !coveredLanguages.includes(l));
  const activeTranslation = activeLang !== originalLang ? translationsMap.get(activeLang) : null;
  const isViewingTranslation = activeLang !== originalLang && !!activeTranslation;

  // Translate handler
  async function handleTranslate(targetLang: string) {
    setTranslating(true);
    setError(null);
    setShowTranslateMenu(false);
    try {
      const res = await fetch(`/api/video-jobs/${job.id}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: targetLang }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Translation failed");
      }
      await refreshJob();
      setActiveLang(targetLang);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Translation failed");
    } finally {
      setTranslating(false);
    }
  }

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

  // Save edited script — also updates VEO prompt dialogues per shot
  async function handleSaveScript() {
    setSavingScript(true);
    setError(null);
    try {
      const res = await fetch(`/api/video-jobs/${job.id}/save-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: scriptDraft }),
      });
      if (!res.ok) throw new Error("Failed to save script");
      const data = await res.json();
      setJob((prev) => ({ ...prev, script: scriptDraft }));
      setEditingScript(false);
      // Refresh job to pick up updated VEO prompts
      if (data.updated_shots?.length > 0) {
        refreshJob();
      }
    } catch {
      setError("Failed to save script");
    } finally {
      setSavingScript(false);
    }
  }

  // Find source video (for legacy single-clip jobs)
  const sourceVideo =
    job.source_videos?.find((sv) => sv.status === "completed") ??
    job.source_videos?.[0] ??
    null;

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
              {job.video_shots && job.video_shots.length > 0 && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-orange-50 text-xs font-medium text-orange-700">
                  {job.video_shots.length} shots
                </span>
              )}
              <span className="text-xs text-gray-400">
                {job.duration_seconds}s
              </span>
            </div>
          </div>

          {/* Language tabs + Translate button */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              {/* Original language tab */}
              <button
                onClick={() => setActiveLang(originalLang)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeLang === originalLang
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {LANG_META[originalLang]?.flag} {LANG_META[originalLang]?.label || originalLang.toUpperCase()}
              </button>
              {/* Translated language tabs */}
              {Array.from(translationsMap.entries()).map(([lang]) => (
                <button
                  key={lang}
                  onClick={() => setActiveLang(lang)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    activeLang === lang
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {LANG_META[lang]?.flag} {LANG_META[lang]?.label || lang.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Translate to... button */}
            {uncoveredLanguages.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowTranslateMenu(!showTranslateMenu)}
                  disabled={translating}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg border border-indigo-200 transition-colors disabled:opacity-50"
                >
                  {translating ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Globe className="w-3 h-3" />
                  )}
                  {translating ? "Translating..." : "Translate to..."}
                </button>
                {showTranslateMenu && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 min-w-[140px]">
                    {uncoveredLanguages.map((lang) => (
                      <button
                        key={lang}
                        onClick={() => handleTranslate(lang)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <span>{LANG_META[lang]?.flag}</span>
                        <span>
                          {lang === "sv" ? "Swedish" : lang === "no" ? "Norwegian" : "Danish"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Error banner */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Script panel — editable (original) or read-only (translation) */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">
                Script
                {isViewingTranslation && (
                  <span className="ml-2 text-xs font-normal text-indigo-500">
                    ({LANG_META[activeLang]?.flag} translated)
                  </span>
                )}
              </h2>
              {!isViewingTranslation && !editingScript ? (
                <button
                  onClick={() => {
                    setScriptDraft(job.script || "");
                    setEditingScript(true);
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              ) : !isViewingTranslation ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setEditingScript(false)}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveScript}
                    disabled={savingScript}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded transition-colors disabled:opacity-50"
                  >
                    {savingScript ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Save
                  </button>
                </div>
              ) : null}
            </div>
            <div className="p-4">
              {!isViewingTranslation && editingScript ? (
                <textarea
                  value={scriptDraft}
                  onChange={(e) => setScriptDraft(e.target.value)}
                  className="w-full text-sm text-gray-800 font-mono leading-relaxed bg-gray-50 border border-gray-200 rounded-lg p-3 resize-y min-h-[200px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  rows={12}
                />
              ) : (
                (() => {
                  const displayScript = isViewingTranslation
                    ? activeTranslation?.translated_script
                    : job.script;
                  return displayScript ? (
                    <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">
                      {displayScript}
                    </pre>
                  ) : (
                    <p className="text-sm text-gray-400 italic">
                      {isViewingTranslation ? "No translated script" : "No script written yet"}
                    </p>
                  );
                })()
              )}
            </div>
          </div>

          {/* VEO/Sora Prompt panel (collapsible) */}
          {(() => {
            const translatedShots: TranslatedShot[] = isViewingTranslation
              ? (activeTranslation?.translated_shots as TranslatedShot[] | null) || []
              : [];

            if (job.format_type === "pixar_animation" && job.video_shots && job.video_shots.length > 0) {
              return (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setShowPrompt(!showPrompt)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <h2 className="text-sm font-semibold text-gray-700">
                      VEO Prompts
                      {isViewingTranslation && (
                        <span className="ml-2 text-xs font-normal text-indigo-500">
                          ({LANG_META[activeLang]?.flag} translated)
                        </span>
                      )}
                    </h2>
                    {showPrompt ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  {showPrompt && (
                    <div className="p-4 border-t border-gray-100 space-y-3">
                      {job.video_shots.map((shot, i) => {
                        const tShot = translatedShots.find(
                          (ts) => ts.shot_number === shot.shot_number
                        );
                        const displayPrompt = isViewingTranslation && tShot
                          ? tShot.translated_veo_prompt
                          : shot.veo_prompt;
                        return (
                          <div key={shot.id || i}>
                            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Shot {shot.shot_number}</p>
                            <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed bg-gray-50 rounded-lg p-2">
                              {displayPrompt || "\u2014"}
                            </pre>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            if (job.sora_prompt || (isViewingTranslation && activeTranslation?.translated_sora_prompt)) {
              const displayPrompt = isViewingTranslation
                ? activeTranslation?.translated_sora_prompt || job.sora_prompt
                : job.sora_prompt;
              return (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setShowPrompt(!showPrompt)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <h2 className="text-sm font-semibold text-gray-700">
                      VEO Prompt
                      {isViewingTranslation && (
                        <span className="ml-2 text-xs font-normal text-indigo-500">
                          ({LANG_META[activeLang]?.flag} translated)
                        </span>
                      )}
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
                        {displayPrompt}
                      </pre>
                    </div>
                  )}
                </div>
              );
            }
            return null;
          })()}

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

        {/* === RIGHT COLUMN: Video Pipeline === */}
        <div className="space-y-6">
          {job.video_shots && job.video_shots.length > 0 ? (
            <MultiClipPipeline job={job} onJobUpdate={async () => { await refreshJob(); }} />
          ) : (
            /* Legacy single-clip jobs (backward compat) */
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
                ) : (
                  <div className="aspect-[9/16] max-h-[400px] bg-gray-100 rounded-lg flex flex-col items-center justify-center gap-3">
                    <Play className="w-8 h-8 text-gray-300" />
                    <p className="text-sm text-gray-400">
                      Legacy single-clip job — no pipeline available
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
