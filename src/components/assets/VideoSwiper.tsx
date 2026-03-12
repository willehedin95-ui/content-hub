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
  X,
  Image,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/video-frame-extractor";
import { PRODUCTS, type Product, type Asset } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = "upload" | "uploading" | "analyzing" | "keyframing" | "generating" | "done";

type VideoModelOption = "veo3" | "veo3_fast" | "kling";
const VIDEO_MODELS: { value: VideoModelOption; label: string }[] = [
  { value: "veo3", label: "Veo 3" },
  { value: "veo3_fast", label: "Veo 3 Fast" },
  { value: "kling", label: "Kling 3.0" },
];

interface TaskInfo {
  scene_number: number;
  description: string;
  task_id: string;
  motion_prompt: string;
  keyframe_url: string | null;
  duration_seconds: number;
}

interface TaskStatus {
  task_id: string;
  status: "processing" | "completed" | "failed";
  video_url: string | null;
  error: string | null;
}

interface Analysis {
  video_type: string;
  total_duration_seconds: number;
  scene_count: number;
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
  const [videoAspectRatio, setVideoAspectRatio] = useState<string>("16:9");
  const [product, setProduct] = useState<Product | null>(null);
  const [videoModel, setVideoModel] = useState<VideoModelOption>("veo3");
  const [notes, setNotes] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Save to assets
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Upload progress
  const [uploadingVideo, setUploadingVideo] = useState(false);

