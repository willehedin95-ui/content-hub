"use client";

import { Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SavedAd } from "@/types";

const platformLabels: Record<string, string> = {
  instagram: "IG",
  facebook: "FB",
  unknown: "",
};

interface Props {
  ad: SavedAd;
  isSelected: boolean;
  onClick: () => void;
}

export default function SavedAdCard({ ad, isSelected, onClick }: Props) {
  const hasAnalysis = !!ad.cash_analysis;
  const platformLabel = platformLabels[ad.source_platform] || "";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border transition-all hover:shadow-md overflow-hidden",
        isSelected
          ? "border-foreground/30 ring-1 ring-foreground/20 shadow-md"
          : "border-border hover:border-foreground/20"
      )}
    >
      {/* Thumbnail */}
      {ad.media_url ? (
        <div className="aspect-square bg-muted relative overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ad.thumbnail_url || ad.media_url}
            alt={ad.headline || "Saved ad"}
            className="w-full h-full object-cover"
          />
          {platformLabel && (
            <div className="absolute top-2 left-2 bg-background/80 backdrop-blur-sm text-[10px] font-medium px-1.5 py-0.5 rounded">
              {platformLabel}
            </div>
          )}
          {ad.is_bookmarked && (
            <div className="absolute top-2 right-2">
              <Bookmark className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            </div>
          )}
          {hasAnalysis && (
            <div className="absolute bottom-2 right-2 bg-green-500/90 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
              Analyzed
            </div>
          )}
        </div>
      ) : (
        <div className="aspect-square bg-muted flex items-center justify-center text-muted-foreground text-xs">
          No image
        </div>
      )}

      {/* Info */}
      <div className="p-2.5 space-y-1">
        {ad.brand_name && (
          <p className="text-xs font-medium text-foreground truncate">
            {ad.brand_name}
          </p>
        )}
        <p className="text-xs text-muted-foreground line-clamp-2">
          {ad.headline || ad.body || ad.user_notes || "No text"}
        </p>
        {ad.cash_analysis && (
          <div className="flex flex-wrap gap-1 mt-1">
            {ad.cash_analysis.angle && (
              <span className="text-[10px] bg-accent px-1.5 py-0.5 rounded">
                {ad.cash_analysis.angle}
              </span>
            )}
            {ad.cash_analysis.awareness_level && (
              <span className="text-[10px] bg-accent px-1.5 py-0.5 rounded">
                {ad.cash_analysis.awareness_level}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
