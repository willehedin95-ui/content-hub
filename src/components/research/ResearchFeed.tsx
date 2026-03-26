"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Star,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FileText,
  X,
  Filter,
  Tag,
  Search,
  Download,
  Sparkles,
  TrendingUp,
  Database,
  Globe,
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
  review_date: string | null;
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

interface Stats {
  totalNuggets: number;
  totalSources: number;
  totalThemes: number;
  nuggetsLast7Days: number;
  goldNuggets: number;
  topTags: { tag: string; count: number }[];
}

const SENTIMENT_BADGE: Record<string, string> = {
  positive: "bg-green-50 text-green-700",
  negative: "bg-red-50 text-red-700",
  neutral: "bg-gray-50 text-gray-600",
  mixed: "bg-amber-50 text-amber-700",
};

const SENTIMENTS = ["positive", "negative", "neutral", "mixed"] as const;

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function ResearchFeed() {
  const [nuggets, setNuggets] = useState<Nugget[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<Source[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [minSig, setMinSig] = useState(4);
  const [sourceId, setSourceId] = useState("");
  const [sentiment, setSentiment] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [platform, setPlatform] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");

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

  // Fetch stats
  useEffect(() => {
    fetch("/api/research/stats")
      .then((r) => r.json())
      .then((data) => setStats(data))
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
      if (platform) params.set("platform", platform);
      if (searchQuery) params.set("search", searchQuery);

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
  }, [page, minSig, sourceId, sentiment, activeTag, platform, searchQuery]);

  useEffect(() => {
    fetchNuggets();
  }, [fetchNuggets]);

  const resetPage = () => setPage(1);
  const activeFilterCount =
    (sourceId ? 1 : 0) +
    (sentiment ? 1 : 0) +
    (activeTag ? 1 : 0) +
    (platform ? 1 : 0) +
    (searchQuery ? 1 : 0) +
    (minSig !== 4 ? 1 : 0);

  const clearAllFilters = () => {
    setMinSig(4);
    setSourceId("");
    setSentiment("");
    setActiveTag("");
    setPlatform("");
    setSearchQuery("");
    setSearchInput("");
    setPage(1);
  };

  // Filter sources list by platform for source dropdown
  const filteredSources = platform
    ? sources.filter((s) => s.platform === platform)
    : sources;

  const handleSearchSubmit = () => {
    setSearchQuery(searchInput.trim());
    resetPage();
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        page: "1",
        perPage: "1000",
        minSignificance: String(minSig),
      });
      if (sourceId) params.set("sourceId", sourceId);
      if (sentiment) params.set("sentiment", sentiment);
      if (activeTag) params.set("tag", activeTag);
      if (platform) params.set("platform", platform);
      if (searchQuery) params.set("search", searchQuery);

      const res = await fetch(`/api/research/nuggets?${params}`);
      const data = await res.json();
      const rows = (data.nuggets ?? []) as Nugget[];

      const header = "Source,Platform,Stars,Sentiment,Significance,Summary,Customer Phrases,Pain Points,Desires,Tags,Language,Date\n";
      const csvRows = rows.map((n) =>
        [
          `"${(n.research_sources?.name ?? n.competitor_name).replace(/"/g, '""')}"`,
          n.research_sources?.platform ?? "",
          n.review_stars,
          n.sentiment,
          n.significance,
          `"${n.summary.replace(/"/g, '""')}"`,
          `"${n.customer_phrases.join("; ").replace(/"/g, '""')}"`,
          `"${n.pain_points.join("; ").replace(/"/g, '""')}"`,
          `"${n.desires.join("; ").replace(/"/g, '""')}"`,
          `"${n.tags.join(", ").replace(/"/g, '""')}"`,
          n.language,
          n.review_date ?? n.created_at,
        ].join(",")
      );

      const blob = new Blob([header + csvRows.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `research-nuggets-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed:", e);
    } finally {
      setExporting(false);
    }
  };

  const hasData = stats && stats.totalNuggets > 0;

  return (
    <div>
      {/* Stats bar — just nuggets + this week + sources */}
      {stats && hasData && (
        <div className="flex items-center gap-6 mb-4 text-sm text-gray-500">
          <span><strong className="text-gray-900">{stats.totalNuggets.toLocaleString()}</strong> nuggets</span>
          <span><strong className="text-gray-900">{stats.nuggetsLast7Days}</strong> this week</span>
          <span><strong className="text-gray-900">{stats.totalSources}</strong> sources</span>
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1 text-sm text-gray-500">
          <Filter className="w-3.5 h-3.5" />
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearchSubmit();
            }}
            placeholder="Search..."
            className="border border-gray-300 rounded pl-7 pr-2 py-1 text-sm bg-white w-40 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchInput("");
                setSearchQuery("");
                resetPage();
              }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Significance */}
        <select
          value={minSig}
          onChange={(e) => {
            setMinSig(parseInt(e.target.value));
            resetPage();
          }}
          className={`border rounded px-2 py-1 text-sm bg-white ${minSig !== 4 ? "border-indigo-400 bg-indigo-50" : "border-gray-300"}`}
        >
          <option value={1}>All scores</option>
          <option value={4}>Useful (4+)</option>
          <option value={6}>Good (6+)</option>
          <option value={8}>Best (8+)</option>
        </select>

        {/* Platform */}
        <select
          value={platform}
          onChange={(e) => {
            setPlatform(e.target.value);
            setSourceId("");
            resetPage();
          }}
          className={`border rounded px-2 py-1 text-sm bg-white ${platform ? "border-indigo-400 bg-indigo-50" : "border-gray-300"}`}
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
          className={`border rounded px-2 py-1 text-sm bg-white ${sourceId ? "border-indigo-400 bg-indigo-50" : "border-gray-300"}`}
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
          className={`border rounded px-2 py-1 text-sm bg-white ${sentiment ? "border-indigo-400 bg-indigo-50" : "border-gray-300"}`}
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

        {/* Result count + actions */}
        <div className="flex items-center gap-2 ml-auto">
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Clear all
            </button>
          )}
          {hasData && (
            <button
              onClick={exportCsv}
              disabled={exporting}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
              title="Export filtered nuggets as CSV"
            >
              <Download className="w-3 h-3" />
              {exporting ? "..." : "CSV"}
            </button>
          )}
          <span className="text-sm text-gray-500">
            {total} result{total !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex gap-6">
        {/* Nugget cards */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-4 h-4 bg-gray-200 rounded" />
                    <div className="h-4 bg-gray-200 rounded w-32" />
                    <div className="h-3 bg-gray-100 rounded w-12" />
                    <div className="ml-auto h-5 bg-gray-100 rounded-full w-14" />
                  </div>
                  <div className="h-4 bg-gray-100 rounded w-full mb-1.5" />
                  <div className="h-4 bg-gray-100 rounded w-3/4" />
                </div>
              ))}
            </div>
          ) : nuggets.length === 0 ? (
            <div className="text-center py-16 bg-white border border-gray-200 rounded-lg">
              {activeFilterCount > 0 ? (
                <>
                  <Search className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-2">No nuggets match the current filters.</p>
                  <button
                    onClick={clearAllFilters}
                    className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Clear all filters
                  </button>
                </>
              ) : (
                <>
                  <Database className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-1">No research nuggets yet.</p>
                  <p className="text-sm text-gray-400 mb-4">Add sources and run a scan to start collecting customer insights.</p>
                  <Link
                    href="/research?tab=sources"
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                  >
                    Add Your First Source
                  </Link>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {nuggets.map((n) => (
                <NuggetCard
                  key={n.id}
                  nugget={n}
                  activeTag={activeTag}
                  onTagClick={(tag) => {
                    setActiveTag(tag === activeTag ? "" : tag);
                    resetPage();
                  }}
                  expanded={expandedId === n.id}
                  onToggleExpand={() => setExpandedId(expandedId === n.id ? null : n.id)}
                />
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

        {/* Right sidebar - tag cloud (only when data exists) */}
        {hasData && stats && stats.topTags.length > 0 && (
          <div className="hidden lg:block w-52 flex-shrink-0">
            <div className="sticky top-24">
              <div className="bg-white border border-gray-200 rounded-lg p-3">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Top Tags
                </h4>
                <div className="flex flex-wrap gap-1">
                  {stats.topTags.map(({ tag, count }) => (
                    <button
                      key={tag}
                      onClick={() => {
                        setActiveTag(tag === activeTag ? "" : tag);
                        resetPage();
                      }}
                      className={`text-xs px-2 py-0.5 rounded transition-colors ${
                        tag === activeTag
                          ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300"
                          : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                      }`}
                      title={`${count} nuggets`}
                    >
                      {tag}
                      <span className="ml-1 text-gray-400">{count}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Individual nugget card — clean, readable, minimal */
function NuggetCard({
  nugget: n,
  activeTag,
  onTagClick,
  expanded,
  onToggleExpand,
}: {
  nugget: Nugget;
  activeTag: string;
  onTagClick: (tag: string) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const sentBadge = SENTIMENT_BADGE[n.sentiment] ?? SENTIMENT_BADGE.neutral;
  // Only show Swedish flag (primary market), hide others to reduce noise
  const showFlag = n.language === "sv";

  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-gray-300 transition-colors">
      {/* Header: platform icon + source + stars + date + sentiment */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <PlatformIcon platform={n.research_sources?.platform} />
          <span className="text-sm font-medium text-gray-900 truncate">
            {n.research_sources?.name ?? n.competitor_name}
          </span>
          {n.review_stars > 0 && (
            <span className="inline-flex items-center gap-px flex-shrink-0">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`w-3 h-3 ${
                    i < n.review_stars ? "text-yellow-400" : "text-gray-200"
                  }`}
                  fill={i < n.review_stars ? "currentColor" : "none"}
                  strokeWidth={i < n.review_stars ? 0 : 1.5}
                />
              ))}
            </span>
          )}
          {showFlag && (
            <span className="text-xs flex-shrink-0">{"\u{1F1F8}\u{1F1EA}"}</span>
          )}
          <span className="text-xs text-gray-400 flex-shrink-0" title={n.review_date ?? n.created_at}>
            {timeAgo(n.review_date ?? n.created_at)}
          </span>
        </div>
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${sentBadge}`}>
          {n.sentiment}
        </span>
      </div>

      {/* Summary — the main content, should be easy to read */}
      <p className="text-sm text-gray-700 leading-relaxed mb-2">{n.summary}</p>

      {/* Customer phrases — the real gold, shown as italic quotes */}
      {n.customer_phrases.length > 0 && (
        <div className="mb-2">
          {n.customer_phrases.map((phrase, i) => (
            <span
              key={i}
              className="inline-block text-xs text-gray-500 italic mr-2 mb-0.5"
            >
              &ldquo;{phrase}&rdquo;
            </span>
          ))}
        </div>
      )}

      {/* Tags + actions row */}
      <div className="flex items-center gap-1.5">
        {n.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 flex-1">
            {n.tags.map((tag) => (
              <button
                key={tag}
                onClick={() => onTagClick(tag)}
                className={`text-[11px] px-1.5 py-0.5 rounded transition-colors ${
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
        <div className="flex items-center gap-0.5 flex-shrink-0 ml-auto">
          <Link
            href={`/brainstorm?insight=${encodeURIComponent(n.summary)}`}
            className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 px-1.5 py-0.5 rounded hover:bg-indigo-50"
            title="Use this insight in brainstorm"
          >
            <Sparkles className="w-3 h-3" />
            Use
          </Link>
          <button
            onClick={onToggleExpand}
            className="inline-flex items-center gap-0.5 text-xs text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-50"
            title={expanded ? "Hide original review" : "Show original review"}
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Original
          </button>
        </div>
      </div>

      {/* Expanded: original review text */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          {n.review_title && (
            <p className="text-sm font-medium text-gray-800 mb-1">{n.review_title}</p>
          )}
          <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{n.review_text}</p>
          <p className="text-xs text-gray-400 mt-1.5">
            — {n.reviewer_name}{n.review_date ? `, ${new Date(n.review_date).toLocaleDateString()}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

/** Platform icon — small, inline, just for recognition */
function PlatformIcon({ platform }: { platform?: string }) {
  switch (platform) {
    case "trustpilot":
      return <SiTrustpilot className="w-3.5 h-3.5 text-[#00B67A] flex-shrink-0" />;
    case "reddit":
      return <SiReddit className="w-3.5 h-3.5 text-[#FF4500] flex-shrink-0" />;
    case "amazon":
      return <FaAmazon className="w-3.5 h-3.5 text-[#FF9900] flex-shrink-0" />;
    case "apify_instagram":
      return <SiInstagram className="w-3.5 h-3.5 text-[#E4405F] flex-shrink-0" />;
    case "apify_facebook":
    case "facebook_group":
      return <SiFacebook className="w-3.5 h-3.5 text-[#1877F2] flex-shrink-0" />;
    case "apify_tiktok":
      return <SiTiktok className="w-3.5 h-3.5 flex-shrink-0" />;
    case "manual_import":
      return <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />;
    default:
      return null;
  }
}
