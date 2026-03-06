"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Image,
  Film,
  Check,
  AlertTriangle,
  ArrowRight,
  Zap,
  Eye,
  Users,
  Scissors,
} from "lucide-react";
import { VideoJob } from "@/types";
import ShotCard from "./ShotCard";
import VideoStitcher from "./VideoStitcher";

// --- Types ---

interface PipelineShotStatus {
  id: string;
  shot_number: number;
  shot_description: string;
  image_status: string;
  image_url: string | null;
  video_status: string;
  video_url: string | null;
  video_duration_seconds: number;
  error_message: string | null;
}

type OverallStatus =
  | "pending"
  | "generating_images"
  | "reviewing"
  | "generating_clips"
  | "completed"
  | "failed";

interface PipelineStatusResponse {
  pipeline_mode: string;
  character_ref_status: string;
  character_ref_urls: string[];
  shots: PipelineShotStatus[];
  overall_status: OverallStatus;
}

// --- Pipeline Steps ---

interface PipelineStep {
  key: string;
  label: string;
  icon: React.ElementType;
  optional?: boolean;
}

const PIPELINE_STEPS: PipelineStep[] = [
  { key: "char_refs", label: "Char Refs", icon: Users, optional: true },
  { key: "shot_images", label: "Shot Images", icon: Image },
  { key: "review", label: "Review", icon: Eye },
  { key: "generate_clips", label: "Generate Clips", icon: Film },
  { key: "stitch", label: "Stitch", icon: Scissors },
];

// --- Props ---

interface MultiClipPipelineProps {
  job: VideoJob;
  onJobUpdate: () => Promise<void>;
}

// --- Helpers ---

function getCurrentStepIndex(
  overallStatus: OverallStatus,
  characterRefStatus: string
): number {
  switch (overallStatus) {
    case "pending":
      // If character refs are still pending (not skipped/completed), we're at step 0
      if (characterRefStatus === "pending" || characterRefStatus === "generating")
        return 0;
      return 1; // Otherwise at shot_images
    case "generating_images":
      return 1;
    case "reviewing":
      return 2;
    case "generating_clips":
      return 3;
    case "completed":
      return 4;
    case "failed":
      return -1; // No step highlighted as active
    default:
      return 0;
  }
}

function isStepCompleted(
  stepIndex: number,
  currentIndex: number,
  overallStatus: OverallStatus,
  characterRefStatus: string
): boolean {
  if (overallStatus === "completed") return stepIndex <= 3; // All but stitch for now
  if (stepIndex === 0) {
    return (
      characterRefStatus === "completed" || characterRefStatus === "skipped"
    );
  }
  return stepIndex < currentIndex;
}

