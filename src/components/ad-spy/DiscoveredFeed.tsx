"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, ExternalLink, Check, X, Clock, Search, Filter, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiscoveredAd {
  id: string;
  gethookd_ad_id: number;
  brand_name: string;
  title: string;
  body: string;
  landing_page: string;
  media_urls: string[];
  performance_score: number | null;
  performance_score_title: string | null;
  days_active: number | null;
  display_format: string;
  source: string;
  status: string;
  ai_relevance_score: number | null;
  ai_reasoning: string | null;
  pain_point: string | null;
  image_job_id: string | null;
  created_at: string;
  image_job: {
    id: string;
    name: string;
    concept_number: number;
    status: string;
    launchpad_priority: number | null;
    archived_at: string | null;
  } | null;
}

interface Stats {
  total: number;
  queued: number;
  swiping: number;
  swiped: number;
  skipped: number;
}

type SourceFilter = "all" | "board" | "brand_spy" | "explore";
type StatusFilter = "all" | "queued" | "swiped" | "skipped";

const SOURCE_LABELS: Record<SourceFilter, string> = {
  all: "All Sources",
  board: "Board",
  brand_spy: "Brand Spy",
  explore: "Explore",
};

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "All Status",
  queued: "Queued",
  swiped: "Swiped",
  skipped: "Skipped",
};

export default function DiscoveredFeed() {
  const [ads, setAds] = useState<DiscoveredAd[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<SourceFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchAds = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (source !== "all") params.set("source", source);
      if (status !== "all") params.set("status", status);
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/ad-spy/discovered?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setAds(data.ads ?? []);
      setStats(data.stats ?? null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [source, status, debouncedSearch]);

  useEffect(() => {
    fetchAds();
  }, [fetchAds]);

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      {stats && (
        <div className="flex gap-3">
          {[
            { label: "Total", value: stats.total, color: "bg-gray-100 text-gray-700" },
            { label: "Queued", value: stats.queued, color: "bg-amber-50 text-amber-700" },
            { label: "Swiped", value: stats.swiped, color: "bg-emerald-50 text-emerald-700" },
            { label: "Skipped", value: stats.skipped, color: "bg-red-50 text-red-600" },
          ].map((s) => (
            <div key={s.label} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium", s.color)}>
              {s.value} {s.label}
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search brand..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as SourceFilter)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {Object.entries(SOURCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading discovered ads...</span>
        </div>
      ) : ads.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          No discovered ads found. Autopilot will discover ads when it runs.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {ads.map((ad) => (
            <AdCard key={ad.id} ad={ad} />
          ))}
        </div>
      )}
    </div>
  );
}

function AdCard({ ad }: { ad: DiscoveredAd }) {
  const statusInfo = getStatusInfo(ad);
  const perfBadge = getPerfBadge(ad);

  return (
    <div className="group relative bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:border-indigo-200 transition-colors">
      {/* Thumbnail */}
      <div className="aspect-[4/5] bg-gray-100 relative overflow-hidden">
        {ad.media_urls?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ad.media_urls[0]} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <Sparkles className="w-8 h-8" />
          </div>
        )}
        {/* Performance badge */}
        {perfBadge && (
          <span className={cn(
            "absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
            perfBadge.className
          )}>
            {perfBadge.label}
          </span>
        )}
        {/* Source badge */}
        <span className={cn(
          "absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-medium",
          ad.source === "board" ? "bg-indigo-500/90 text-white" :
          ad.source === "brand_spy" ? "bg-purple-500/90 text-white" :
          "bg-gray-700/80 text-white"
        )}>
          {ad.source === "brand_spy" ? "Spy" : ad.source === "board" ? "Board" : "Explore"}
        </span>
        {/* Status overlay for swiped/skipped */}
        {ad.status === "swiped" && (
          <div className="absolute bottom-2 right-2">
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/90 text-white text-[10px] font-medium">
              <Check className="w-3 h-3" /> Swiped
            </span>
          </div>
        )}
        {ad.status === "skipped" && (
          <div className="absolute bottom-2 right-2">
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-500/80 text-white text-[10px] font-medium">
              <X className="w-3 h-3" /> Skipped
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-medium text-gray-800 truncate">{ad.brand_name}</span>
          {ad.days_active && (
            <span className="text-[10px] text-gray-400 whitespace-nowrap flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" /> {ad.days_active}d
            </span>
          )}
        </div>

        {/* AI score */}
        {ad.ai_relevance_score != null && (
          <div className="flex items-center gap-1.5" title={ad.ai_reasoning || undefined}>
            <div className="flex-1 h-1 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  ad.ai_relevance_score >= 8 ? "bg-emerald-500" :
                  ad.ai_relevance_score >= 6 ? "bg-amber-400" :
                  "bg-red-400"
                )}
                style={{ width: `${ad.ai_relevance_score * 10}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-500 tabular-nums">{ad.ai_relevance_score}/10</span>
          </div>
        )}

        {/* Body preview */}
        {ad.body && (
          <p className="text-[11px] text-gray-500 line-clamp-2 leading-tight">{ad.body}</p>
        )}

        {/* Concept link */}
        {ad.image_job && (
          <a
            href={`/images/${ad.image_job.id}`}
            className="inline-flex items-center gap-1 text-[10px] text-indigo-600 hover:underline"
          >
            #{ad.image_job.concept_number} {ad.image_job.name}
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
    </div>
  );
}

function getStatusInfo(ad: DiscoveredAd) {
  switch (ad.status) {
    case "swiped": return { label: "Swiped", icon: Check, className: "bg-emerald-50 text-emerald-600" };
    case "skipped": return { label: "Skipped", icon: X, className: "bg-red-50 text-red-600" };
    case "swiping": return { label: "Swiping", icon: Loader2, className: "bg-blue-50 text-blue-600" };
    default: return { label: "Queued", icon: Clock, className: "bg-amber-50 text-amber-600" };
  }
}

function getPerfBadge(ad: DiscoveredAd) {
  if (!ad.performance_score) return null;
  if (ad.performance_score >= 80) return { label: "Winning", className: "bg-emerald-500/90 text-white" };
  if (ad.performance_score >= 40) return { label: "Scaling", className: "bg-amber-500/90 text-white" };
  return { label: `${ad.performance_score}`, className: "bg-gray-700/80 text-white" };
}
