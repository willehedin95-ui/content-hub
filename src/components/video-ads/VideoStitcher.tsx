"use client";

import { useState, useRef, useCallback } from "react";
import {
  Download,
  Film,
  Loader2,
  Upload,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

interface VideoStitcherProps {
  shots: Array<{
    shot_number: number;
    video_url: string;
    video_duration_seconds: number;
  }>;
  jobId: string;
  product: string;
}

type StitchStatus =
  | "idle"
  | "loading_ffmpeg"
  | "downloading"
  | "stitching"
  | "done"
  | "error"
  | "saving"
  | "saved";

export default function VideoStitcher({
  shots,
  jobId,
  product,
}: VideoStitcherProps) {
  const [status, setStatus] = useState<StitchStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState({ done: 0, total: 0 });
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const stitchedBlobRef = useRef<Blob | null>(null);

  const allShotsReady = shots.length > 0 && shots.every((s) => s.video_url);
  const sortedShots = [...shots].sort((a, b) => a.shot_number - b.shot_number);

  const handleStitch = useCallback(async () => {
    if (!allShotsReady) return;

    setStatus("loading_ffmpeg");
    setError(null);
    setBlobUrl(null);
    stitchedBlobRef.current = null;
    setSavedUrl(null);

    try {
      // Dynamic import to avoid SSR issues with ffmpeg.wasm
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { fetchFile } = await import("@ffmpeg/util");

      const ffmpeg = new FFmpeg();

      // Single-threaded mode — works without COOP/COEP headers
      await ffmpeg.load();

      // Download all shot videos
      setStatus("downloading");
      setDownloadProgress({ done: 0, total: sortedShots.length });

      for (let i = 0; i < sortedShots.length; i++) {
        const shot = sortedShots[i];
        const data = await fetchFile(shot.video_url);
        await ffmpeg.writeFile(`shot-${shot.shot_number}.mp4`, data);
        setDownloadProgress({ done: i + 1, total: sortedShots.length });
      }

      // Create concat file
      setStatus("stitching");
      const concatContent = sortedShots
        .map((s) => `file 'shot-${s.shot_number}.mp4'`)
        .join("\n");
      await ffmpeg.writeFile(
        "list.txt",
        new TextEncoder().encode(concatContent)
      );

      // Run ffmpeg concat
      await ffmpeg.exec([
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "list.txt",
        "-c",
        "copy",
        "output.mp4",
      ]);

      // Read output — readFile returns FileData (Uint8Array | string).
      // Copy into a fresh ArrayBuffer to satisfy strict TS Uint8Array<ArrayBufferLike> typing.
      const outputData = (await ffmpeg.readFile("output.mp4")) as Uint8Array;
      const freshBuffer = new ArrayBuffer(outputData.byteLength);
      new Uint8Array(freshBuffer).set(outputData);
      const blob = new Blob([freshBuffer], { type: "video/mp4" });
      stitchedBlobRef.current = blob;

      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      setStatus("done");

      // Clean up ffmpeg instance
      ffmpeg.terminate();
    } catch (err) {
      console.error("Stitch error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to stitch video clips"
      );
      setStatus("error");
    }
  }, [allShotsReady, sortedShots]);

  const handleDownload = useCallback(() => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `${product}-${jobId.slice(0, 8)}-stitched.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [blobUrl, product, jobId]);

  const handleSave = useCallback(async () => {
    if (!stitchedBlobRef.current) return;
    setStatus("saving");
    try {
      const formData = new FormData();
      formData.append("file", stitchedBlobRef.current, "stitched.mp4");
      const res = await fetch(`/api/video-jobs/${jobId}/upload-stitched`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(data.error || "Upload failed");
      }
      const data = await res.json();
      setSavedUrl(data.video_url);
      setStatus("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStatus("error");
    }
  }, [jobId]);

  const totalDuration = sortedShots.reduce(
    (sum, s) => sum + s.video_duration_seconds,
    0
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Film className="w-5 h-5 text-indigo-600" />
        <h3 className="text-sm font-semibold text-gray-800">Stitch Video</h3>
        {allShotsReady && (
          <span className="text-xs text-gray-500">
            {sortedShots.length} clips &middot; {totalDuration.toFixed(1)}s total
          </span>
        )}
      </div>

      {/* Progress / Status */}
      {status === "loading_ffmpeg" && (
        <div className="flex items-center gap-3 py-4">
          <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
          <p className="text-sm text-gray-600">Loading video editor...</p>
        </div>
      )}

      {status === "downloading" && (
        <div className="py-4">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
            <p className="text-sm text-gray-600">
              Downloading clips... ({downloadProgress.done}/{downloadProgress.total})
            </p>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${
                  downloadProgress.total > 0
                    ? (downloadProgress.done / downloadProgress.total) * 100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {status === "stitching" && (
        <div className="flex items-center gap-3 py-4">
          <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
          <p className="text-sm text-gray-600">Stitching clips together...</p>
        </div>
      )}

      {status === "saving" && (
        <div className="flex items-center gap-3 py-4">
          <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
          <p className="text-sm text-gray-600">Uploading to storage...</p>
        </div>
      )}

      {status === "error" && (
        <div className="flex items-center gap-3 py-4 px-3 rounded-lg bg-red-50 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
        </div>
      )}

      {status === "saved" && (
        <div className="flex items-center gap-3 py-3 px-3 rounded-lg bg-green-50 mb-4">
          <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
          <p className="text-sm text-green-700">Saved to storage!</p>
        </div>
      )}

      {/* Video preview */}
      {blobUrl && (status === "done" || status === "saved" || status === "saving") && (
        <div className="mb-4">
          <video
            src={blobUrl}
            controls
            className="w-full rounded-lg bg-black max-h-[480px]"
            preload="metadata"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        {(status === "idle" || status === "error") && (
          <button
            onClick={handleStitch}
            disabled={!allShotsReady}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              allShotsReady
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            {status === "error" ? (
              <RefreshCw className="w-4 h-4" />
            ) : (
              <Film className="w-4 h-4" />
            )}
            {status === "error" ? "Retry" : "Stitch & Download"}
          </button>
        )}

        {(status === "done" || status === "saved") && (
          <>
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
            {status !== "saved" && (
              <button
                onClick={handleSave}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Save to Storage
              </button>
            )}
          </>
        )}

        {!allShotsReady && status === "idle" && (
          <p className="text-xs text-gray-400">
            All clips must be generated before stitching
          </p>
        )}
      </div>
    </div>
  );
}