export default function MultiClipPipeline({
  job,
  onJobUpdate,
}: MultiClipPipelineProps) {
  const [pipelineStatus, setPipelineStatus] =
    useState<PipelineStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<"veo3" | "veo3_fast">(
    "veo3_fast"
  );

  // --- Fetch status ---

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/video-jobs/${job.id}/pipeline/status`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to fetch pipeline status");
      }
      const data: PipelineStatusResponse = await res.json();
      setPipelineStatus(data);
    } catch (e) {
      console.error("Pipeline status fetch error:", e);
    }
  }, [job.id]);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Polling when generating
  useEffect(() => {
    const shouldPoll =
      pipelineStatus?.overall_status === "generating_images" ||
      pipelineStatus?.overall_status === "generating_clips";
    if (!shouldPoll) return;

    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [pipelineStatus?.overall_status, fetchStatus]);

  // --- Handlers ---

  async function handleGenerateCharRefs() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/video-jobs/${job.id}/pipeline/character-refs`,
        { method: "POST" }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to generate character refs");
      }
      await fetchStatus();
      await onJobUpdate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateShotImages() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/video-jobs/${job.id}/pipeline/shot-images`,
        { method: "POST" }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to generate shot images");
      }
      await fetchStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateClips() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/video-jobs/${job.id}/pipeline/generate-clips`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: selectedModel }),
        }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to generate video clips");
      }
      await fetchStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleRetryFailed() {
    setLoading(true);
    setError(null);
    try {
      // Retry: re-kick shot images for any failed shots, then re-kick clips
      const failedImageShots =
        pipelineStatus?.shots.filter((s) => s.image_status === "failed") ?? [];
      const failedVideoShots =
        pipelineStatus?.shots.filter(
          (s) => s.video_status === "failed" && s.image_status === "completed"
        ) ?? [];

      if (failedImageShots.length > 0) {
        const res = await fetch(
          `/api/video-jobs/${job.id}/pipeline/shot-images`,
          { method: "POST" }
        );
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Failed to retry shot images");
        }
      }

      if (failedVideoShots.length > 0) {
        const shotIds = failedVideoShots.map((s) => s.id);
        const res = await fetch(
          `/api/video-jobs/${job.id}/pipeline/generate-clips`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: selectedModel,
              shot_ids: shotIds,
            }),
          }
        );
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Failed to retry clips");
        }
      }

      await fetchStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setLoading(false);
    }
  }

  // --- Derived values ---

  const overallStatus: OverallStatus =
    pipelineStatus?.overall_status ?? "pending";
  const characterRefStatus = pipelineStatus?.character_ref_status ?? job.character_ref_status;
  const characterRefUrls = pipelineStatus?.character_ref_urls ?? job.character_ref_urls ?? [];
  const shots = pipelineStatus?.shots ?? [];
  const currentStepIndex = getCurrentStepIndex(overallStatus, characterRefStatus);

  const imagesCompleted = shots.filter(
    (s) => s.image_status === "completed"
  ).length;
  const imagesTotal = shots.length;
  const clipsCompleted = shots.filter(
    (s) => s.video_status === "completed"
  ).length;
  const clipsTotal = shots.filter(
    (s) => s.image_status === "completed"
  ).length;

  const hasCharacterDescription = !!job.character_description;
  const showCharRefStep =
    hasCharacterDescription && characterRefStatus !== "skipped";

  // Filter pipeline steps: skip char_refs if not applicable
  const visibleSteps = PIPELINE_STEPS.filter(
    (step) => step.key !== "char_refs" || showCharRefStep
  );

  return (
    <div className="space-y-6">
      {/* Pipeline Progress Stepper */}
      <div className="bg-white rounded-lg border border-gray-200 px-6 py-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Pipeline Progress
        </h3>
        <div className="flex items-center gap-2">
          {visibleSteps.map((step, idx) => {
            const stepIndex = PIPELINE_STEPS.indexOf(step);
            const isActive = stepIndex === currentStepIndex;
            const completed = isStepCompleted(
              stepIndex,
              currentStepIndex,
              overallStatus,
              characterRefStatus
            );
            const isFailed = overallStatus === "failed" && isActive;
            const Icon = step.icon;

            return (
              <div key={step.key} className="flex items-center gap-2">
                {idx > 0 && (
                  <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
                )}
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    isFailed
                      ? "bg-red-100 text-red-700"
                      : completed
                        ? "bg-green-100 text-green-700"
                        : isActive
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {completed ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : isFailed ? (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  ) : isActive &&
                    (overallStatus === "generating_images" ||
                      overallStatus === "generating_clips") ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                  {step.label}
                  {step.optional && (
                    <span className="text-[10px] opacity-60">(opt)</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Character Reference Images */}
      {showCharRefStep && characterRefUrls.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">
              Character Reference Images
            </h3>
            <span className="text-xs text-gray-400">
              ({characterRefUrls.length} generated)
            </span>
          </div>
          <div className="p-4 flex gap-3 flex-wrap">
            {characterRefUrls.map((url, i) => (
              <div
                key={i}
                className="w-24 h-24 rounded-lg overflow-hidden border border-gray-200 bg-gray-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Character ref ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Character ref generating state */}
      {showCharRefStep && characterRefStatus === "generating" && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-sm text-gray-500">
            Generating character reference images...
          </p>
        </div>
      )}

      {/* Shot Cards Grid */}
      {shots.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Film className="w-4 h-4 text-gray-400" />
            Shots
            <span className="text-xs text-gray-400 font-normal">
              ({shots.length} shots)
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {shots.map((shot) => (
              <ShotCard key={shot.id} shot={shot} />
            ))}
          </div>
        </div>
      )}

      {/* No shots placeholder */}
      {shots.length === 0 && pipelineStatus && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <Film className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">
            No shots created yet. Generate shot images to get started.
          </p>
        </div>
      )}

      {/* Action Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {/* PENDING: character refs or shot images */}
        {overallStatus === "pending" && (
          <div className="space-y-4">
            {/* Show char ref buttons if char refs are pending and job has character description */}
            {characterRefStatus === "pending" && hasCharacterDescription && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  This concept has a character description. You can generate
                  reference images first for visual consistency, or skip straight
                  to shot images.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleGenerateCharRefs}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Users className="w-4 h-4" />
                    )}
                    Generate Character Refs
                  </button>
                  <button
                    onClick={handleGenerateShotImages}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ArrowRight className="w-4 h-4" />
                    Skip to Shot Images
                  </button>
                </div>
              </div>
            )}

            {/* Show generate shot images if char refs are done/skipped or no character description */}
            {(characterRefStatus === "completed" ||
              characterRefStatus === "skipped" ||
              !hasCharacterDescription) && (
              <div>
                <button
                  onClick={handleGenerateShotImages}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Image className="w-4 h-4" />
                  )}
                  Generate Shot Images
                </button>
              </div>
            )}
          </div>
        )}

        {/* GENERATING IMAGES: progress */}
        {overallStatus === "generating_images" && (
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
            <div>
              <p className="text-sm font-medium text-gray-700">
                Generating images... {imagesCompleted}/{imagesTotal}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Polling for updates every 5 seconds
              </p>
            </div>
          </div>
        )}

        {/* REVIEWING: all images done, ready for clip generation */}
        {overallStatus === "reviewing" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-500" />
              <p className="text-sm font-medium text-gray-700">
                All {imagesTotal} shot images ready. Review them above, then
                generate video clips.
              </p>
            </div>

            {/* Model selector */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">
                Video Model
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedModel("veo3_fast")}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                    selectedModel === "veo3_fast"
                      ? "bg-indigo-50 border-indigo-300 ring-1 ring-indigo-200 text-indigo-900"
                      : "bg-white border-gray-200 hover:border-gray-300 text-gray-700"
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span className="font-medium">Veo 3.1 Fast</span>
                  <span className="text-[10px] text-gray-400">~$0.40</span>
                </button>
                <button
                  onClick={() => setSelectedModel("veo3")}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                    selectedModel === "veo3"
                      ? "bg-indigo-50 border-indigo-300 ring-1 ring-indigo-200 text-indigo-900"
                      : "bg-white border-gray-200 hover:border-gray-300 text-gray-700"
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  <span className="font-medium">Veo 3.1 Quality</span>
                  <span className="text-[10px] text-gray-400">~$2.00</span>
                </button>
              </div>
            </div>

            <button
              onClick={handleGenerateClips}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Film className="w-4 h-4" />
              )}
              Looks Good — Generate Videos
            </button>
          </div>
        )}

        {/* GENERATING CLIPS: progress */}
        {overallStatus === "generating_clips" && (
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
            <div>
              <p className="text-sm font-medium text-gray-700">
                Generating clips... {clipsCompleted}/{clipsTotal}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Polling for updates every 5 seconds
              </p>
            </div>
          </div>
        )}

        {/* COMPLETED */}
        {overallStatus === "completed" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-500" />
              <p className="text-sm font-medium text-green-700">
                All {clipsCompleted} clips ready!
              </p>
            </div>
            <VideoStitcher
              shots={shots
                .filter((s) => s.video_url)
                .map((s) => ({
                  shot_number: s.shot_number,
                  video_url: s.video_url!,
                  video_duration_seconds: s.video_duration_seconds,
                }))}
              jobId={job.id}
              product={job.product}
            />
          </div>
        )}

        {/* FAILED */}
        {overallStatus === "failed" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <p className="text-sm font-medium text-red-700">
                Some shots failed. Check the error details above.
              </p>
            </div>
            <button
              onClick={handleRetryFailed}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              Retry Failed
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
