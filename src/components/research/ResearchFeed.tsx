"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Star,
  Globe,
  ChevronLeft,
  ChevronRight,
  FileText,
  X,
  Filter,
  Tag,
} from "lucide-react";
import {
  SiTrustpilot,
  SiReddit,
  SiFacebook,
  SiInstagram,
  SiTiktok,
} from "react-icons/si";
import { FaAmazon } from "react-icons/fa";

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

interface Source {
  id: string;
  name: string;
  platform: string;
}

const LANG_FLAGS: Record<string, string> = {
  sv: "\u{1F1F8}\u{1F1EA}",
  da: "\u{1F1E9}\u{1F1F0}",
  no: "\u{1F1F3}\u{1F1F4}",
  en: "\u{1F1EC}\u{1F1E7}",
  de: "\u{1F1E9}\u{1F1EA}",
  fi: "\u{1F1EB}\u{1F1EE}",
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "bg-green-100 text-green-800",
  negative: "bg-red-100 text-red-800",
  neutral: "bg-gray-100 text-gray-700",
  mixed: "bg-amber-100 text-amber-800",
};

const SENTIMENTS = ["positive", "negative", "neutral", "mixed"] as const;

export default function ResearchFeed() {
  const [nuggets, setNuggets] = useState<Nugget[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<Source[]>([]);

  // Filters
  const [minSig, setMinSig] = useState(4);
  const [sourceId, setSourceId] = useState("");
  const [sentiment, setSentiment] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [platform, setPlatform] = useState("");

  // Fetch sources for the dropdown
  useEffect(() => {
    fetch("/api/research/sources")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setSources(data.map((s: Source) => ({ id: s.id, name: s.name, platform: s.platform })));
        }
      })
      .catch(() => {});
  }, []);

  const fetchNuggets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        perPage: "20",
        minSignificance: String(minSig),
      });
      if (sourceId) params.set("sourceId", sourceId);
      if (sentiment) params.set("sentiment", sentiment);
      if (activeTag) params.set("tag", activeTag);

      const res = await fetch(`/api/research/nuggets?${params}`);
      const data = await res.json();
      setNuggets(data.nuggets ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (e) {
      console.error("Failed to fetch nuggets:", e);
    } finally {
      setLoading(false);
    }
  }, [page, minSig, sourceId, sentiment, activeTag]);

  useEffect(() => {
    fetchNuggets();
  }, [fetchNuggets]);

  const resetPage = () => setPage(1);
  const activeFilterCount =
    (sourceId ? 1 : 0) +
    (sentiment ? 1 : 0) +
    (activeTag ? 1 : 0) +
    (platform ? 1 : 0) +
    (minSig !== 4 ? 1 : 0);

  const clearAllFilters = () => {
    setMinSig(4);
    setSourceId("");
    setSentiment("");
    setActiveTag("");
    setPlatform("");
    setPage(1);
  };

  // Filter sources list by platform for source dropdown
  const filteredSources = platform
    ? sources.filter((s) => s.platform === platform)
    : sources;

  return (
    <div>
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1 text-sm text-gray-500">
          <Filter className="w-3.5 h-3.5" />
          Filters
        </div>

        {/* Significance */}
        <select
          value={minSig}
          onChange={(e) => {
            setMinSig(parseInt(e.target.value));
            resetPage();
          }}
          className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
        >
          <option value={1}>All scores</option>
          <option value={4}>Useful (4+)</option>
          <option value={6}>Good (6+)</option>
          <option value={8}>Gold (8+)</option>
        </select>

        {/* Platform */}
        <select
          value={platform}
          onChange={(e) => {
            setPlatform(e.target.value);
            setSourceId(""); // Reset source when changing platform
            resetPage();
          }}
          className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
        >
          <option value="">All platforms</option>
          <option value="trustpilot">Trustpilot</option>
          <option value="reddit">Reddit</option>
          <option value="amazon">Amazon</option>
          <option value="apify_instagram">Instagram</option>
          <option value="apify_facebook">Facebook</option>
          <option value="apify_tiktok">TikTok</option>
          <option value="facebook_group">FB Groups</option>
          <option value="manual_import">Manual</option>
        </select>

        {/* Source */}
        <select
          value={sourceId}
          onChange={(e) => {
            setSourceId(e.target.value);
            resetPage();
          }}
          className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
        >
          <option value="">All sources</option>
          {filteredSources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {/* Sentiment */}
        <select
          value={sentiment}
          onChange={(e) => {
            setSentiment(e.target.value);
            resetPage();
          }}
          className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
        >
          <option value="">All sentiments</option>
          {SENTIMENTS.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>

        {/* Active tag filter pill */}
        {activeTag && (
          <span className="inline-flex items-center gap-1 text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">
            <Tag className="w-3 h-3" />
            {activeTag}
            <button
              onClick={() => {
                setActiveTag("");
                resetPage();
              }}
              className="hover:text-indigo-900"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )}

        {/* Result count + clear */}
        <div className="flex items-center gap-2 ml-auto">
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Clear filters
            </button>
          )}
          <span className="text-sm text-gray-500">
            {total} nugget{total !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Nugget cards */}
      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading...</div>
      ) : nuggets.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          {activeFilterCount > 0
            ? "No nuggets match the current filters."
            : "No research nuggets yet. Add sources and run a scan to get started."}
        </div>
      ) : (
        <div className="max-w-3xl space-y-2">
          {nuggets
            .filter((n) =>
              platform
                ? n.research_sources?.platform === platform
                : true
            )
            .map((n) => (
            <div
              key={n.id}
              className="bg-white border border-gray-200 rounded-lg px-4 py-3"
            >
              {/* Header: platform icon + source + meta */}
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <PlatformIcon platform={n.research_sources?.platform} />
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {n.research_sources?.name ?? n.competitor_name}
                  </span>
                  <span className="text-xs flex-shrink-0" title={n.language}>
                    {LANG_FLAGS[n.language] ?? n.language}
                  </span>
                  {n.market_relevance === "reference" && (
                    <span className="flex items-center gap-0.5 text-xs text-gray-400 flex-shrink-0">
                      <Globe className="w-3 h-3" /> ref
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
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

              {/* Star rating row (separate from header) */}
              {n.review_stars > 0 && (
                <div className="flex items-center gap-0.5 mb-1.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`w-3 h-3 ${
                        i < n.review_stars
                          ? "fill-yellow-400 text-yellow-400"
                          : "fill-gray-200 text-gray-200"
                      }`}
                    />
                  ))}
                </div>
              )}

              {/* Summary */}
              <p className="text-sm text-gray-700 leading-relaxed mb-1.5">{n.summary}</p>

              {/* Customer phrases (the gold) */}
              {n.customer_phrases.length > 0 && (
                <div className="mb-1.5">
                  {n.customer_phrases.map((phrase, i) => (
                    <span
                      key={i}
                      className="inline-block bg-yellow-50 border border-yellow-200 text-yellow-900 text-xs px-2 py-0.5 rounded mr-1 mb-1 italic"
                    >
                      &ldquo;{phrase}&rdquo;
                    </span>
                  ))}
                </div>
              )}

              {/* Tags — clickable to filter */}
              {n.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {n.tags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => {
                        setActiveTag(tag === activeTag ? "" : tag);
                        resetPage();
                      }}
                      className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                        tag === activeTag
                          ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300"
                          : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6 max-w-3xl">
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

/** Platform icon rendered to the left of the source name */
function PlatformIcon({ platform }: { platform?: string }) {
  switch (platform) {
    case "trustpilot":
      return <SiTrustpilot className="w-4 h-4 text-[#00B67A] flex-shrink-0" />;
    case "reddit":
      return <SiReddit className="w-4 h-4 text-[#FF4500] flex-shrink-0" />;
    case "amazon":
      return <FaAmazon className="w-4 h-4 text-[#FF9900] flex-shrink-0" />;
    case "apify_instagram":
      return <SiInstagram className="w-4 h-4 text-[#E4405F] flex-shrink-0" />;
    case "apify_facebook":
    case "facebook_group":
      return <SiFacebook className="w-4 h-4 text-[#1877F2] flex-shrink-0" />;
    case "apify_tiktok":
      return <SiTiktok className="w-4 h-4 flex-shrink-0" />;
    case "manual_import":
      return <FileText className="w-4 h-4 text-emerald-600 flex-shrink-0" />;
    default:
      return null;
  }
}