  // Analysis + Generation
  const [statusMessage, setStatusMessage] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>({});
  const [claudeCost, setClaudeCost] = useState<number>(0);
  const [keyframeUrls, setKeyframeUrls] = useState<Record<number, string>>({});
  const [keyframeCount, setKeyframeCount] = useState({ done: 0, total: 0 });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (pollRef.current) clearInterval(pollRef.current);
    setPhase("upload");
    setStatusMessage("");
    setUploadingVideo(false);
  }, []);

  // Poll Kling task statuses
  useEffect(() => {
    if (phase !== "generating" || tasks.length === 0) return;

    const taskIds = tasks.map((t) => t.task_id).join(",");
    const modelType = videoModel === "kling" ? "kling" : "veo";

    async function poll() {
      try {
        const res = await fetch(
          `/api/video-swiper/status?tasks=${taskIds}&model_type=${modelType}${product ? `&product=${product}` : ""}`
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
  }, [phase, tasks, product, videoModel]);

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
    setUrlInput("");
    const tempVideo = document.createElement("video");
    tempVideo.preload = "metadata";
    tempVideo.src = url;
    tempVideo.onloadedmetadata = () => {
      setVideoDuration(tempVideo.duration);
      // Determine actual aspect ratio from video dimensions
      const w = tempVideo.videoWidth;
      const h = tempVideo.videoHeight;
      if (w && h) {
        const ratio = w / h;
        // Map to closest standard ratio
        if (ratio < 0.7) setVideoAspectRatio("9:16");
        else if (ratio < 0.9) setVideoAspectRatio("4:5");
        else if (ratio < 1.1) setVideoAspectRatio("1:1");
        else if (ratio < 1.4) setVideoAspectRatio("5:4");
        else setVideoAspectRatio("16:9");
      }
      tempVideo.remove();
    };
  }, []);

  // Fetch video via server proxy (avoids CORS) and create a File object
  const fetchVideoViaProxy = useCallback(async (url: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/proxy-fetch?url=${encodeURIComponent(url)}`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Failed to fetch video: ${res.status}`);
      }
      const blob = await res.blob();
      const ext = url.split(".").pop()?.split("?")[0]?.toLowerCase() || "mp4";
      const file = new File([blob], `imported-video.${ext}`, { type: blob.type || "video/mp4" });
      handleFileSelect(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to load video URL: ${msg}`);
    }
  }, [handleFileSelect]);

  // URL submission
  const handleUrlSubmit = useCallback(async () => {
    const url = urlInput.trim();
    if (!url) return;
    if (!url.startsWith("http")) {
      setError("Please enter a valid URL starting with http:// or https://");
      return;
    }
    await fetchVideoViaProxy(url);
  }, [urlInput, fetchVideoViaProxy]);

  const handleUrlPaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (text.startsWith("http")) {
      e.preventDefault();
      setUrlInput(text);
      setTimeout(() => fetchVideoViaProxy(text.trim()), 100);
    }
  }, [fetchVideoViaProxy]);

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
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setPhase("uploading");
    setUploadingVideo(true);
    setTasks([]);
    setTaskStatuses({});
    setAnalysis(null);
    setKeyframeUrls({});
    setKeyframeCount({ done: 0, total: 0 });

    try {
      // Step 1: Upload the video file to get a public URL
      const formData = new FormData();
      formData.append("file", videoFile);
      const uploadRes = await fetch("/api/upload-temp", { method: "POST", body: formData, signal: controller.signal });
      if (!uploadRes.ok) {
        const errBody = await uploadRes.json().catch(() => ({}));
        throw new Error(errBody.error || "Failed to upload video");
      }
      const { url: publicVideoUrl } = await uploadRes.json();
      setUploadingVideo(false);

      // Step 2: Analyze with Gemini + kick off Kling
      setPhase("analyzing");
      setStatusMessage("Analyzing video with Gemini...");

      const res = await fetch("/api/video-swiper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_url: publicVideoUrl,
          video_duration: videoDuration,
          aspect_ratio: videoAspectRatio,
          video_model: videoModel,
          ...(product && { product }),
          notes: notes.trim() || undefined,
        }),
        signal: controller.signal,
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

          if (event.step === "analyzed" && event.scene_count) {
            setKeyframeCount((prev) => ({ ...prev, total: event.scene_count }));
          }

          if (event.step === "keyframe_completed" && event.keyframe_url) {
            setKeyframeUrls((prev) => ({ ...prev, [event.scene_number]: event.keyframe_url }));
            setKeyframeCount((prev) => ({ ...prev, done: prev.done + 1 }));
          }

          if (event.step === "generating_started") {
            setTasks(event.tasks as TaskInfo[]);
            setClaudeCost(event.credits_consumed || 0);
            setPhase("generating");
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setPhase("upload");
    }
  }, [videoFile, videoDuration, videoAspectRatio, videoModel, product, notes]);

  // Save completed video to assets
  const handleSaveToAssets = useCallback(async (videoUrlToSave: string, sceneNumber: number) => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/assets/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: videoUrlToSave,
          name: `Video Swiper${product ? ` - ${product}` : ""} - Scene ${sceneNumber} - ${new Date().toLocaleDateString()}`,
          category: "lifestyle",
          product: product || undefined,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Failed to save asset");
      }

      const asset = await res.json();
      if (onAssetCreated) onAssetCreated(asset);
      setSaved(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  }, [product, onAssetCreated]);

  // Reset
  const handleReset = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (pollRef.current) clearInterval(pollRef.current);
    setPhase("upload");
    setVideoFile(null);
    setVideoUrl(null);
    setVideoDuration(0);
    setVideoAspectRatio("16:9");
    setNotes("");
    setUrlInput("");
    setError(null);
    setTasks([]);
    setTaskStatuses({});
    setAnalysis(null);
    setUploadingVideo(false);
    setStatusMessage("");
    setClaudeCost(0);
    setKeyframeUrls({});
    setKeyframeCount({ done: 0, total: 0 });
    setSaving(false);
    setSaved(false);
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
        <div className="space-y-4">
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-xl text-center cursor-pointer transition-colors",
              videoFile
                ? "border-indigo-300 bg-indigo-50/50 p-3"
                : "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50 p-8"
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
              <div className="flex items-center gap-3">
                <Film className="w-8 h-8 text-indigo-500 shrink-0" />
                <div className="text-left min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">{videoFile.name}</p>
                  <p className="text-xs text-gray-500">
                    {(videoFile.size / 1024 / 1024).toFixed(1)} MB
                    {videoDuration > 0 && ` · ${formatDuration(videoDuration)}`}
                  </p>
                </div>
                <p className="text-xs text-indigo-600 shrink-0 ml-auto">Click to change</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="w-8 h-8 text-gray-400 mx-auto" />
                <p className="text-sm font-medium text-gray-700">Drop a competitor video or click to browse</p>
                <p className="text-xs text-gray-400">MP4 or MOV, max 60 seconds</p>
              </div>
            )}
          </div>

          {!videoFile && (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 uppercase tracking-wider">or paste url</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <div className="flex gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onPaste={handleUrlPaste}
                  placeholder="https://example.com/video.mp4"
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 focus:outline-none"
                />
                <button
                  onClick={handleUrlSubmit}
                  disabled={!urlInput.trim()}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    urlInput.trim()
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  )}
                >
                  Load
                </button>
              </div>
            </>
          )}

          <div className="flex flex-wrap items-start gap-6">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Product <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <div className="flex gap-2">
                {PRODUCTS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setProduct(prev => prev === p.value ? null : p.value)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
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
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Video model
              </label>
              <div className="flex gap-2">
                {VIDEO_MODELS.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setVideoModel(m.value)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                      videoModel === m.value
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                        : "bg-white border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. 'Use a man instead of a woman' or 'Make the background darker'"
              className="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 focus:outline-none"
            />
          </div>

          <button
            onClick={handleAnalyze}
            disabled={!videoFile}
            className={cn(
              "w-full py-2.5 rounded-lg text-sm font-semibold transition-colors",
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
      {/* UPLOADING VIDEO                                                    */}
      {/* ================================================================== */}
      {phase === "uploading" && (
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center">
              <Upload className="w-8 h-8 text-indigo-600 animate-pulse" />
            </div>
            <p className="text-sm font-medium text-gray-900">
              {uploadingVideo ? "Uploading video..." : "Preparing video..."}
            </p>
            <p className="text-xs text-gray-400">This may take a moment for larger files</p>
            <button
              onClick={handleCancel}
              className="mt-2 flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-4 py-1.5 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* ANALYZING (Gemini Video)                                            */}
      {/* ================================================================== */}
      {phase === "analyzing" && (
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center">
              <Video className="w-8 h-8 text-indigo-600 animate-pulse" />
            </div>
            <p className="text-sm font-medium text-gray-900">{statusMessage}</p>
            <p className="text-xs text-gray-400">Gemini is watching the full video to extract visual details and detect scenes...</p>
            <button
              onClick={handleCancel}
              className="mt-2 flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-4 py-1.5 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
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
                <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full text-gray-600">{analysis.total_duration_seconds}s</span>
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
                Generating keyframe{keyframeCount.total > 1 ? "s" : ""}{product ? " with product reference" : ""}
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
              <button
                onClick={handleCancel}
                className="mt-2 flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-4 py-1.5 rounded-lg transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
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
                {claudeCost > 0 && <span className="text-xs text-gray-400 ml-auto">{claudeCost.toFixed(1)} credits</span>}
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
                <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full text-gray-600">{analysis.total_duration_seconds}s</span>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
              <span className="text-sm font-medium text-gray-900">
                Generating {tasks.length > 1 ? `${tasks.length} clips` : "video"} with {VIDEO_MODELS.find(m => m.value === videoModel)?.label ?? videoModel}...
              </span>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <p className="text-xs text-gray-400">This usually takes 2-4 minutes</p>
              <button
                onClick={handleCancel}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-3 py-1 rounded-lg transition-colors"
              >
                <X className="w-3 h-3" />
                Cancel
              </button>
            </div>

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
            <div className="flex items-center gap-2">
              {completedVideos.length === 1 && completedVideos[0] && taskStatuses[completedVideos[0].task_id]?.video_url && (
                <button
                  onClick={() => handleSaveToAssets(taskStatuses[completedVideos[0].task_id]!.video_url!, completedVideos[0].scene_number)}
                  disabled={saving || saved}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50",
                    saved
                      ? "bg-green-50 text-green-700"
                      : "bg-indigo-600 text-white hover:bg-indigo-700"
                  )}
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : saved ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  {saving ? "Saving..." : saved ? "Saved!" : "Save to Assets"}
                </button>
              )}
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Start Over
              </button>
            </div>
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
                      Generated {product ? `(${product === "happysleep" ? "HappySleep" : "Hydro13"})` : "(Style)"}
                    </p>
                    <div className="flex items-center gap-2">
                      {status?.video_url && (
                        <button
                          onClick={() => handleSaveToAssets(status.video_url!, task.scene_number)}
                          disabled={saving}
                          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Save to Assets
                        </button>
                      )}
                      {status?.video_url && (
                        <a
                          href={status.video_url}
                          download={`video-swiper-scene-${task.scene_number}.mp4`}
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </a>
                      )}
                    </div>
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
