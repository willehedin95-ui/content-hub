"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, ExternalLink, Zap } from "lucide-react";

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
}

type Filter = "all" | "unswiped" | "swiped";

export default function BoardFeed({ onBatchSwipe }: { onBatchSwipe: () => void }) {
  const router = useRouter();
  const [ads, setAds] = useState<BoardAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [swipingIds, setSwipingIds] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [boardId, setBoardId] = useState<string | null>(null);
  const [boards, setBoards] = useState<Array<{ id: number; name: string; ad_count: number }>>([]);
  const [batchSwiping, setBatchSwiping] = useState(false);
  const [painPoint, setPainPoint] = useState("auto-detect");

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
    try {
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
        // Navigate to the concept page immediately to watch progress
        router.push(`/images/${data.jobId}`);
      } else {
        console.error("Swipe failed:", data.error);
        setSwipingIds((prev) => {
          const next = new Set(prev);
          next.delete(ad.id);
          return next;
        });
      }
    } catch (err) {
      console.error("Swipe error:", err);
      setSwipingIds((prev) => {
        const next = new Set(prev);
        next.delete(ad.id);
        return next;
      });
    }
  }

  async function handleBatchSwipe() {
    const unswiped = ads.filter((a) => !a.swipe_status);
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
        // Mark all as queued locally
        setAds((prev) =>
          prev.map((a) =>
            !a.swipe_status ? { ...a, swipe_status: "queued" } : a
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
    if (filter === "unswiped") return !a.swipe_status;
    if (filter === "swiped") return a.swipe_status === "swiped";
    return true;
  });

  const unswipedCount = ads.filter((a) => !a.swipe_status).length;
  const swipedCount = ads.filter((a) => a.swipe_status === "swiped").length;

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
        </div>

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

      {/* Pain point selector */}
      <div className="flex items-center gap-2 mb-4">
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
    </div>
  );
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
        {/* Swiped badge (top-left) */}
        {isSwiped && (
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
              href={`/images/${ad.image_job_id}`}
              className="flex items-center justify-center gap-1 flex-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg py-1.5 hover:bg-emerald-100 transition-colors"
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
            className="flex items-center justify-center gap-1.5 w-full text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg py-1.5 transition-colors disabled:opacity-50"
          >
            {swiping ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Swiping...
              </>
            ) : (
              <>
                <Zap className="w-3 h-3" />
                Swipe
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
