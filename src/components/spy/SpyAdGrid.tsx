"use client";

import { useEffect, useRef, useCallback } from "react";
import { SpyAd } from "@/types";
import SpyAdCard from "./SpyAdCard";
import { Loader2 } from "lucide-react";

interface Props {
  ads: SpyAd[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onAdClick: (ad: SpyAd) => void;
  onBookmark: (id: string, bookmarked: boolean) => void;
}

export default function SpyAdGrid({ ads, loading, hasMore, onLoadMore, onAdClick, onBookmark }: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll via IntersectionObserver
  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasMore && !loading) {
        onLoadMore();
      }
    },
    [hasMore, loading, onLoadMore]
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleIntersect, { rootMargin: "200px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersect]);

  if (!loading && ads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-gray-500 text-sm">No ads found</p>
        <p className="text-gray-400 text-xs mt-1">Try adjusting your filters or scrape some brands</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {ads.map((ad) => (
          <SpyAdCard
            key={ad.id}
            ad={ad}
            onClick={() => onAdClick(ad)}
            onBookmark={onBookmark}
          />
        ))}
      </div>

      {/* Loading / infinite scroll sentinel */}
      <div ref={sentinelRef} className="flex items-center justify-center py-8">
        {loading && (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading ads...
          </div>
        )}
      </div>
    </div>
  );
}
