"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Download, ArrowRight, AlertCircle, CheckCircle2, RefreshCw, Video, Link as LinkIcon, Upload } from "lucide-react";
import { AdaptPanel } from "@/components/quiz-builder/AdaptPanel";

type Market = "se" | "dk" | "no";

type SwipeResult = {
  quizId: string;
  method: "clarflow" | "heyflow" | "nextjs" | "generic" | "llm";
  importedSteps: number;
  warnings: string[];
};

type Phase =
  | { kind: "idle" }
  | { kind: "progress"; step: number; mode: "url" | "video" }
  | { kind: "success"; result: SwipeResult }
  | { kind: "error"; message: string };

const URL_PROGRESS_STEPS = [
  "Fetching page / launching browser...",
  "Detecting quiz platform...",
  "Extracting steps + re-hosting images...",
  "Creating quiz draft...",
];

const VIDEO_PROGRESS_STEPS = [
  "Uploading video to storage...",
  "Sending video to Gemini...",
  "Gemini is watching the recording...",
  "Building quiz from extracted steps...",
];

const MARKET_OPTIONS: { value: Market; label: string }[] = [
  { value: "se", label: "SE - Swedish" },
  { value: "dk", label: "DK - Danish" },
  { value: "no", label: "NO - Norwegian" },
];

