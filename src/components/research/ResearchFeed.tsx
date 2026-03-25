"use client";

import { useState, useEffect, useCallback } from "react";
import { Star, Globe, Tag, ChevronLeft, ChevronRight } from "lucide-react";

interface Nugget {
  id: string;
  review_stars: number;
  review_text: string;
  review_title: string | null;
  reviewer_name: string;
  language: string;
  market_relevance: "primary" | "reference";
  sentiment: string;
  significance: number;
  tags: string[];
  customer_phrases: string[];
  pain_points: string[];
  desires: string[];
  competitor_name: string;
  summary: string;
  created_at: string;
  research_sources: {
    name: string;
    domain: string;
    platform: string;
    is_own_brand: boolean;
  };
}

const LANG_FLAGS: Record<string, string> = {
  sv: "🇸🇪",
  da: "🇩🇰",
  no: "🇳🇴",
  en: "🇬🇧",
  de: "🇩🇪",
  fi: "🇫🇮",
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "bg-green-100 text-green-800",
  negative: "bg-red-100 text-red-800",
  neutral: "bg-gray-100 text-gray-700",
  mixed: "bg-amber-100 text-amber-800",
};

export default function ResearchFeed() {
  const [nuggets, setNuggets] = useState<Nugget[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [minSig, setMinSig] = useState(4);

  const fetchNuggets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/research/nuggets?page=${page}&perPage=20&minSignificance=${minSig}`
      );
      const data = await res.json();
      setNuggets(data.nuggets ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (e) {
      console.error("Failed to fetch nuggets:", e);
    } finally {
      setLoading(false);
    }
  }, [page, minSig]);

  useEffect(() => {
    fetchNuggets();
  }, [fetchNuggets]);

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-4 mb-4">
        <label className="text-sm text-gray-600 flex items-center gap-2">
          Min significance:
          <select
            value={minSig}
            onChange={(e) => {
              setMinSig(parseInt(e.target.value));
              setPage(1);
            }}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value={1}>All (1+)</option>
            <option value={4}>Useful (4+)</option>
            <option value={6}>Good (6+)</option>
            <option value={8}>Gold (8+)</option>
          </select>
        </label>
        <span className="text-sm text-gray-500">
          {total} nugget{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Nugget cards */}
      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading...</div>
      ) : nuggets.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          No research nuggets yet. Add sources and run a scan to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {nuggets.map((n) => (
            <div
              key={n.id}
              className="bg-white border border-gray-200 rounded-lg p-4"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {n.research_sources?.name ?? n.competitor_name}
                  </span>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`w-3 h-3 ${
                          i < n.review_stars
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-gray-200"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs" title={n.language}>
                    {LANG_FLAGS[n.language] ?? n.language}
                  </span>
                  {n.market_relevance === "reference" && (
                    <span className="flex items-center gap-0.5 text-xs text-gray-400">
                      <Globe className="w-3 h-3" /> ref
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      SENTIMENT_COLORS[n.sentiment] ?? SENTIMENT_COLORS.neutral
                    }`}
                  >
                    {n.sentiment}
                  </span>
                  <span
                    className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                      n.significance >= 8
                        ? "bg-indigo-100 text-indigo-800 font-bold"
                        : n.significance >= 6
                          ? "bg-blue-50 text-blue-700"
                          : "bg-gray-50 text-gray-600"
                    }`}
                  >
                    {n.significance}/10
                  </span>
                </div>
              </div>

              {/* Summary */}
              <p className="text-sm text-gray-700 mb-2">{n.summary}</p>

              {/* Customer phrases (the gold) */}
              {n.customer_phrases.length > 0 && (
                <div className="mb-2">
                  {n.customer_phrases.map((phrase, i) => (
                    <span
                      key={i}
                      className="inline-block bg-yellow-50 border border-yellow-200 text-yellow-900 text-xs px-2 py-1 rounded mr-1 mb-1 italic"
                    >
                      &ldquo;{phrase}&rdquo;
                    </span>
                  ))}
                </div>
              )}

              {/* Tags */}
              {n.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {n.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-0.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
                    >
                      <Tag className="w-2.5 h-2.5" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm text-gray-600">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
