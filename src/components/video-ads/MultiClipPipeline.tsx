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
  Repeat,
  Play,
  Download,
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
  veo_prompt: string | null;
  video_duration_seconds: number;
  error_message: string | null;
}

type OverallStatus =
  | "pending"
  | "generating_images"
  | "reviewing"
  | "generating_clips"
  | "generating_storyboard"
  | "completed"
  | "failed";

type VideoGenMethod = "storyboard" | "veo3" | "kling";
type StoryboardDuration = "10" | "15" | "25";

interface PipelineStatusResponse {
  pipeline_mode: string;
  video_generation_method: string;
  character_ref_status: string;
  character_ref_urls: string[];
  reuse_first_frame: boolean;
  storyboard_status: string;
  storyboard_url: string | null;
  storyboard_duration: string;
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

const PIPELINE_STEPS_VEO: PipelineStep[] = [
  { key: "char_refs", label: "Char Refs", icon: Users, optional: true },
  { key: "shot_images", label: "Shot Images", icon: Image },
  { key: "review", label: "Review", icon: Eye },
  { key: "generate_clips", label: "Generate Clips", icon: Film },
  { key: "stitch", label: "Stitch", icon: Scissors },
];

const PIPELINE_STEPS_STORYBOARD: PipelineStep[] = [
  { key: "char_refs", label: "Char Refs", icon: Users, optional: true },
  { key: "shot_images", label: "Shot Images", icon: Image },
  { key: "review", label: "Review", icon: Eye },
  { key: "generate_video", label: "Generate Video", icon: Film },
];

// --- Props ---

interface MultiClipPipelineProps {
  job: VideoJob;
  onJobUpdate: () => Promise<void>;
  /** When set, clip generation uses translated VEO prompts for this language */
  language?: string;
}

// --- Helpers ---

function getCurrentStepIndex(
  overallStatus: OverallStatus,
  characterRefStatus: string,
  isStoryboard: boolean
): number {
  const steps = isStoryboard ? PIPELINE_STEPS_STORYBOARD : PIPELINE_STEPS_VEO;
  switch (overallStatus) {
    case "pending":
      if (characterRefStatus === "pending" || characterRefStatus === "generating")
        return 0;
      return 1;
    case "generating_images":
      return 1;
    case "reviewing":
      return 2;
    case "generating_clips":
    case "generating_storyboard":
      return 3;
    case "completed":
      return steps.length - 1;
    case "failed":
      return -1;
    default:
      return 0;
  }
}

function isStepCompleted(
  stepIndex: number,
  currentIndex: number,
  overallStatus: OverallStatus,
  characterRefStatus: string,
  totalSteps: number
): boolean {
  if (overallStatus === "completed") return stepIndex <= totalSteps - 2;
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
  language: languageProp,
}: MultiClipPipelineProps) {
  // Always resolve a language — video_clips are per-language, so both
  // generate-clips and status endpoints need it. Default to first target language.
  const language = languageProp || (job.target_languages as string[] | undefined)?.[0];
  const [pipelineStatus, setPipelineStatus] =
    useState<PipelineStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<VideoGenMethod>(
    (job.video_generation_method as VideoGenMethod) || "storyboard"
  );
  const [selectedModel, setSelectedModel] = useState<"veo3" | "veo3_fast">(
    "veo3_fast"
  );
  const [storyboardDuration, setStoryboardDuration] = useState<StoryboardDuration>(
    (job.storyboard_duration as StoryboardDuration) || "15"
  );
  const [klingMultiShots, setKlingMultiShots] = useState(
    job.format_type === "podcast_clip"
  );
  const [klingMode, setKlingMode] = useState<"std" | "pro">("std");
  const [klingUseStartFrame, setKlingUseStartFrame] = useState(true);

  // --- Fetch status ---

  const fetchStatus = useCallback(async () => {
    try {
      const langParam = language ? `?language=${language}` : "";
      const res = await fetch(`/api/video-jobs/${job.id}/pipeline/status${langParam}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to fetch pipeline status");
      }
      const data: PipelineStatusResponse = await res.json();
      setPipelineStatus(data);
      // Sync method from server if a generation has been started
      if (data.video_generation_method === "storyboard" && data.storyboard_status !== "pending") {
        setSelectedMethod("storyboard");
      } else if (data.video_generation_method === "kling" && data.storyboard_status !== "pending") {
        setSelectedMethod("kling");
      }
    } catch (e) {
      console.error("Pipeline status fetch error:", e);
    }
  }, [job.id, language]);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Polling when generating
  useEffect(() => {
    const shouldPoll =
      pipelineStatus?.overall_status === "generating_images" ||
      pipelineStatus?.overall_status === "generating_clips" ||
      pipelineStatus?.overall_status === "generating_storyboard";
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
          body: JSON.stringify({ model: selectedModel, language }),
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

  async function handleGenerateStoryboard() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/video-jobs/${job.id}/pipeline/generate-storyboard`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ duration: storyboardDuration }),
        }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to generate storyboard video");
      }
      setSelectedMethod("storyboard");
      await fetchStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateKling() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/video-jobs/${job.id}/pipeline/generate-kling`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            multi_shots: klingMultiShots,
            mode: klingMode,
            use_start_frame: klingUseStartFrame,
            language,
          }),
        }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to generate Kling video");
      }
      setSelectedMethod("kling");
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
              language,
            }),
          }
        );
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Failed to retry clips");
        }
      }

      // Retry storyboard/kling if it failed
      if (pipelineStatus?.storyboard_status === "failed") {
        if (selectedMethod === "kling") {
          await handleGenerateKling();
          return;
        }
        if (selectedMethod === "storyboard") {
          await handleGenerateStoryboard();
          return;
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

  const isSingleVideoMethod =
    selectedMethod === "storyboard" ||
    selectedMethod === "kling" ||
    pipelineStatus?.video_generation_method === "storyboard" ||
    pipelineStatus?.video_generation_method === "kling";
  const isStoryboard = isSingleVideoMethod;
  const storyboardUrl = pipelineStatus?.storyboard_url ?? job.storyboard_url;
  const storyboardStatus = pipelineStatus?.storyboard_status ?? job.storyboard_status;

  const pipelineSteps = isStoryboard ? PIPELINE_STEPS_STORYBOARD : PIPELINE_STEPS_VEO;
  const currentStepIndex = getCurrentStepIndex(overallStatus, characterRefStatus, isStoryboard);

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
  const visibleSteps = pipelineSteps.filter(
    (step) => step.key !== "char_refs" || showCharRefStep
  );

  return (
    <div className="space-y-6">
      {/* Pipeline Progress Stepper */}
      <div className="bg-white rounded-lg border border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Pipeline Progress
          </h3>
          {(pipelineStatus?.reuse_first_frame ?? job.reuse_first_frame) && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-medium">
              <Repeat className="w-3 h-3" />
              Reusing first frame
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {visibleSteps.map((step, idx) => {
            const stepIndex = pipelineSteps.indexOf(step);
            const isActive = stepIndex === currentStepIndex;
            const completed = isStepCompleted(
              stepIndex,
              currentStepIndex,
              overallStatus,
              characterRefStatus,
              pipelineSteps.length
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
                      overallStatus === "generating_clips" ||
                      overallStatus === "generating_storyboard") ? (
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
              <ShotCard key={shot.id} shot={shot} jobId={job.id} onRegenerate={fetchStatus} language={language} />
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
            {characterRefStatus === "pending" && hasCharacterDescription && job.format_type !== "pixar_animation" && (
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

            {(characterRefStatus === "completed" ||
              characterRefStatus === "skipped" ||
              !hasCharacterDescription ||
              job.format_type === "pixar_animation") && (
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

        {/* REVIEWING: all images done, choose generation method */}
        {overallStatus === "reviewing" && (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-500" />
              <p className="text-sm font-medium text-gray-700">
                All {imagesTotal} shot images ready. Choose a video generation method.
              </p>
            </div>

            {/* Generation method selector */}
            <div className="space-y-3">
              {/* Storyboard option */}
              <button
                onClick={() => setSelectedMethod("storyboard")}
                className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                  selectedMethod === "storyboard"
                    ? "border-purple-400 bg-purple-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Play className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-semibold text-gray-900">Sora 2 Storyboard</span>
                  <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">Recommended</span>
                </div>
                <p className="text-xs text-gray-500 ml-6">
                  One continuous video from all keyframes. Smooth transitions between shots.
                </p>
                {selectedMethod === "storyboard" && (
                  <div className="mt-3 ml-6 flex items-center gap-2">
                    <span className="text-xs text-gray-500">Duration:</span>
                    {(["10", "15", "25"] as const).map((d) => (
                      <button
                        key={d}
                        onClick={(e) => { e.stopPropagation(); setStoryboardDuration(d); }}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                          storyboardDuration === d
                            ? "bg-purple-600 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {d}s
                      </button>
                    ))}
                  </div>
                )}
              </button>

              {/* Kling 3.0 option */}
              <button
                onClick={() => setSelectedMethod("kling")}
                className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                  selectedMethod === "kling"
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Film className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-semibold text-gray-900">Kling 3.0</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">With Sound</span>
                </div>
                <p className="text-xs text-gray-500 ml-6">
                  Text-to-video with AI speech from script. Optional start frame from keyframe.
                </p>
                {selectedMethod === "kling" && (
                  <div className="mt-3 ml-6 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={klingMultiShots}
                        onChange={(e) => { e.stopPropagation(); setKlingMultiShots(e.target.checked); }}
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-xs text-gray-600">Multi-shots</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={klingUseStartFrame}
                        onChange={(e) => { e.stopPropagation(); setKlingUseStartFrame(e.target.checked); }}
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-xs text-gray-600">Use first keyframe as start frame</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Mode:</span>
                      {(["std", "pro"] as const).map((m) => (
                        <button
                          key={m}
                          onClick={(e) => { e.stopPropagation(); setKlingMode(m); }}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                            klingMode === m
                              ? "bg-emerald-600 text-white"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          {m.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </button>

              {/* Veo 3.1 option */}
              <button
                onClick={() => setSelectedMethod("veo3")}
                className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                  selectedMethod === "veo3"
                    ? "border-indigo-400 bg-indigo-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Film className="w-4 h-4 text-indigo-600" />
                  <span className="text-sm font-semibold text-gray-900">Veo 3.1 (Per-Shot)</span>
                </div>
                <p className="text-xs text-gray-500 ml-6">
                  Individual clips per shot, stitched together. More control per shot.
                </p>
                {selectedMethod === "veo3" && (
                  <div className="mt-3 ml-6 flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedModel("veo3_fast"); }}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        selectedModel === "veo3_fast"
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      <Zap className="w-3 h-3" />
                      Fast ~$0.40/shot
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedModel("veo3"); }}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        selectedModel === "veo3"
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      <Film className="w-3 h-3" />
                      Quality ~$2.00/shot
                    </button>
                  </div>
                )}
              </button>
            </div>

            <button
              onClick={
                selectedMethod === "storyboard"
                  ? handleGenerateStoryboard
                  : selectedMethod === "kling"
                    ? handleGenerateKling
                    : handleGenerateClips
              }
              disabled={loading}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Film className="w-4 h-4" />
              )}
              Generate Video{selectedMethod === "storyboard" ? ` (${storyboardDuration}s)` : selectedMethod === "kling" ? " (15s)" : ""}
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

        {/* GENERATING STORYBOARD: progress */}
        {overallStatus === "generating_storyboard" && (
          <div className="flex items-center gap-3">
            <Loader2 className={`w-5 h-5 animate-spin ${pipelineStatus?.video_generation_method === "kling" ? "text-emerald-500" : "text-purple-500"}`} />
            <div>
              <p className="text-sm font-medium text-gray-700">
                {pipelineStatus?.video_generation_method === "kling"
                  ? "Generating Kling 3.0 video (15s with sound)..."
                  : `Generating storyboard video (${pipelineStatus?.storyboard_duration || storyboardDuration}s)...`}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {pipelineStatus?.video_generation_method === "kling"
                  ? "Kling 3.0 is generating video with AI speech from your script"
                  : "Sora 2 Pro Storyboard is creating a continuous video from your keyframes"}
              </p>
            </div>
          </div>
        )}

        {/* COMPLETED — storyboard: show video player */}
        {overallStatus === "completed" && isStoryboard && storyboardUrl && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-500" />
              <p className="text-sm font-medium text-green-700">
                {pipelineStatus?.video_generation_method === "kling"
                  ? "Kling 3.0 video ready! (15s)"
                  : `Storyboard video ready! (${storyboardStatus === "completed" ? `${pipelineStatus?.storyboard_duration || storyboardDuration}s` : ""})`}
              </p>
            </div>
            <div className="rounded-lg overflow-hidden border border-gray-200 bg-black">
              <video
                src={storyboardUrl}
                controls
                className="w-full max-h-[500px]"
                preload="metadata"
              />
            </div>
            <a
              href={storyboardUrl}
              download={`${job.concept_name.replace(/\s+/g, "-").toLowerCase()}-${pipelineStatus?.video_generation_method === "kling" ? "kling" : "storyboard"}.mp4`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download Video
            </a>
          </div>
        )}

        {/* COMPLETED — Veo 3.1: show stitcher */}
        {overallStatus === "completed" && !isStoryboard && (
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
              language={language}
            />
          </div>
        )}

        {/* FAILED */}
        {overallStatus === "failed" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <p className="text-sm font-medium text-red-700">
                {storyboardStatus === "failed"
                  ? pipelineStatus?.video_generation_method === "kling"
                    ? "Kling 3.0 generation failed."
                    : "Storyboard generation failed."
                  : "Some shots failed. Check the error details above."}
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
