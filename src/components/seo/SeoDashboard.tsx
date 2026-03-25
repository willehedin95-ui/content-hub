"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Search, MousePointerClick, Eye, Target, RefreshCw } from "lucide-react";
import type { SeoOverview } from "@/types";

function TrendBadge({ value, suffix = "%", inverse = false }: { value: number | null; suffix?: string; inverse?: boolean }) {
  if (value === null || value === 0) return null;
  const isGood = inverse ? value < 0 : value > 0;
  return (
    <span className={`text-xs flex items-center gap-0.5 ${isGood ? "text-green-600" : "text-red-500"}`}>
      {isGood ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {value > 0 ? "+" : ""}{value}{suffix}
    </span>
  );
}

function KpiCard({ label, value, trend, trendSuffix, icon: Icon }: {
  label: string;
  value: string | number | null;
  trend?: number | null;
  trendSuffix?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500">{label}</span>
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <div className="text-2xl font-semibold text-gray-900">
        {value === null ? "—" : typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {trend !== undefined && trend !== null && (
        <div className="mt-1">
          <TrendBadge value={trend} suffix={trendSuffix} />
          <span className="text-xs text-gray-400 ml-1">vs prev. week</span>
        </div>
      )}
    </div>
  );
}

function MarketCard({ label, language, clicks, impressions, avgPosition }: {
  label: string;
  language: string;
  clicks: number;
  impressions: number;
  avgPosition: number | null;
}) {
  const flag = language === "sv" ? "\u{1F1F8}\u{1F1EA}" : language === "da" ? "\u{1F1E9}\u{1F1F0}" : language === "no" ? "\u{1F1F3}\u{1F1F4}" : "";
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{flag}</span>
        <span className="text-sm font-medium text-gray-900">{label}</span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-lg font-semibold text-gray-900">{clicks.toLocaleString()}</div>
          <div className="text-xs text-gray-500">Clicks</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-gray-900">{impressions.toLocaleString()}</div>
          <div className="text-xs text-gray-500">Impressions</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-gray-900">{avgPosition ?? "—"}</div>
          <div className="text-xs text-gray-500">Avg Position</div>
        </div>
      </div>
    </div>
  );
}

export default function SeoDashboard() {
  const [data, setData] = useState<SeoOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/seo/overview");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/seo/sync", { method: "POST" });
      if (res.ok) {
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Sync failed");
      }
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
              <div className="h-8 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // No data yet — show helpful empty state with sync button
  if (!data || (data.totalKeywords === 0 && data.byProperty.length === 0)) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            {data?.lastSyncedAt && (
              <p className="text-xs text-gray-400">
                Last synced: {new Date(data.lastSyncedAt).toLocaleDateString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No SEO Data Yet</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Your GSC properties are configured. It takes a few weeks after publishing blog articles before Google indexes them and search data appears here.
          </p>
          <p className="text-xs text-gray-400 mt-2 max-w-md mx-auto">
            Data syncs automatically every Monday. You can also click Sync Now above to check manually.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with sync button */}
      <div className="flex items-center justify-between">
        <div>
          {data.lastSyncedAt && (
            <p className="text-xs text-gray-400">
              Last synced: {new Date(data.lastSyncedAt).toLocaleDateString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync Now"}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Keywords Tracked" value={data.totalKeywords} icon={Search} />
        <KpiCard label="Clicks (7d)" value={data.totalClicks} trend={data.clicksTrend} icon={MousePointerClick} />
        <KpiCard label="Impressions (7d)" value={data.totalImpressions} trend={data.impressionsTrend} icon={Eye} />
        <KpiCard
          label="Avg Position"
          value={data.avgPosition}
          trend={data.positionTrend}
          trendSuffix=" pos"
          icon={Target}
        />
      </div>

      {/* Per-Market Cards */}
      {data.byProperty.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">By Market</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.byProperty.map((p) => (
              <MarketCard
                key={p.property}
                label={p.label}
                language={p.language}
                clicks={p.totalClicks}
                impressions={p.totalImpressions}
                avgPosition={p.avgPosition}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
