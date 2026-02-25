"use client";

import { SpyAd } from "@/types";
import { Bookmark, Play, Sparkles, ExternalLink } from "lucide-react";

interface Props {
  ad: SpyAd;
  onClick: () => void;
  onBookmark: (id: string, bookmarked: boolean) => void;
}

export default function SpyAdCard({ ad, onClick, onBookmark }: Props) {
  const isVideo = ad.media_type === "video";
  const thumbnailSrc = ad.thumbnail_url || ad.media_url;
  const hasAnalysis = !!ad.cash_analysis;

  return (
    <div
      className="group relative bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 hover:shadow-md transition-all cursor-pointer"
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="relative aspect-square bg-gray-100">
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt={ad.headline ?? "Ad creative"}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
            No preview
          </div>
        )}

        {/* Video play icon overlay */}
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
            </div>
          </div>
        )}

        {/* Top-left: rank badge */}
        {ad.impressions_rank && (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-bold">
            #{ad.impressions_rank}
          </div>
        )}

        {/* Top-right: bookmark */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onBookmark(ad.id, !ad.is_bookmarked);
          }}
          className={`absolute top-2 right-2 p-1.5 rounded-full transition-all ${
            ad.is_bookmarked
              ? "bg-amber-100 text-amber-600"
              : "bg-black/30 text-white opacity-0 group-hover:opacity-100"
          }`}
        >
          <Bookmark className={`w-3.5 h-3.5 ${ad.is_bookmarked ? "fill-amber-500" : ""}`} />
        </button>

        {/* Bottom-left: CASH badge */}
        {hasAnalysis && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-violet-600/80 text-white text-[10px] font-medium">
            <Sparkles className="w-3 h-3" />
            CASH
          </div>
        )}

        {/* Bottom-right: media type */}
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/50 text-white text-[10px] font-medium uppercase">
          {ad.media_type ?? "unknown"}
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        {/* Brand name */}
        {ad.brand && (
          <p className="text-[10px] font-medium text-indigo-600 uppercase tracking-wide mb-1">
            {ad.brand.name}
          </p>
        )}

        {/* Headline */}
        <p className="text-sm font-medium text-gray-800 line-clamp-2 leading-snug mb-1.5">
          {ad.headline || ad.body?.slice(0, 80) || "No copy available"}
        </p>

        {/* CASH tags */}
        {hasAnalysis && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {ad.cash_analysis!.angle && (
              <span className="text-[10px] text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded border border-violet-200">
                {ad.cash_analysis!.angle}
              </span>
            )}
            {ad.cash_analysis!.style && (
              <span className="text-[10px] text-fuchsia-600 bg-fuchsia-50 px-1.5 py-0.5 rounded border border-fuchsia-200">
                {ad.cash_analysis!.style}
              </span>
            )}
          </div>
        )}

        {/* Footer: date + link */}
        <div className="flex items-center justify-between text-[10px] text-gray-400">
          {ad.ad_delivery_start_time ? (
            <span>
              {new Date(ad.ad_delivery_start_time).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })}
            </span>
          ) : (
            <span>No date</span>
          )}
          {ad.ad_snapshot_url && (
            <a
              href={ad.ad_snapshot_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-gray-400 hover:text-indigo-600 transition-colors"
              title="View in Ad Library"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
