"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, ExternalLink, Zap, Play, Video, Upload, X, Link2, Image as ImageIcon, Sparkles } from "lucide-react";
import {
  SWIPE_FORMAT_OPTIONS,
  type SwipeVideoFormatId,
} from "@/lib/video-format-aesthetics";

type VideoStyle = "ugc" | "pixar_animation";

interface BoardAd {
  id: number;
  external_id: string;
  title: string;
  body: string;
  landing_page: string;
  display_format: string;
  days_active: number;
  performance_score: number | null;
  performance_score_title: string | null;
  brand_name: string;
  brand_logo: string;
  image_urls: string[];
  thumbnail_url: string;
  swipe_status: string | null;
  image_job_id: string | null;
  ad_type: "image" | "video";
  video_url: string | null;
  video_thumbnail_url: string | null;
  video_duration: number | null;
  video_job_id: string | null;
}

type Filter = "all" | "unswiped" | "swiped";
type TypeFilter = "all" | "image" | "video";

export default function BoardFeed({ onBatchSwipe }: { onBatchSwipe: () => void }) {
  const router = useRouter();
  const [ads, setAds] = useState<BoardAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [swipingIds, setSwipingIds] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [boardId, setBoardId] = useState<string | null>(null);
  const [boards, setBoards] = useState<Array<{ id: number; name: string; ad_count: number }>>([]);
  const [batchSwiping, setBatchSwiping] = useState(false);
  const [painPoint, setPainPoint] = useState("auto-detect");
  const [videoStyle, setVideoStyle] = useState<VideoStyle>("ugc");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);

  // First, fetch boards to let user pick or auto-select
  useEffect(() => {
    async function fetchBoards() {
      try {
        const res = await fetch("/api/ad-spy/board");
        if (!res.ok) throw new Error("Failed to fetch boards");
        const data = await res.json();
        setBoards(data.boards ?? []);
        // Auto-select first board
        if (data.boards?.length > 0) {
          setBoardId(String(data.boards[0].id));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load boards");
      }
    }
    fetchBoards();
  }, []);

  const fetchAds = useCallback(async () => {
    if (!boardId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ad-spy/board?board_id=${boardId}&per_page=100`);
      if (!res.ok) throw new Error("Failed to fetch board ads");
      const data = await res.json();
      setAds(data.ads ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ads");
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    fetchAds();
  }, [fetchAds]);

  async function handleSwipe(ad: BoardAd) {
    setSwipingIds((prev) => new Set(prev).add(ad.id));

    const isVideo = ad.ad_type === "video";

    try {
      if (isVideo) {
        // Video swipe endpoint
        const res = await fetch("/api/ad-spy/swipe-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gethookd_ad_id: ad.id,
            video_url: ad.video_url,
            thumbnail_url: ad.video_thumbnail_url || ad.thumbnail_url,
            title: ad.title,
            body: ad.body,
            brand_name: ad.brand_name,
            video_duration: ad.video_duration,
            video_style: videoStyle,
          }),
        });
        const data = await res.json();
        if (data.ok && data.videoJobId) {
          setAds((prev) =>
            prev.map((a) =>
              a.id === ad.id ? { ...a, swipe_status: "swiped", video_job_id: data.videoJobId } : a
            )
          );
          router.push(`/video-ads/${data.videoJobId}`);
        } else {
          console.error("Video swipe failed:", data.error);
          clearSwiping(ad.id);
        }
      } else {
        // Image swipe endpoint (existing)
        const res = await fetch("/api/ad-spy/swipe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gethookd_ad_id: ad.id,
            media_urls: ad.image_urls,
            title: ad.title,
            body: ad.body,
            brand_name: ad.brand_name,
            pain_point: painPoint !== "auto-detect" ? painPoint : undefined,
          }),
        });
        const data = await res.json();
        if (data.ok && data.jobId) {
          setAds((prev) =>
            prev.map((a) =>
              a.id === ad.id ? { ...a, swipe_status: "swiped", image_job_id: data.jobId } : a
            )
          );
          router.push(`/images/${data.jobId}`);
        } else {
          console.error("Swipe failed:", data.error);
          clearSwiping(ad.id);
        }
      }
    } catch (err) {
      console.error("Swipe error:", err);
      clearSwiping(ad.id);
    }
  }

  function clearSwiping(adId: number) {
    setSwipingIds((prev) => {
      const next = new Set(prev);
      next.delete(adId);
      return next;
    });
  }

  async function handleBatchSwipe() {
    // Batch swipe only for image ads (video needs Gemini per-video)
    const unswiped = ads.filter((a) => !a.swipe_status && a.ad_type === "image");
    if (unswiped.length === 0) return;

    setBatchSwiping(true);
    try {
      const res = await fetch("/api/ad-spy/swipe-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ads: unswiped.map((a) => ({
            gethookd_ad_id: a.id,
            media_urls: a.image_urls,
            title: a.title,
            body: a.body,
            brand_name: a.brand_name,
          })),
          pain_point: painPoint !== "auto-detect" ? painPoint : undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setAds((prev) =>
          prev.map((a) =>
            !a.swipe_status && a.ad_type === "image" ? { ...a, swipe_status: "queued" } : a
          )
        );
        onBatchSwipe();
      }
    } catch (err) {
      console.error("Batch swipe error:", err);
    } finally {
      setBatchSwiping(false);
    }
  }

  const filteredAds = ads.filter((a) => {
    if (filter === "unswiped" && a.swipe_status) return false;
    if (filter === "swiped" && a.swipe_status !== "swiped") return false;
    if (typeFilter === "image" && a.ad_type !== "image") return false;
    if (typeFilter === "video" && a.ad_type !== "video") return false;
    return true;
  });

  const unswipedCount = ads.filter((a) => !a.swipe_status).length;
  const swipedCount = ads.filter((a) => a.swipe_status === "swiped").length;
  const imageCount = ads.filter((a) => a.ad_type === "image").length;
  const videoCount = ads.filter((a) => a.ad_type === "video").length;

  if (!boardId && !loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-sm">No GetHookd boards found. Save some ads to a board first.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Board selector + actions */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {boards.length > 1 && (
            <select
              value={boardId ?? ""}
              onChange={(e) => setBoardId(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
            >
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.ad_count})
                </option>
              ))}
            </select>
          )}
          {boards.length === 1 && (
            <span className="text-sm font-medium text-gray-700">{boards[0].name}</span>
          )}

          {/* Filter pills */}
          <div className="flex gap-1">
            {(["all", "unswiped", "swiped"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                  filter === f
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {f === "all" ? `All (${ads.length})` : f === "unswiped" ? `Unswiped (${unswipedCount})` : `Swiped (${swipedCount})`}
              </button>
            ))}
          </div>

          {/* Type filter */}
          {videoCount > 0 && (
            <div className="flex gap-1 ml-1 border-l border-gray-200 pl-2">
              {(["all", "image", "video"] as TypeFilter[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`text-xs px-2 py-1 rounded-full transition-colors flex items-center gap-1 ${
                    typeFilter === t
                      ? t === "video" ? "bg-purple-600 text-white" : "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {t === "video" && <Video className="w-2.5 h-2.5" />}
                  {t === "all" ? "All" : t === "image" ? `Images (${imageCount})` : `Videos (${videoCount})`}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImageModal(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-2 rounded-lg transition-colors"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            Upload Image
          </button>
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-3 py-2 rounded-lg transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload Video
          </button>
          {unswipedCount > 0 && (
            <button
              onClick={handleBatchSwipe}
              disabled={batchSwiping}
              className="flex items-center gap-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {batchSwiping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              Swipe All ({unswipedCount})
            </button>
          )}
        </div>
      </div>

      {/* Pain point selector (for image swipes) */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-gray-500 shrink-0">Pain Point:</span>
        {[
          { value: "auto-detect", label: "Auto" },
          { value: "neck-pain", label: "Neck Pain" },
          { value: "snoring", label: "Snoring" },
          { value: "sleep-quality", label: "Sleep Quality" },
          { value: "general", label: "General" },
        ].map((pp) => (
          <button
            key={pp.value}
            onClick={() => setPainPoint(pp.value)}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              painPoint === pp.value
                ? "bg-indigo-100 text-indigo-700 font-medium"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {pp.label}
          </button>
        ))}
      </div>

      {/* Video style selector (for video swipes) */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-medium text-gray-500 shrink-0">Video Style:</span>
        {(
          [
            { value: "ugc", label: "UGC (real person)", icon: <Video className="w-3 h-3" /> },
            { value: "pixar_animation", label: "Pixar Animation", icon: <Sparkles className="w-3 h-3" /> },
          ] as { value: VideoStyle; label: string; icon: React.ReactNode }[]
        ).map((vs) => (
          <button
            key={vs.value}
            onClick={() => setVideoStyle(vs.value)}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors flex items-center gap-1 ${
              videoStyle === vs.value
                ? vs.value === "pixar_animation"
                  ? "bg-purple-100 text-purple-700 font-medium"
                  : "bg-indigo-100 text-indigo-700 font-medium"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {vs.icon}
            {vs.label}
          </button>
        ))}
        <span className="text-[11px] text-gray-400 ml-1">
          applies to video swipes
        </span>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading board ads...</span>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {/* Card grid */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredAds.map((ad) => (
            <AdCard
              key={ad.id}
              ad={ad}
              swiping={swipingIds.has(ad.id)}
              onSwipe={() => handleSwipe(ad)}
            />
          ))}
        </div>
      )}

      {!loading && filteredAds.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          No ads match this filter.
        </div>
      )}

      {/* Upload Video Modal */}
      {showUploadModal && (
        <UploadVideoModal
          defaultStyle={videoStyle}
          onClose={() => setShowUploadModal(false)}
          onSuccess={(videoJobId) => {
            setShowUploadModal(false);
            router.push(`/video-ads/${videoJobId}`);
          }}
        />
      )}

      {/* Upload Image Modal */}
      {showImageModal && (
        <UploadImageModal
          onClose={() => setShowImageModal(false)}
          onSuccess={(jobId) => {
            setShowImageModal(false);
            router.push(`/images/${jobId}`);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload Video Modal
// ---------------------------------------------------------------------------

function UploadVideoModal({
  defaultStyle,
  onClose,
  onSuccess,
}: {
  defaultStyle: VideoStyle;
  onClose: () => void;
  onSuccess: (videoJobId: string) => void;
}) {
  const [mode, setMode] = useState<"file" | "url">("file");
  const [videoUrl, setVideoUrl] = useState("");
  const [brandName, setBrandName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [modalStyle, setModalStyle] = useState<VideoStyle>(defaultStyle);
  const [modalFormat, setModalFormat] = useState<SwipeVideoFormatId>("auto");
  const [modalStyleNotes, setModalStyleNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleSubmit() {
    let finalVideoUrl = videoUrl;

    // If file mode, upload directly to Supabase via signed URL
    // (bypasses Vercel's 4.5MB serverless body limit)
    if (mode === "file") {
      if (!file) {
        setError("Select a video file");
        return;
      }
      setUploading(true);
      setUploadProgress("Getting upload URL...");
      setError(null);

      try {
        // Step 1: Get signed upload URL from our API
        const signRes = await fetch(
          `/api/ad-spy/upload-video?filename=${encodeURIComponent(file.name)}&size=${file.size}`
        );
        const signData = await signRes.json();
        if (!signRes.ok) throw new Error(signData.error || "Failed to get upload URL");

        // Step 2: Upload directly to Supabase Storage
        setUploadProgress("Uploading video...");
        const uploadRes = await fetch(signData.signed_url, {
          method: "PUT",
          headers: {
            "Content-Type": signData.content_type,
          },
          body: file,
        });
        if (!uploadRes.ok) {
          const errText = await uploadRes.text().catch(() => "Upload failed");
          throw new Error(errText);
        }

        finalVideoUrl = signData.public_url;
        setUploadProgress(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setUploading(false);
        setUploadProgress(null);
        return;
      }
      setUploading(false);
    } else {
      if (!videoUrl.trim()) {
        setError("Paste a video URL");
        return;
      }
    }

    // Call swipe-video without gethookd_ad_id
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/ad-spy/swipe-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_url: finalVideoUrl,
          brand_name: brandName.trim() || "Competitor",
          video_style: modalStyle,
          video_format:
            modalStyle === "ugc" && modalFormat !== "auto" ? modalFormat : undefined,
          style_notes:
            modalStyle === "ugc" && modalStyleNotes.trim()
              ? modalStyleNotes.trim()
              : undefined,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "Swipe failed");
        try { const parsed = JSON.parse(errText); throw new Error(parsed.error || "Swipe failed"); }
        catch (e) { if (e instanceof SyntaxError) throw new Error(errText); throw e; }
      }
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Swipe failed");
      onSuccess(data.videoJobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start video swipe");
    } finally {
      setSubmitting(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.type.startsWith("video/")) {
      setFile(droppedFile);
      setError(null);
    } else {
      setError("Please drop a video file (mp4, mov, webm)");
    }
  }

  const isProcessing = uploading || submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Swipe Competitor Video</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
            <button
              onClick={() => { setMode("file"); setError(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-md transition-colors ${
                mode === "file" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Upload File
            </button>
            <button
              onClick={() => { setMode("url"); setError(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-md transition-colors ${
                mode === "url" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              Paste URL
            </button>
          </div>

          {/* File upload area */}
          {mode === "file" && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                dragOver
                  ? "border-purple-400 bg-purple-50"
                  : file
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-gray-200 hover:border-gray-300 bg-gray-50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/x-msvideo"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { setFile(f); setError(null); }
                }}
              />
              {file ? (
                <div className="space-y-1">
                  <Video className="w-6 h-6 text-emerald-500 mx-auto" />
                  <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                  <p className="text-[11px] text-gray-400">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <Upload className="w-6 h-6 text-gray-400 mx-auto" />
                  <p className="text-sm text-gray-500">Drop a video or click to browse</p>
                  <p className="text-[11px] text-gray-400">MP4, MOV, WebM up to 100MB</p>
                </div>
              )}
            </div>
          )}

          {/* URL input */}
          {mode === "url" && (
            <input
              type="url"
              placeholder="https://example.com/competitor-ad.mp4"
              value={videoUrl}
              onChange={(e) => { setVideoUrl(e.target.value); setError(null); }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300"
            />
          )}

          {/* Brand name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Brand / Competitor Name <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Emma Sleep, Casper, Purple..."
              value={brandName}
              onChange={(e) => { setBrandName(e.target.value); setError(null); }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300"
            />
          </div>

          {/* Video style toggle */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Video Style</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setModalStyle("ugc")}
                className={`flex items-start gap-2 text-left px-3 py-2.5 rounded-lg border-2 transition-colors ${
                  modalStyle === "ugc"
                    ? "border-indigo-400 bg-indigo-50"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                <Video className={`w-4 h-4 mt-0.5 shrink-0 ${modalStyle === "ugc" ? "text-indigo-600" : "text-gray-400"}`} />
                <div>
                  <div className={`text-xs font-semibold ${modalStyle === "ugc" ? "text-indigo-900" : "text-gray-700"}`}>
                    UGC
                  </div>
                  <div className="text-[10px] text-gray-500 leading-tight mt-0.5">
                    Real person, iPhone aesthetic
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setModalStyle("pixar_animation")}
                className={`flex items-start gap-2 text-left px-3 py-2.5 rounded-lg border-2 transition-colors ${
                  modalStyle === "pixar_animation"
                    ? "border-purple-400 bg-purple-50"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                <Sparkles className={`w-4 h-4 mt-0.5 shrink-0 ${modalStyle === "pixar_animation" ? "text-purple-600" : "text-gray-400"}`} />
                <div>
                  <div className={`text-xs font-semibold ${modalStyle === "pixar_animation" ? "text-purple-900" : "text-gray-700"}`}>
                    Pixar Animation
                  </div>
                  <div className="text-[10px] text-gray-500 leading-tight mt-0.5">
                    3D talking objects / body parts
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Format override + style notes (UGC only) */}
          {modalStyle === "ugc" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Video Format
                </label>
                <select
                  value={modalFormat}
                  onChange={(e) => setModalFormat(e.target.value as SwipeVideoFormatId)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300 bg-white"
                >
                  {SWIPE_FORMAT_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400 leading-tight mt-1">
                  {SWIPE_FORMAT_OPTIONS.find((o) => o.id === modalFormat)?.description}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Style Notes <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={modalStyleNotes}
                  onChange={(e) => setModalStyleNotes(e.target.value)}
                  placeholder="e.g. two hosts in a warehouse talking about collagen, golden hour lighting, slightly messy but professional..."
                  rows={3}
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300 resize-none"
                />
                <p className="text-[10px] text-gray-400 leading-tight mt-1">
                  Freeform direction that overrides details from the competitor video.
                </p>
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Progress */}
          {uploadProgress && (
            <div className="flex items-center gap-2 text-xs text-purple-600">
              <Loader2 className="w-3 h-3 animate-spin" />
              {uploadProgress}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={isProcessing}
            className="w-full flex items-center justify-center gap-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg py-2.5 transition-colors disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {uploading ? "Uploading..." : "Starting swipe..."}
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Swipe Video
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload Image Modal
// ---------------------------------------------------------------------------

function UploadImageModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (jobId: string) => void;
}) {
  const [mode, setMode] = useState<"file" | "url">("file");
  const [imageUrl, setImageUrl] = useState("");
  const [brandName, setBrandName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Generate/revoke preview URL when file changes
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Paste handler: cmd+V an image from clipboard
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const pastedFile = item.getAsFile();
          if (pastedFile) {
            setFile(pastedFile);
            setMode("file");
            setError(null);
            e.preventDefault();
            break;
          }
        }
      }
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  async function handleSubmit() {
    let finalImageUrl = imageUrl;

    if (mode === "file") {
      if (!file) {
        setError("Paste (cmd+V), drop, or pick an image");
        return;
      }
      setUploading(true);
      setUploadProgress("Getting upload URL...");
      setError(null);

      try {
        const signRes = await fetch(
          `/api/ad-spy/upload-image?filename=${encodeURIComponent(file.name)}&size=${file.size}`
        );
        const signData = await signRes.json();
        if (!signRes.ok) throw new Error(signData.error || "Failed to get upload URL");

        setUploadProgress("Uploading image...");
        const uploadRes = await fetch(signData.signed_url, {
          method: "PUT",
          headers: { "Content-Type": signData.content_type },
          body: file,
        });
        if (!uploadRes.ok) {
          const errText = await uploadRes.text().catch(() => "Upload failed");
          throw new Error(errText);
        }

        finalImageUrl = signData.public_url;
        setUploadProgress(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setUploading(false);
        setUploadProgress(null);
        return;
      }
      setUploading(false);
    } else {
      if (!imageUrl.trim()) {
        setError("Paste an image URL");
        return;
      }
    }

    // Call /api/ad-spy/swipe without gethookd_ad_id → manual upload path
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/ad-spy/swipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_urls: [finalImageUrl],
          brand_name: brandName.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "Swipe failed");
        try {
          const parsed = JSON.parse(errText);
          throw new Error(parsed.error || "Swipe failed");
        } catch (e) {
          if (e instanceof SyntaxError) throw new Error(errText);
          throw e;
        }
      }
      const data = await res.json();
      if (!data.ok || !data.jobId) throw new Error(data.error || "Swipe failed");
      onSuccess(data.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start swipe");
    } finally {
      setSubmitting(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.type.startsWith("image/")) {
      setFile(droppedFile);
      setError(null);
    } else {
      setError("Please drop an image file (png, jpg, webp, gif)");
    }
  }

  const isProcessing = uploading || submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Swipe Competitor Image</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
            <button
              onClick={() => { setMode("file"); setError(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-md transition-colors ${
                mode === "file" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Paste / Upload
            </button>
            <button
              onClick={() => { setMode("url"); setError(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-md transition-colors ${
                mode === "url" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              Image URL
            </button>
          </div>

          {/* File area */}
          {mode === "file" && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                dragOver
                  ? "border-indigo-400 bg-indigo-50"
                  : file
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-gray-200 hover:border-gray-300 bg-gray-50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { setFile(f); setError(null); }
                }}
              />
              {previewUrl ? (
                <div className="space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-h-40 mx-auto rounded-lg border border-gray-200"
                  />
                  <p className="text-[11px] text-gray-500 truncate">
                    {file?.name} · {file ? (file.size / 1024).toFixed(0) : 0} KB
                  </p>
                  <p className="text-[10px] text-gray-400">Click to replace</p>
                </div>
              ) : (
                <div className="space-y-1 py-3">
                  <ImageIcon className="w-6 h-6 text-gray-400 mx-auto" />
                  <p className="text-sm text-gray-600 font-medium">Paste <kbd className="px-1.5 py-0.5 text-[10px] bg-white border border-gray-300 rounded">⌘V</kbd>, drop, or click to browse</p>
                  <p className="text-[11px] text-gray-400">PNG, JPG, WebP, GIF up to 20MB</p>
                </div>
              )}
            </div>
          )}

          {/* URL input */}
          {mode === "url" && (
            <input
              type="url"
              placeholder="https://example.com/competitor-ad.jpg"
              value={imageUrl}
              onChange={(e) => { setImageUrl(e.target.value); setError(null); }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
            />
          )}

          {/* Brand name (optional) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Brand <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="Leave blank — AI figures it out"
              value={brandName}
              onChange={(e) => { setBrandName(e.target.value); setError(null); }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Progress */}
          {uploadProgress && (
            <div className="flex items-center gap-2 text-xs text-indigo-600">
              <Loader2 className="w-3 h-3 animate-spin" />
              {uploadProgress}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={isProcessing}
            className="w-full flex items-center justify-center gap-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg py-2.5 transition-colors disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {uploading ? "Uploading..." : "Starting swipe..."}
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Swipe Image
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ad Card + helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`;
}

function AdCard({
  ad,
  swiping,
  onSwipe,
}: {
  ad: BoardAd;
  swiping: boolean;
  onSwipe: () => void;
}) {
  const isSwiped = ad.swipe_status === "swiped";
  const isQueued = ad.swipe_status === "queued" || ad.swipe_status === "swiping";
  const isVideo = ad.ad_type === "video";
  const viewUrl = isVideo ? `/video-ads/${ad.video_job_id}` : `/images/${ad.image_job_id}`;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
      {/* Thumbnail */}
      <div className="aspect-[4/5] bg-gray-100 relative overflow-hidden">
        {ad.thumbnail_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.thumbnail_url}
            alt={ad.title || "Ad"}
            className="w-full h-full object-cover"
          />
        )}
        {/* Video play icon overlay + duration */}
        {isVideo && (
          <>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                <Play className="w-5 h-5 text-white fill-white ml-0.5" />
              </div>
            </div>
            {ad.video_duration && (
              <span className="absolute bottom-2 left-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/70 text-white tabular-nums">
                {formatDuration(ad.video_duration)}
              </span>
            )}
          </>
        )}
        {/* Video type badge */}
        {isVideo && (
          <span className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/90 text-white flex items-center gap-0.5">
            <Video className="w-2.5 h-2.5" />
            Video
          </span>
        )}
        {/* Performance badge */}
        {ad.performance_score_title && (
          <span
            className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              ad.performance_score_title === "Winning"
                ? "bg-emerald-100 text-emerald-700"
                : ad.performance_score_title === "Scaling"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {ad.performance_score_title}
          </span>
        )}
        {/* Swiped badge (top-left, only for images since video has Video badge there) */}
        {isSwiped && !isVideo && (
          <span className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
            <Check className="w-2.5 h-2.5" />
            Swiped
          </span>
        )}
        {/* Queued overlay */}
        {isQueued && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5">
        <div className="flex items-center gap-1.5 mb-1">
          {ad.brand_logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.brand_logo} alt="" className="w-3.5 h-3.5 rounded-full" />
          )}
          <span className="text-[11px] font-medium text-gray-700 truncate">{ad.brand_name}</span>
          <span className="text-[10px] text-gray-400 ml-auto shrink-0">{ad.days_active}d</span>
        </div>
        {ad.body && (
          <p className="text-[11px] text-gray-500 line-clamp-2 mb-2">{ad.body}</p>
        )}

        {/* Action */}
        {isQueued ? (
          <div className="flex items-center justify-center gap-1.5 w-full text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-lg py-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            Queued
          </div>
        ) : isSwiped ? (
          <div className="flex gap-1.5">
            <a
              href={viewUrl}
              className={`flex items-center justify-center gap-1 flex-1 text-[11px] font-medium rounded-lg py-1.5 transition-colors ${
                isVideo
                  ? "text-purple-600 bg-purple-50 border border-purple-200 hover:bg-purple-100"
                  : "text-emerald-600 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100"
              }`}
            >
              <Check className="w-3 h-3" />
              View
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
            <button
              onClick={onSwipe}
              disabled={swiping}
              className="flex items-center justify-center gap-1 flex-1 text-[11px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg py-1.5 hover:bg-indigo-100 transition-colors disabled:opacity-50"
            >
              {swiping ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <>
                  <Zap className="w-3 h-3" />
                  Swipe Again
                </>
              )}
            </button>
          </div>
        ) : (
          <button
            onClick={onSwipe}
            disabled={swiping}
            className={`flex items-center justify-center gap-1.5 w-full text-xs font-medium text-white rounded-lg py-1.5 transition-colors disabled:opacity-50 ${
              isVideo
                ? "bg-purple-600 hover:bg-purple-700"
                : "bg-indigo-600 hover:bg-indigo-700"
            }`}
          >
            {swiping ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Swiping...
              </>
            ) : (
              <>
                <Zap className="w-3 h-3" />
                {isVideo ? "Swipe Video" : "Swipe"}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
