"use client";

import { useState } from "react";
import { Loader2, Image, Film, AlertTriangle, Clock, RefreshCw, Pencil, X, Check } from "lucide-react";

interface ShotCardProps {
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
}

function shotStatusColor(imageStatus: string, videoStatus: string): string {
  if (videoStatus === "completed") return "bg-green-100 text-green-700";
  if (videoStatus === "generating" || imageStatus === "generating")
    return "bg-amber-100 text-amber-700";
  if (videoStatus === "failed" || imageStatus === "failed")
    return "bg-red-100 text-red-600";
  if (imageStatus === "completed") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-600";
}

function shotStatusText(imageStatus: string, videoStatus: string): string {
  if (videoStatus === "completed") return "Done";
  if (videoStatus === "generating") return "Generating clip";
  if (videoStatus === "failed") return "Failed";
  if (imageStatus === "completed") return "Image ready";
  if (imageStatus === "generating") return "Generating image";
  if (imageStatus === "failed") return "Failed";
  return "Pending";
}

export default function ShotCard({ shot, jobId, onRegenerate, language }: ShotCardProps) {
  const statusText = shotStatusText(shot.image_status, shot.video_status);
  const statusColorClass = shotStatusColor(shot.image_status, shot.video_status);
  const [regenerating, setRegenerating] = useState<"image" | "video" | null>(null);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<"veo" | "image" | null>(null);
  const [editVeoPrompt, setEditVeoPrompt] = useState(shot.veo_prompt || "");
  const [editImagePrompt, setEditImagePrompt] = useState(shot.shot_description || "");

  async function handleRegenerate(type: "image" | "video", model?: string, promptOverrides?: { veo_prompt?: string; image_prompt?: string }) {
    setRegenerating(type);
    setRegenError(null);
    try {
      const res = await fetch(`/api/video-jobs/${jobId}/pipeline/regenerate-shot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shot_id: shot.id, type, model, language, ...promptOverrides }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to regenerate ${type}`);
      }
      setEditingPrompt(null);
      onRegenerate?.();
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : "Regeneration failed");
    } finally {
      setRegenerating(null);
    }
  }

  const canRegenerateImage = shot.image_status === "completed" || shot.image_status === "failed";
  const canRegenerateVideo = shot.video_status === "completed" || shot.video_status === "failed";
  const isGenerating = shot.image_status === "generating" || shot.video_status === "generating";

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700">
            Shot {shot.shot_number}
          </h3>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 text-xs font-medium text-gray-500">
            <Clock className="w-3 h-3" />
            {shot.video_duration_seconds}s
          </span>
        </div>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColorClass}`}
        >
          {statusText}
        </span>
      </div>

      {/* Image preview */}
      <div className="relative group">
        {shot.image_url ? (
          <div className="aspect-[9/16] bg-gray-100 relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shot.image_url}
              alt={`Shot ${shot.shot_number}`}
              className="w-full h-full object-cover"
            />
            {/* Overlay buttons */}
            {canRegenerateImage && !isGenerating && (
              <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => {
                    setEditImagePrompt(shot.shot_description);
                    setEditingPrompt("image");
                  }}
                  className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg"
                  title="Edit image prompt"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleRegenerate("image")}
                  disabled={regenerating !== null}
                  className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg disabled:opacity-50"
                  title="Regenerate image"
                >
                  {regenerating === "image" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </button>
              </div>
            )}
          </div>
        ) : shot.image_status === "generating" ? (
          <div className="aspect-[9/16] bg-gray-50 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            <p className="text-sm text-gray-500">Generating image...</p>
          </div>
        ) : shot.image_status === "failed" ? (
          <div className="aspect-[9/16] bg-red-50 flex flex-col items-center justify-center gap-3 p-4">
            <AlertTriangle className="w-8 h-8 text-red-400" />
            <p className="text-sm text-red-600 text-center">
              {shot.error_message || "Image generation failed"}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setEditImagePrompt(shot.shot_description);
                  setEditingPrompt("image");
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors"
              >
                <Pencil className="w-3 h-3" />
                Edit & Retry
              </button>
              <button
                onClick={() => handleRegenerate("image")}
                disabled={regenerating !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {regenerating === "image" ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                Retry
              </button>
            </div>
          </div>
        ) : (
          <div className="aspect-[9/16] bg-gray-50 flex flex-col items-center justify-center gap-3">
            <Image className="w-8 h-8 text-gray-300" />
            <p className="text-sm text-gray-400">Pending</p>
          </div>
        )}
      </div>

      {/* Edit image prompt panel */}
      {editingPrompt === "image" && (
        <div className="border-t border-gray-200 p-3 bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600">Image Prompt</span>
            <button onClick={() => setEditingPrompt(null)} className="p-1 hover:bg-gray-200 rounded">
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
          <textarea
            value={editImagePrompt}
            onChange={(e) => setEditImagePrompt(e.target.value)}
            className="w-full text-xs text-gray-700 bg-white border border-gray-200 rounded-lg p-2.5 resize-y min-h-[120px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            rows={6}
          />
          <div className="flex items-center justify-end gap-2 mt-2">
            <button
              onClick={() => setEditingPrompt(null)}
              className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => handleRegenerate("image", undefined, { image_prompt: editImagePrompt })}
              disabled={regenerating !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {regenerating === "image" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
              Save & Regenerate
            </button>
          </div>
        </div>
      )}

      {/* Edit VEO prompt panel — show when editing or in pending state */}
      {editingPrompt === "veo" && (
        <div className="border-t border-gray-200 p-3 bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600">VEO Prompt</span>
            <button onClick={() => setEditingPrompt(null)} className="p-1 hover:bg-gray-200 rounded">
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
          <textarea
            value={editVeoPrompt}
            onChange={(e) => setEditVeoPrompt(e.target.value)}
            className="w-full text-xs text-gray-700 bg-white border border-gray-200 rounded-lg p-2.5 resize-y min-h-[120px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            rows={6}
          />
          <div className="flex items-center justify-end gap-2 mt-2">
            <button
              onClick={() => setEditingPrompt(null)}
              className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            {canRegenerateVideo && (
              <>
                <button
                  onClick={() => handleRegenerate("video", "veo3_fast", { veo_prompt: editVeoPrompt })}
                  disabled={regenerating !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {regenerating === "video" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Save & Fast
                </button>
                <button
                  onClick={() => handleRegenerate("video", "veo3", { veo_prompt: editVeoPrompt })}
                  disabled={regenerating !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {regenerating === "video" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Save & Quality
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Video preview */}
      {shot.video_status !== "pending" && (
        <div className="border-t border-gray-100">
          {shot.video_url ? (
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs font-medium text-gray-500">
                    Video clip
                  </span>
                </div>
                {/* Regenerate video buttons */}
                {canRegenerateVideo && !isGenerating && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditVeoPrompt(shot.veo_prompt || "");
                        setEditingPrompt("veo");
                      }}
                      className="flex items-center gap-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-[10px] font-medium rounded transition-colors"
                      title="Edit VEO prompt"
                    >
                      <Pencil className="w-3 h-3" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleRegenerate("video", "veo3_fast")}
                      disabled={regenerating !== null}
                      className="flex items-center gap-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-[10px] font-medium rounded transition-colors disabled:opacity-50"
                      title="Regenerate with VEO3 Fast"
                    >
                      {regenerating === "video" ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      Fast
                    </button>
                    <button
                      onClick={() => handleRegenerate("video", "veo3")}
                      disabled={regenerating !== null}
                      className="flex items-center gap-1 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-[10px] font-medium rounded transition-colors disabled:opacity-50"
                      title="Regenerate with VEO3 Quality"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Quality
                    </button>
                  </div>
                )}
              </div>
              <video
                src={shot.video_url}
                controls
                className="w-full rounded-lg bg-black"
                preload="metadata"
              />
            </div>
          ) : shot.video_status === "generating" ? (
            <div className="p-4 flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
              <p className="text-sm text-gray-500">Generating clip...</p>
            </div>
          ) : shot.video_status === "failed" ? (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <p className="text-sm text-red-600">
                  {shot.error_message || "Clip generation failed"}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    setEditVeoPrompt(shot.veo_prompt || "");
                    setEditingPrompt("veo");
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  Edit & Retry
                </button>
                <button
                  onClick={() => handleRegenerate("video", "veo3_fast")}
                  disabled={regenerating !== null}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {regenerating === "video" ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  Retry Fast
                </button>
                <button
                  onClick={() => handleRegenerate("video", "veo3")}
                  disabled={regenerating !== null}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry Quality
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Error from regeneration/save */}
      {regenError && (
        <div className="px-4 py-2 border-t border-red-100 bg-red-50">
          <p className="text-xs text-red-600">{regenError}</p>
        </div>
      )}

      {/* Shot description */}
      <div className="px-4 py-3 border-t border-gray-100">
        <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
          {shot.shot_description}
        </p>
      </div>
    </div>
  );
}
