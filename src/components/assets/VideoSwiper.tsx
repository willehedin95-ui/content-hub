"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload,
  Film,
  Loader2,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  Video,
  Download,
  XCircle,
  Image,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  extractFrames,
  formatDuration,
  type ExtractedFrame,
  type ExtractionProgress,
} from "@/lib/video-frame-extractor";
import { PRODUCTS, type Product, type Asset } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = "upload" | "extracting" | "analyzing" | "keyframing" | "generating" | "done";

interface TaskInfo {
  scene_number: number;
  description: string;
  task_id: string;
  prompt: string;
}

interface TaskStatus {
  task_id: string;
  status: "processing" | "completed" | "failed";
  video_url: string | null;
  error: string | null;
}

interface Analysis {
  video_type: string;
  duration_estimate: string;
  description: string;
}

interface Props {
  onAssetCreated?: (asset: Asset) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VideoSwiper({ onAssetCreated }: Props) {
  const [phase, setPhase] = useState<Phase>("upload");
  const [error, setError] = useState<string | null>(null);

  // Upload
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [product, setProduct] = useState<Product>("happysleep");
  const [notes, setNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extraction
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgress | null>(null);
  const [frames, setFrames] = useState<ExtractedFrame[]>([]);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

  // Analysis + Generation
  const [statusMessage, setStatusMessage] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>({});
  const [claudeCost, setClaudeCost] = useState<number>(0);
  const [keyframeUrls, setKeyframeUrls] = useState<Record<number, string>>({});
  const [keyframeCount, setKeyframeCount] = useState({ done: 0, total: 0 });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll Kling task statuses
  useEffect(() => {
    if (phase !== "generating" || tasks.length === 0) return;

    const taskIds = tasks.map((t) => t.task_id).join(",");

    async function poll() {
      try {
        const res = await fetch(
          `/api/video-swiper/status?tasks=${taskIds}&product=${product}`
        );
        if (!res.ok) return;
        const data = await res.json();

        const newStatuses: Record<string, TaskStatus> = {};
        for (const t of data.tasks) {
          newStatuses[t.task_id] = t;
        }
        setTaskStatuses(newStatuses);

        if (data.overall === "completed" || data.overall === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setPhase("done");
        }
      } catch {
        // Silently retry on next interval
      }
    }

    poll();
    pollRef.current = setInterval(poll, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, tasks, product]);

  // File selection
  const handleFileSelect = useCallback((file: File) => {
    setError(null);
    const validTypes = ["video/mp4", "video/quicktime", "video/x-m4v"];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp4|mov|m4v)$/i)) {
      setError("Please upload an MP4 or MOV file.");
      return;
    }
    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);
    const tempVideo = document.createElement("video");
    tempVideo.preload = "metadata";
    tempVideo.src = url;
    tempVideo.onloadedmetadata = () => {
      setVideoDuration(tempVideo.duration);
      tempVideo.remove();
    };
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  // Start the full pipeline
  const handleAnalyze = useCallback(async () => {
    if (!videoFile) return;
    setError(null);
    setPhase("extracting");
    setFrames([]);
    setTasks([]);
    setTaskStatuses({});
    setAnalysis(null);

    try {
      // Step 1: Extract frames
      const extractedFrames = await extractFrames(videoFile, {
        onProgress: setExtractionProgress,
      });
      setFrames(extractedFrames);

      // Step 2: Upload frames
      setUploadProgress({ current: 0, total: extractedFrames.length });
      const frameUrls: string[] = [];

      for (let i = 0; i < extractedFrames.length; i++) {
        const frame = extractedFrames[i];
        const formData = new FormData();
        formData.append("file", new File([frame.blob], `frame-${i}.jpg`, { type: "image/jpeg" }));
        const uploadRes = await fetch("/api/upload-temp", { method: "POST", body: formData });
        if (!uploadRes.ok) throw new Error(`Failed to upload frame ${i + 1}`);
        const { url } = await uploadRes.json();
        frameUrls.push(url);
        setUploadProgress({ current: i + 1, total: extractedFrames.length });
      }

      // Step 3: Analyze + kick off Kling
      setPhase("analyzing");
      setStatusMessage("Analyzing video with AI...");

      const res = await fetch("/api/video-swiper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frame_urls: frameUrls,
          frame_timestamps: extractedFrames.map((f) => f.timestamp),
          video_duration: videoDuration,
          product,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `API error: ${res.status}`);
      }

      // Read NDJSON stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);

          if (event.step === "error") throw new Error(event.message);
          if (event.message) setStatusMessage(event.message);
          if (event.analysis) setAnalysis(event.analysis as Analysis);

          if (event.step === "generating_keyframes") {
            setPhase("keyframing");
          }

          if (event.step === "analyzed" && event.prompt_count) {
            setKeyframeCount((prev) => ({ ...prev, total: event.prompt_count }));
          }

          if (event.step === "keyframe_completed" && event.keyframe_url) {
            setKeyframeUrls((prev) => ({ ...prev, [event.scene_number]: event.keyframe_url }));
            setKeyframeCount((prev) => ({ ...prev, done: prev.done + 1 }));
          }

          if (event.step === "generating_started") {
            setTasks(event.tasks as TaskInfo[]);
            setClaudeCost(event.claude_cost || 0);
            setPhase("generating");
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setPhase("upload");
    }
  }, [videoFile, videoDuration, product, notes]);

  // Reset
  const handleReset = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (pollRef.current) clearInterval(pollRef.current);
    setPhase("upload");
    setVideoFile(null);
    setVideoUrl(null);
    setVideoDuration(0);
    setNotes("");
    setError(null);
    setFrames([]);
    setTasks([]);
    setTaskStatuses({});
    setAnalysis(null);
    setExtractionProgress(null);
    setUploadProgress({ current: 0, total: 0 });
    setStatusMessage("");
    setClaudeCost(0);
    setKeyframeUrls({});
    setKeyframeCount({ done: 0, total: 0 });
  }, [videoUrl]);

  // Helpers
  const completedVideos = tasks
    .map((t) => ({ ...t, ...(taskStatuses[t.task_id] || {}) }))
    .filter((t) => t.status === "completed" && t.video_url);

  const anyFailed = tasks.some((t) => taskStatuses[t.task_id]?.status === "failed");
  const allCompleted = tasks.length > 0 && tasks.every((t) => taskStatuses[t.task_id]?.status === "completed");

  return (
    <div className="space-y-6">
      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Error</p>
            <p className="text-sm text-red-600 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* UPLOAD                                                             */}
      {/* ================================================================== */}
      {phase === "upload" && (
        <div className="space-y-6">
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors",
              videoFile
                ? "border-indigo-300 bg-indigo-50/50"
                : "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50"
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,.mp4,.mov,.m4v"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
            {videoFile ? (
              <div className="space-y-3">
                <Film className="w-12 h-12 text-indigo-500 mx-auto" />
                <p className="text-sm font-medium text-gray-900">{videoFile.name}</p>
                <p className="text-xs text-gray-500">
                  {(videoFile.size / 1024 / 1024).toFixed(1)} MB
                  {videoDuration > 0 && ` · ${formatDuration(videoDuration)}`}
                </p>
                <p className="text-xs text-indigo-600">Click to change</p>
              </div>
            ) : (
              <div className="space-y-3">
                <Upload className="w-12 h-12 text-gray-400 mx-auto" />
                <p className="text-sm font-medium text-gray-700">Drop a competitor video or click to browse</p>
                <p className="text-xs text-gray-400">MP4 or MOV, max 60 seconds</p>
              </div>
            )}
          </div>

          {videoUrl && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Original video</p>
              <video src={videoUrl} controls className="w-full max-w-lg mx-auto rounded-lg" style={{ maxHeight: 300 }} />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Recreate with</label>
            <div className="flex gap-2">
              {PRODUCTS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setProduct(p.value)}
                  className={cn(
                    "px-4 py-2 rounded-lg border text-sm font-medium transition-colors",
                    product === p.value
                      ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                      : "bg-white border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. 'Use a man instead of a woman' or 'Make the background darker'"
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 focus:outline-none"
            />
          </div>

          <button
            onClick={handleAnalyze}
            disabled={!videoFile}
            className={cn(
              "w-full py-3 rounded-lg text-sm font-semibold transition-colors",
              videoFile
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            )}
          >
            Analyze & Generate Video
          </button>
        </div>
      )}

      {/* ================================================================== */}
      {/* EXTRACTING FRAMES                                                  */}
      {/* ================================================================== */}
      {phase === "extracting" && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
            <span className="text-sm font-medium text-gray-900">
              {uploadProgress.current > 0
                ? `Uploading frames... ${uploadProgress.current}/${uploadProgress.total}`
                : extractionProgress
                  ? `Extracting frames... ${extractionProgress.current}/${extractionProgress.total}`
                  : "Loading video..."}
            </span>
          </div>
          {extractionProgress && (
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${uploadProgress.current > 0
                    ? (uploadProgress.current / uploadProgress.total) * 100
                    : (extractionProgress.current / extractionProgress.total) * 100
                  }%`,
                }}
              />
            </div>
          )}
          {frames.length > 0 && (
            <div className="grid grid-cols-5 sm:grid-cols-8 lg:grid-cols-10 gap-2">
              {frames.map((frame, i) => (
                <div key={i} className="relative">
                  <img
                    src={frame.dataUrl}
                    alt={`Frame ${i}`}
                    className="w-full aspect-video object-cover rounded border border-gray-200"
                  />
                  <span className="absolute bottom-0 right-0 bg-black/60 text-white text-[9px] px-1 rounded-tl">
                    {frame.timestamp.toFixed(1)}s
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* ANALYZING (Claude Vision)                                          */}
      {/* ================================================================== */}
      {phase === "analyzing" && (
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center">
              <Video className="w-8 h-8 text-indigo-600 animate-pulse" />
            </div>
            <p className="text-sm font-medium text-gray-900">{statusMessage}</p>
            <p className="text-xs text-gray-400">Analyzing frames and generating Kling prompts...</p>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* KEYFRAMING (Nano Banana)                                           */}
      {/* ================================================================== */}
      {phase === "keyframing" && (
        <div className="space-y-6">
          {analysis && (
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-gray-900">Video analyzed</span>
              </div>
              <p className="text-sm text-gray-600">{analysis.description}</p>
              <div className="flex gap-2 mt-2">
                <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full text-gray-600">{analysis.video_type}</span>
                <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full text-gray-600">{analysis.duration_estimate}</span>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-200 p-8">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
                <Image className="w-8 h-8 text-amber-600 animate-pulse" />
              </div>
              <p className="text-sm font-medium text-gray-900">{statusMessage}</p>
              <p className="text-xs text-gray-400">
                Generating keyframe{keyframeCount.total > 1 ? "s" : ""} with product reference image
                {keyframeCount.total > 0 && ` (${keyframeCount.done}/${keyframeCount.total})`}
              </p>
              {keyframeCount.total > 0 && (
                <div className="w-48 bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-amber-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${(keyframeCount.done / keyframeCount.total) * 100}%` }}
                  />
                </div>
              )}
              {Object.keys(keyframeUrls).length > 0 && (
                <div className="flex gap-2 mt-2">
                  {Object.entries(keyframeUrls).map(([sceneNum, url]) => (
                    <img
                      key={sceneNum}
                      src={url}
                      alt={`Keyframe Scene ${sceneNum}`}
                      className="h-20 rounded border border-gray-200 object-cover"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* GENERATING (Kling polling)                                         */}
      {/* ================================================================== */}
      {phase === "generating" && (
        <div className="space-y-6">
          {analysis && (
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-gray-900">Video analyzed</span>
                <span className="text-xs text-gray-400 ml-auto">${claudeCost.toFixed(4)}</span>
              </div>
              {Object.keys(keyframeUrls).length > 0 && (
                <div className="flex gap-2 mb-2">
                  {Object.entries(keyframeUrls).map(([sceneNum, url]) => (
                    <img
                      key={sceneNum}
                      src={url}
                      alt={`Keyframe ${sceneNum}`}
                      className="h-16 rounded border border-gray-200 object-cover"
                      title={`Keyframe for Scene ${sceneNum}`}
                    />
                  ))}
                </div>
              )}
              <p className="text-sm text-gray-600">{analysis.description}</p>
              <div className="flex gap-2 mt-2">
                <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full text-gray-600">{analysis.video_type}</span>
                <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full text-gray-600">{analysis.duration_estimate}</span>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
              <span className="text-sm font-medium text-gray-900">
                Generating {tasks.length > 1 ? `${tasks.length} clips` : "video"} with Kling 3.0...
              </span>
            </div>
            <p className="text-xs text-gray-400 mb-4">This usually takes 1-3 minutes</p>

            <div className="space-y-3">
              {tasks.map((task) => {
                const status = taskStatuses[task.task_id];
                const isComplete = status?.status === "completed";
                const isFailed = status?.status === "failed";

                return (
                  <div key={task.task_id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    {isComplete ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    ) : isFailed ? (
                      <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                    ) : (
                      <Loader2 className="w-4 h-4 text-emerald-500 animate-spin shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm text-gray-700">
                        {tasks.length > 1 && <span className="font-medium">Scene {task.scene_number}: </span>}
                        {task.description}
                      </p>
                      {isFailed && status?.error && (
                        <p className="text-xs text-red-500 mt-0.5">{status.error}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* DONE                                                               */}
      {/* ================================================================== */}
      {phase === "done" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {allCompleted ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-500" />
              )}
              <span className="text-sm font-medium text-gray-900">
                {allCompleted
                  ? `${completedVideos.length} video${completedVideos.length !== 1 ? "s" : ""} generated`
                  : `${completedVideos.length} of ${tasks.length} videos generated`}
                {anyFailed && " (some failed)"}
              </span>
            </div>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Start Over
            </button>
          </div>

          {/* Side by side: original + generated */}
          <div className={cn(
            "grid gap-4",
            completedVideos.length === 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
          )}>
            {/* Original */}
            {videoUrl && completedVideos.length === 1 && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Original (competitor)</p>
                <video src={videoUrl} controls className="w-full rounded-lg" />
              </div>
            )}

            {/* Generated video(s) */}
            {completedVideos.map((task) => {
              const status = taskStatuses[task.task_id];
              return (
                <div key={task.task_id} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {tasks.length > 1 ? `Scene ${task.scene_number} — ` : ""}
                      Generated ({product === "happysleep" ? "HappySleep" : "Hydro13"})
                    </p>
                    {status?.video_url && (
                      <a
                        href={status.video_url}
                        download={`video-swiper-scene-${task.scene_number}.mp4`}
                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </a>
                    )}
                  </div>
                  {status?.video_url && (
                    <video src={status.video_url} controls className="w-full rounded-lg" />
                  )}
                  <p className="text-xs text-gray-400 mt-2 italic">{task.description}</p>
                </div>
              );
            })}
          </div>

          {/* If multi-scene, also show original separately */}
          {videoUrl && completedVideos.length > 1 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Original (competitor)</p>
              <video src={videoUrl} controls className="w-full max-w-lg mx-auto rounded-lg" />
            </div>
          )}

          {/* Failed tasks */}
          {tasks
            .filter((t) => taskStatuses[t.task_id]?.status === "failed")
            .map((task) => (
              <div key={task.task_id} className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-medium text-red-800">Scene {task.scene_number} failed</p>
                <p className="text-xs text-red-600 mt-1">{taskStatuses[task.task_id]?.error || "Unknown error"}</p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
