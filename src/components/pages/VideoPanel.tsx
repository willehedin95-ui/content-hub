"use client";

import { useState, useRef, useEffect, RefObject } from "react";
import {
  ArrowLeft,
  Loader2,
  Upload,
  Video,
} from "lucide-react";

interface ClickedVideo {
  src: string;
  index: number;
  width: number;
  height: number;
}

interface Props {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  translationId: string;
  clickedVideo: ClickedVideo;
  onClickedVideoClear: () => void;
  onVideoReplaced: () => void;
}

export default function VideoPanel({
  iframeRef,
  translationId,
  clickedVideo,
  onClickedVideoClear,
  onVideoReplaced,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Highlight clicked video in iframe
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;

    const prev = doc.querySelector("[data-cc-media-highlight]");
    if (prev) {
      (prev as HTMLElement).style.outline = "";
      prev.removeAttribute("data-cc-media-highlight");
    }

    if (clickedVideo) {
      const videos = doc.querySelectorAll("video");
      const video = videos[clickedVideo.index];
      if (video) {
        video.style.outline = "3px solid #818cf8";
        video.setAttribute("data-cc-media-highlight", "true");
        video.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [clickedVideo, iframeRef]);

  function handleBack() {
    // Remove highlight
    const doc = iframeRef.current?.contentDocument;
    if (doc) {
      const highlighted = doc.querySelector("[data-cc-media-highlight]");
      if (highlighted) {
        (highlighted as HTMLElement).style.outline = "";
        highlighted.removeAttribute("data-cc-media-highlight");
      }
    }
    onClickedVideoClear();
    setError("");
  }

  /** Swap a video src in the iframe */
  function swapVideoInIframe(videoIndex: number, newUrl: string) {
    const doc = iframeRef.current?.contentDocument;
    if (doc) {
      const videos = doc.querySelectorAll("video");
      const video = videos[videoIndex];
      if (video) {
        // Set src directly on video element
        video.src = newUrl;
        // Also update any <source> children
        const source = video.querySelector("source");
        if (source) {
          source.src = newUrl;
        }
        video.load(); // Reload video with new source
        video.style.outline = "";
        video.removeAttribute("data-cc-media-highlight");
        // Remove placeholder attribute if it was an empty video
        video.removeAttribute("data-cc-video-placeholder");
        video.style.minHeight = "";
        video.style.background = "";
      }
    }
    onVideoReplaced();
  }

  /** Upload video file */
  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !clickedVideo) return;
    e.target.value = "";

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("translationId", translationId);

      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const { imageUrl } = await res.json();
      swapVideoInIframe(clickedVideo.index, imageUrl);
      onClickedVideoClear();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  /** Use a URL directly */
  const [urlInput, setUrlInput] = useState("");

  function handleUseUrl() {
    if (!clickedVideo || !urlInput.trim()) return;
    swapVideoInIframe(clickedVideo.index, urlInput.trim());
    onClickedVideoClear();
  }

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleBack}
          className="text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Edit Video
        </p>
      </div>

      {/* Video preview */}
      {clickedVideo.src ? (
        <div className="rounded-lg overflow-hidden border border-gray-200">
          <video
            src={clickedVideo.src}
            className="w-full h-auto"
            controls
            muted
            playsInline
          />
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center py-8">
          <div className="text-center text-gray-400">
            <Video className="w-8 h-8 mx-auto mb-1" />
            <p className="text-xs">No video source yet</p>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Upload video */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.gif,.webp"
        onChange={handleFileSelected}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="w-full flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium py-2.5 rounded-lg transition-colors"
      >
        {uploading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...
          </>
        ) : (
          <>
            <Upload className="w-3.5 h-3.5" /> Upload Video / GIF
          </>
        )}
      </button>

      {/* URL input */}
      <div className="space-y-1.5">
        <label className="text-xs text-gray-400 uppercase tracking-wider">
          Or paste video URL
        </label>
        <div className="flex gap-1.5">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://..."
            className="flex-1 bg-white border border-gray-300 text-gray-900 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleUseUrl}
            disabled={!urlInput.trim()}
            className="px-3 py-2 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-xs font-medium rounded-lg border border-gray-200 transition-colors"
          >
            Use
          </button>
        </div>
      </div>

      <p className="text-[10px] text-gray-400">
        Supported: MP4, WebM, MOV, GIF, animated WebP (max 200 MB)
      </p>
    </div>
  );
}
