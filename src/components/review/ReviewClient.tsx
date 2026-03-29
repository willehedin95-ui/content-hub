"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import ReviewHeader from "./ReviewHeader";
import ReviewCard from "./ReviewCard";
import ReviewEmpty from "./ReviewEmpty";
import type { ReviewItem } from "@/app/api/review/pending/route";

type FilterType = "all" | "concept" | "iteration" | "video" | "translation_review";

interface Counts {
  concepts: number;
  iterations: number;
  videos: number;
  translations: number;
  total: number;
}

export default function ReviewClient() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [counts, setCounts] = useState<Counts>({ concepts: 0, iterations: 0, videos: 0, translations: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const highlightRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/review/pending");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items);
      setCounts(data.counts);
    } catch {
      // silent retry on next poll
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
    const interval = setInterval(fetchItems, 10000);
    return () => clearInterval(interval);
  }, [fetchItems]);

  // Scroll to highlighted item
  useEffect(() => {
    if (highlightId && highlightRef.current && !hasScrolled.current) {
      hasScrolled.current = true;
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [highlightId, items]);

  async function handleAction(id: string, action: "approve" | "reject", type: string) {
    // Optimistic removal
    setDismissedIds((prev) => new Set(prev).add(id));

    try {
      const res = await fetch(`/api/review/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, type }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || `Failed to ${action}`);
        // Restore on error
        setDismissedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        return;
      }

      // Remove from items on success
      setItems((prev) => prev.filter((i) => i.id !== id));
      setCounts((prev) => {
        const item = items.find((i) => i.id === id);
        if (!item) return prev;
        const key = item.type === "concept" ? "concepts"
          : item.type === "iteration" ? "iterations"
          : item.type === "video" ? "videos"
          : "translations";
        return { ...prev, [key]: Math.max(0, prev[key] - 1), total: Math.max(0, prev.total - 1) };
      });
    } catch {
      alert(`Failed to ${action}. Check your connection.`);
      setDismissedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const visibleItems = items
    .filter((i) => !dismissedIds.has(i.id))
    .filter((i) => filter === "all" || i.type === filter);

  const filterTabs: Array<{ key: FilterType; label: string; count: number }> = [
    { key: "all", label: "All", count: counts.total },
    { key: "concept", label: "Concepts", count: counts.concepts + counts.iterations },
    { key: "video", label: "Videos", count: counts.videos },
    { key: "translation_review", label: "Translations", count: counts.translations },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <ReviewHeader total={counts.total} />

      {/* Filter tabs */}
      <div className="sticky top-[56px] z-10 bg-gray-50 border-b border-gray-200 px-4 py-2 overflow-x-auto">
        <div className="flex gap-2">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                filter === tab.key
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-1.5 ${filter === tab.key ? "text-gray-300" : "text-gray-400"}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 pb-20">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          </div>
        ) : visibleItems.length === 0 ? (
          <ReviewEmpty />
        ) : (
          <div className="max-w-lg mx-auto space-y-4">
            {visibleItems.map((item) => (
              <div
                key={item.id}
                ref={item.id === highlightId ? highlightRef : undefined}
              >
                <ReviewCard
                  item={item}
                  onAction={handleAction}
                  isHighlighted={item.id === highlightId}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