export function SwipeClient() {
  const router = useRouter();
  const [mode, setMode] = useState<"url" | "video">("url");
  const [url, setUrl] = useState("");
  const [market, setMarket] = useState<Market>("se");
  const [name, setName] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const currentSteps = mode === "video" ? VIDEO_PROGRESS_STEPS : URL_PROGRESS_STEPS;

  async function startUrlImport() {
    if (!url.trim()) return;
    setPhase({ kind: "progress", step: 0, mode: "url" });
    const progressTimer = setInterval(() => {
      setPhase((prev) => {
        if (prev.kind !== "progress") return prev;
        const next = prev.step + 1;
        if (next >= URL_PROGRESS_STEPS.length - 1) {
          clearInterval(progressTimer);
          return { kind: "progress", step: URL_PROGRESS_STEPS.length - 1, mode: "url" };
        }
        return { kind: "progress", step: next, mode: "url" };
      });
    }, 3000);

    try {
      const res = await fetch("/api/quiz/swipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), market, name: name.trim() || undefined }),
      });
      clearInterval(progressTimer);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
        setPhase({ kind: "error", message: body.error ?? `HTTP ${res.status}` });
        return;
      }
      const result = (await res.json()) as SwipeResult;
      setPhase({ kind: "success", result });
    } catch (err) {
      clearInterval(progressTimer);
      setPhase({ kind: "error", message: err instanceof Error ? err.message : "Unexpected error" });
    }
  }

  async function startVideoImport() {
    if (!videoFile) return;
    setPhase({ kind: "progress", step: 0, mode: "video" });
    const progressTimer = setInterval(() => {
      setPhase((prev) => {
        if (prev.kind !== "progress") return prev;
        const next = prev.step + 1;
        if (next >= VIDEO_PROGRESS_STEPS.length - 1) {
          clearInterval(progressTimer);
          return { kind: "progress", step: VIDEO_PROGRESS_STEPS.length - 1, mode: "video" };
        }
        return { kind: "progress", step: next, mode: "video" };
      });
    }, 15000);

    try {
      const fd = new FormData();
      fd.append("video", videoFile);
      fd.append("market", market);
      if (name.trim()) fd.append("name", name.trim());

      const res = await fetch("/api/quiz/swipe-video", { method: "POST", body: fd });
      clearInterval(progressTimer);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
        setPhase({ kind: "error", message: body.error ?? `HTTP ${res.status}` });
        return;
      }
      const result = (await res.json()) as SwipeResult;
      setPhase({ kind: "success", result });
    } catch (err) {
      clearInterval(progressTimer);
      setPhase({ kind: "error", message: err instanceof Error ? err.message : "Unexpected error" });
    }
  }

  function reset() {
    setUrl("");
    setName("");
    setVideoFile(null);
    setPhase({ kind: "idle" });
  }

  function handleFilePicked(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      setPhase({ kind: "error", message: `Not a video file: ${f.type}` });
      return;
    }
    const MAX = 50 * 1024 * 1024;
    if (f.size > MAX) {
      setPhase({ kind: "error", message: `Video too large (${Math.round(f.size / 1024 / 1024)} MB). Max 50 MB.` });
      return;
    }
    setVideoFile(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    handleFilePicked(e.dataTransfer.files[0]);
  }

  const isLoading = phase.kind === "progress";

  return (
    <div className="max-w-xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Download className="w-5 h-5 text-indigo-600" />
        <h1 className="text-2xl font-semibold text-gray-900">Import Quiz</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6 -mt-4">
        Swipe a competitor quiz either from a URL or from a screen-recording of the onboarding.
      </p>

      {(phase.kind === "idle" || phase.kind === "error") && (
        <>
          {/* Mode tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-6 w-fit">
            <button
              onClick={() => setMode("url")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === "url" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
              disabled={isLoading}
            >
              <LinkIcon className="w-4 h-4" />
              URL
            </button>
            <button
              onClick={() => setMode("video")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === "video" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
              disabled={isLoading}
            >
              <Video className="w-4 h-4" />
              Video
            </button>
          </div>

          <div className="space-y-4">
            {mode === "url" ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quiz URL</label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.clarflow.com/my-quiz"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400"
                  disabled={isLoading}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Works with Clarflow, Heyflow, Next.js funnels, step-carousel SPAs, and more.
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Screen recording of the onboarding
                </label>
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragOver
                      ? "border-indigo-500 bg-indigo-50"
                      : videoFile
                      ? "border-green-400 bg-green-50"
                      : "border-gray-300 hover:border-gray-400"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    className="hidden"
                    onChange={(e) => handleFilePicked(e.target.files?.[0])}
                  />
                  {videoFile ? (
                    <>
                      <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-900">{videoFile.name}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {(videoFile.size / 1024 / 1024).toFixed(1)} MB - click to replace
                      </p>
                    </>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-700">
                        Click to select or drop a screen recording
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        mp4, mov, or webm - up to 50 MB
                      </p>
                    </>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Tip: on iOS use Control Center &rarr; Screen Record. Walk through the full
                  onboarding, tapping options calmly so every screen is visible.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Market</label>
                <select
                  value={market}
                  onChange={(e) => setMarket(e.target.value as Market)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  disabled={isLoading}
                >
                  {MARKET_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My imported quiz"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400"
                  disabled={isLoading}
                />
              </div>
            </div>

            {phase.kind === "error" && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Import failed</p>
                  <p className="mt-0.5 text-red-600">{phase.message}</p>
                </div>
              </div>
            )}

            <button
              onClick={mode === "url" ? startUrlImport : startVideoImport}
              disabled={isLoading || (mode === "url" ? !url.trim() : !videoFile)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {mode === "url" ? <Download className="w-4 h-4" /> : <Video className="w-4 h-4" />}
              Start Import
            </button>
          </div>
        </>
      )}

      {/* Progress */}
      {phase.kind === "progress" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            {currentSteps.map((label, idx) => {
              const isActive = idx === phase.step;
              const isDone = idx < phase.step;
              return (
                <div
                  key={label}
                  className={`flex items-center gap-3 text-sm px-4 py-3 rounded-lg border transition-all ${
                    isActive
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700 font-medium"
                      : isDone
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-gray-200 bg-white text-gray-400"
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  ) : isActive ? (
                    <RefreshCw className="w-4 h-4 text-indigo-500 flex-shrink-0 animate-spin" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
                  )}
                  {label}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-400">
            {phase.mode === "video"
              ? "Video extraction usually takes 2-4 minutes depending on length."
              : "This can take up to 2-3 minutes for complex quizzes."}
          </p>
        </div>
      )}

      {/* Success */}
      {phase.kind === "success" && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
            <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-green-800">Import successful</p>
              <p className="text-sm text-green-700 mt-0.5">
                Imported{" "}
                <span className="font-semibold">{phase.result.importedSteps} steps</span> using{" "}
                <span className="font-semibold capitalize">{phase.result.method}</span> method.
                {phase.result.warnings.length > 0 && <> Some warnings - see below.</>}
              </p>
            </div>
          </div>

          {phase.result.warnings.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs font-semibold text-amber-700 mb-1.5 uppercase tracking-wide">
                Warnings
              </p>
              <ul className="space-y-1">
                {phase.result.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                    <span className="mt-0.5 text-amber-500">-</span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => router.push(`/quizzes/${phase.result.quizId}/edit`)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Open in editor
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={reset}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Import another
            </button>
          </div>

          <AdaptPanel
            quizId={phase.result.quizId}
            targetMarket={market}
            onCancel={() => router.push(`/quizzes/${phase.result.quizId}/edit`)}
          />
        </div>
      )}
    </div>
  );
}
