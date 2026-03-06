"use client";

import { Loader2, Image, Film, AlertTriangle, Clock } from "lucide-react";

interface ShotCardProps {
  shot: {
    id: string;
    shot_number: number;
    shot_description: string;
    image_status: string;
    image_url: string | null;
    video_status: string;
    video_url: string | null;
    video_duration_seconds: number;
    error_message: string | null;
  };
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

export default function ShotCard({ shot }: ShotCardProps) {
  const statusText = shotStatusText(shot.image_status, shot.video_status);
  const statusColorClass = shotStatusColor(shot.image_status, shot.video_status);

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
      <div className="relative">
        {shot.image_url ? (
          <div className="aspect-[9/16] bg-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shot.image_url}
              alt={`Shot ${shot.shot_number}`}
              className="w-full h-full object-cover"
            />
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
          </div>
        ) : (
          <div className="aspect-[9/16] bg-gray-50 flex flex-col items-center justify-center gap-3">
            <Image className="w-8 h-8 text-gray-300" />
            <p className="text-sm text-gray-400">Pending</p>
          </div>
        )}
      </div>

      {/* Video preview (only if video is not pending) */}
      {shot.video_status !== "pending" && (
        <div className="border-t border-gray-100">
          {shot.video_url ? (
            <div className="p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Film className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs font-medium text-gray-500">
                  Video clip
                </span>
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
            <div className="p-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <p className="text-sm text-red-600">
                {shot.error_message || "Clip generation failed"}
              </p>
            </div>
          ) : null}
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
