"use client";

import { useState } from "react";
import { Loader2, Pencil, RefreshCw, Check, X, AlertTriangle } from "lucide-react";
import { extractDialogue, replaceDialogue } from "@/lib/dialogue-utils";

interface ShotRowProps {
  shot: {
    id: string;
    shot_number: number;
    shot_description: string;
    image_status: string;
    image_url: string | null;
    video_status: string;
    video_url: string | null;
    veo_prompt: string | null;
    video_duration_seconds: number;
    error_message: string | null;
  };
  jobId: string;
  onRegenerate?: () => void;
  language?: string;
  /** Translated VEO prompt for secondary languages */
  translatedVeoPrompt?: string | null;
}

function statusBadge(
  imageStatus: string,
  videoStatus: string
): { text: string; className: string } {
  if (videoStatus === "completed")
    return { text: "Done", className: "bg-green-100 text-green-700" };
  if (videoStatus === "generating")
    return { text: "Generating", className: "bg-amber-100 text-amber-700" };
  if (videoStatus === "failed")
    return { text: "Failed", className: "bg-red-100 text-red-600" };
  if (imageStatus === "completed")
    return { text: "Image ready", className: "bg-blue-100 text-blue-700" };
  if (imageStatus === "generating")
    return { text: "Image gen", className: "bg-amber-100 text-amber-700" };
  if (imageStatus === "failed")
    return { text: "Failed", className: "bg-red-100 text-red-600" };
  return { text: "Pending", className: "bg-gray-100 text-gray-500" };
}

export default function ShotRow({
  shot,
  jobId,
  onRegenerate,
  language,
  translatedVeoPrompt,
}: ShotRowProps) {
  const [editing, setEditing] = useState(false);
  const [dialogueDraft, setDialogueDraft] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  // Use translated prompt when available, otherwise original
  const effectiveVeoPrompt = translatedVeoPrompt || shot.veo_prompt || "";
  const dialogue = extractDialogue(effectiveVeoPrompt);
  const badge = statusBadge(shot.image_status, shot.video_status);

  function handleStartEdit() {
    setDialogueDraft(dialogue || "");
    setEditing(true);
    setRegenError(null);
  }

  async function handleSaveAndRegenerate() {
    setRegenerating(true);
    setRegenError(null);
    try {
      // Build updated VEO prompt with new dialogue
      const updatedVeoPrompt = replaceDialogue(effectiveVeoPrompt, dialogueDraft);

      const res = await fetch(`/api/video-jobs/${jobId}/pipeline/regenerate-shot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shot_id: shot.id,
          type: "video",
          model: "veo3_fast",
          veo_prompt: updatedVeoPrompt,
          language,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to regenerate");
      }
      setEditing(false);
      onRegenerate?.();
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : "Regeneration failed");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    setRegenError(null);
    try {
      const res = await fetch(`/api/video-jobs/${jobId}/pipeline/regenerate-shot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shot_id: shot.id,
          type: "video",
          model: "veo3_fast",
          language,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to regenerate");
      }
      onRegenerate?.();
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : "Regeneration failed");
    } finally {
      setRegenerating(false);
    }
  }

  const canRegenerate =
    shot.video_status === "completed" || shot.video_status === "failed";
  const isGenerating =
    shot.video_status === "generating" || shot.image_status === "generating";

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex">
        {/* Left: Video/Image preview */}
        <div className="w-[180px] shrink-0 bg-gray-100 relative">
          {shot.video_url ? (
            <video
              src={shot.video_url}
              controls
              className="w-full h-full object-cover"
              preload="metadata"
              style={{ aspectRatio: "9/16" }}
            />
          ) : shot.image_url ? (
            <div className="relative" style={{ aspectRatio: "9/16" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shot.image_url}
                alt={`Shot ${shot.shot_number}`}
                className="w-full h-full object-cover"
              />
              {isGenerating && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                </div>
              )}
            </div>
          ) : (
            <div
              className="w-full flex items-center justify-center bg-gray-50"
              style={{ aspectRatio: "9/16" }}
            >
              {isGenerating ? (
                <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
              ) : (
                <span className="text-xs text-gray-400">Pending</span>
              )}
            </div>
          )}
        </div>

        {/* Right: Dialogue + controls */}
        <div className="flex-1 min-w-0 p-4 flex flex-col">
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-gray-700">
                Shot {shot.shot_number}
              </h4>
              <span className="text-xs text-gray-400">
                {shot.video_duration_seconds}s
              </span>
            </div>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${badge.className}`}
            >
              {badge.text}
            </span>
          </div>

          {/* Dialogue content */}
          <div className="flex-1 min-h-0">
            {editing ? (
              <textarea
                value={dialogueDraft}
                onChange={(e) => setDialogueDraft(e.target.value)}
                className="w-full h-full min-h-[100px] text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                autoFocus
              />
            ) : dialogue ? (
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                &ldquo;{dialogue}&rdquo;
              </p>
            ) : (
              <p className="text-xs text-gray-400 italic leading-relaxed">
                {shot.shot_description}
              </p>
            )}
          </div>

          {/* Error message */}
          {(shot.error_message || regenError) && (
            <div className="flex items-start gap-1.5 mt-2 text-xs text-red-600">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{regenError || shot.error_message}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            {editing ? (
              <>
                <button
                  onClick={() => setEditing(false)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-3 h-3" />
                  Cancel
                </button>
                <button
                  onClick={handleSaveAndRegenerate}
                  disabled={regenerating}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {regenerating ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Check className="w-3 h-3" />
                  )}
                  Save & Regenerate
                </button>
              </>
            ) : (
              <>
                {dialogue && (
                  <button
                    onClick={handleStartEdit}
                    disabled={isGenerating}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                )}
                {canRegenerate && !isGenerating && (
                  <button
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {regenerating ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    Regenerate
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
