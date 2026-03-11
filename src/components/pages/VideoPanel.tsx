"use client";

import { useState, useRef, useEffect, RefObject } from "react";
import {
  ArrowLeft,
  Loader2,
  Upload,
  Video,
  ImagePlus,
  X,
  Check,
} from "lucide-react";
import type { Asset } from "@/types";

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
  const [pickingFromAssets, setPickingFromAssets] = useState(false);
  const [assetBankData, setAssetBankData] = useState<Asset[]>([]);
  const assetsFetchedRef = useRef(false);

  // Fetch asset bank data
  useEffect(() => {
    if (assetsFetchedRef.current) return;
    assetsFetchedRef.current = true;
    fetch("/api/assets")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Asset[]) => setAssetBankData(data))
      .catch(() => {});
  }, []);

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

  /** Replace a <video> element with an <img> in the iframe */
  function replaceVideoWithImage(videoIndex: number, imageUrl: string) {
    const doc = iframeRef.current?.contentDocument;
    if (doc) {
      const videos = doc.querySelectorAll("video");
      const video = videos[videoIndex];
      if (video) {
        const img = doc.createElement("img");
        img.src = imageUrl;
        img.style.width = video.style.width || "100%";
        img.style.maxWidth = video.style.maxWidth || "";
        img.style.display = "block";
        video.parentElement?.replaceChild(img, video);
      }
    }
    onVideoReplaced();
  }

  function isImageFile(file: File): boolean {
    return file.type.startsWith("image/") && !file.type.includes("gif") && !file.type.includes("webp");
  }

  function isImageUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return /\.(jpe?g|png|svg|bmp|tiff?)(\?|$)/.test(lower);
  }

  /** Upload video or image file */
  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !clickedVideo) return;
    e.target.value = "";

    const uploadingImage = isImageFile(file);
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
      if (uploadingImage) {
        replaceVideoWithImage(clickedVideo.index, imageUrl);
      } else {
        swapVideoInIframe(clickedVideo.index, imageUrl);
      }
      onClickedVideoClear();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  /** Pick from asset bank */
  function handleAssetPick(url: string) {
    if (!clickedVideo) return;
    if (isImageUrl(url)) {
      replaceVideoWithImage(clickedVideo.index, url);
    } else {
      swapVideoInIframe(clickedVideo.index, url);
    }
    setPickingFromAssets(false);
    onClickedVideoClear();
  }

  /** Use a URL directly */
  const [urlInput, setUrlInput] = useState("");

  function handleUseUrl() {
    if (!clickedVideo || !urlInput.trim()) return;
    const url = urlInput.trim();
    if (isImageUrl(url)) {
      replaceVideoWithImage(clickedVideo.index, url);
    } else {
      swapVideoInIframe(clickedVideo.index, url);
    }
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
        accept="video/mp4,video/webm,video/quicktime,image/*,.mp4,.webm,.mov,.gif,.webp,.jpg,.jpeg,.png"
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
            <Upload className="w-3.5 h-3.5" /> Upload File
          </>
        )}
      </button>

      {/* URL input */}
      <div className="space-y-1.5">
        <label className="text-xs text-gray-400 uppercase tracking-wider">
          Or paste URL
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

      {/* Asset Bank button */}
      {assetBankData.length > 0 && (
        <button
          onClick={() => setPickingFromAssets(true)}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-1.5 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-xs font-medium py-2.5 rounded-lg border border-gray-200 transition-colors"
        >
          <ImagePlus className="w-3.5 h-3.5" />
          Asset Bank
        </button>
      )}

      <p className="text-[10px] text-gray-400">
        Images (JPG, PNG, WebP) replace the video with a static image.
        Videos: MP4, WebM, MOV, GIF (max 200 MB).
      </p>

      {/* Asset bank picker modal */}
      {pickingFromAssets && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPickingFromAssets(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg max-h-[80vh] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">
                Pick from Asset Bank
              </h4>
              <button
                onClick={() => setPickingFromAssets(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="grid grid-cols-3 gap-2">
                {assetBankData.map((asset) => (
                  <button
                    key={asset.id}
                    onClick={() => handleAssetPick(asset.url)}
                    className="group relative rounded-lg overflow-hidden border border-gray-200 hover:border-indigo-400 transition-colors"
                  >
                    <div className="aspect-square bg-gray-50 flex items-center justify-center p-2">
                      {asset.url.match(/\.(mp4|webm|mov)(\?|$)/i) ? (
                        <video
                          src={asset.url}
                          className="max-w-full max-h-full object-contain"
                          muted
                          playsInline
                        />
                      ) : (
                        <img
                          src={asset.url}
                          alt={asset.alt_text || asset.name}
                          className="max-w-full max-h-full object-contain"
                        />
                      )}
                    </div>
                    <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/10 transition-colors flex items-center justify-center">
                      <Check className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 drop-shadow-lg transition-opacity" />
                    </div>
                    <p className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1.5 py-0.5 truncate">
                      {asset.name}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
