"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Film,
  Play,
  RefreshCw,
} from "lucide-react";
import { VideoJob } from "@/types";
import { VIDEO_FORMATS, HOOK_TYPES, SCRIPT_STRUCTURES } from "@/lib/constants";
import MultiClipPipeline from "./MultiClipPipeline";

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
