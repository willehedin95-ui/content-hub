"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart3,
  ExternalLink,
  Loader2,
  Rocket,
  RefreshCw,
  Filter,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import KpiCard from "@/components/pulse/KpiCard";

const META_AD_ACCOUNT_ID = process.env.NEXT_PUBLIC_META_AD_ACCOUNT_ID || "";

// ── Types ──

interface KpiValue {
  value: number;
  change: number | null;
}

interface SparklinePoint {
  date: string;
  spend: number;
  revenue: number;
  roas: number;
  cpa: number;
  purchases: number;
}

interface DashboardKpis {
  spend: KpiValue;
  revenue: KpiValue;
  roas: KpiValue;
  cpa: KpiValue;
  purchases: KpiValue;
  sparklines: SparklinePoint[];
}

interface CampaignRow {
  campaign_id: string;
  campaign_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  purchases: number;
  revenue: number;
  roas: number;
  cpa: number;
  frequency: number;
  adset_ids: string[];
}

interface BreakdownItem {
  headline?: string;
  copy?: string;
  image_url?: string;
  spend: number;
  revenue: number;
  roas: number;
  purchases: number;
  ctr: number;
}

interface DashboardData {
  kpis: DashboardKpis | null;
  campaigns: CampaignRow[];
  creative_breakdown: {
    headlines: BreakdownItem[];
    copies: BreakdownItem[];
    images: BreakdownItem[];
  };
}

interface LearningInfo {
  adset_id: string;
  adset_name: string;
  campaign_id: string;
  learning_phase: "active" | "learning" | "learning_limited" | "unknown";
}

type SortField =
  | "campaign_name"
  | "spend"
  | "impressions"
  | "clicks"
  | "ctr"
  | "cpc"
  | "purchases"
  | "revenue"
  | "roas"
  | "cpa"
  | "frequency";

type BreakdownTab = "headlines" | "copies" | "images";

// ── Helpers ──

function formatCurrency(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k kr`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k kr`;
  return `${Math.round(n)} kr`;
}

function formatRoas(n: number): string {
  return `${n.toFixed(2)}x`;
}

function roasColor(roas: number): string {
  if (roas < 1) return "text-red-600";
  if (roas < 2) return "text-amber-600";
  return "text-green-600";
}

function roasStatus(roas: number): "critical" | "warning" | "healthy" {
  if (roas < 1) return "critical";
  if (roas < 2) return "warning";
  return "healthy";
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function metaCampaignUrl(campaignId: string): string {
  return `https://business.facebook.com/adsmanager/manage/campaigns?act=${META_AD_ACCOUNT_ID}&selected_campaign_ids=${campaignId}`;
}

// ── Learning Phase Badge ──

function getLearningStatus(
  adsetIds: string[],
  learningMap: Map<string, LearningInfo>
): "active" | "learning" | "learning_limited" | "unknown" {
  let worst: "active" | "learning" | "learning_limited" | "unknown" = "active";
  let hasAny = false;

  for (const id of adsetIds) {
    const info = learningMap.get(id);
    if (!info) continue;
    hasAny = true;

    if (info.learning_phase === "learning_limited") return "learning_limited";
    if (info.learning_phase === "learning") worst = "learning";
    if (info.learning_phase === "unknown" && worst === "active") worst = "unknown";
  }

  return hasAny ? worst : "unknown";
}

function LearningBadge({ status }: { status: "active" | "learning" | "learning_limited" | "unknown" }) {
  const config = {
    active: { dot: "bg-green-500", text: "Active", textColor: "text-green-700", bg: "bg-green-50" },
    learning: { dot: "bg-yellow-500", text: "Learning", textColor: "text-yellow-700", bg: "bg-yellow-50" },
    learning_limited: { dot: "bg-red-500", text: "Limited", textColor: "text-red-700", bg: "bg-red-50" },
    unknown: { dot: "bg-gray-400", text: "Unknown", textColor: "text-gray-600", bg: "bg-gray-50" },
  }[status];

  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium", config.bg, config.textColor)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
      {config.text}
    </span>
  );
}

// ── Main Component ──

export default function MetaAdsDashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [learningPhase, setLearningPhase] = useState<Map<string, LearningInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState(7);
  const [country, setCountry] = useState("all");
  const [sortField, setSortField] = useState<SortField>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [breakdownTab, setBreakdownTab] = useState<BreakdownTab>("headlines");
  const [minSpend, setMinSpend] = useState(100);
  const [actionState, setActionState] = useState<{
    loading: string | null;
    results: Record<string, { ok: boolean; message: string }>;
  }>({ loading: null, results: {} });
  const [expandedCopies, setExpandedCopies] = useState<Set<number>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, learningRes] = await Promise.all([
        fetch(`/api/meta-ads/dashboard?days=${period}&country=${country}`),
        fetch("/api/meta-ads/learning-phase"),
      ]);

      if (!dashRes.ok) {
        const errBody = await dashRes.json().catch(() => null);
        throw new Error(errBody?.error || `Dashboard API returned ${dashRes.status}`);
      }

      const dashData: DashboardData = await dashRes.json();
      setData(dashData);

      if (learningRes.ok) {
        const learningData = await learningRes.json();
        const map = new Map<string, LearningInfo>();
        for (const adset of learningData.adsets || []) {
          map.set(adset.adset_id, adset);
        }
        setLearningPhase(map);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [period, country]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Scale Action ──

  async function handleScale(campaignId: string, campaignName: string) {
    const key = `scale-${campaignId}`;
    setActionState((s) => ({ ...s, loading: key }));
    try {
      const res = await fetch("/api/morning-brief/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "scale_winner",
          campaign_id: campaignId,
          campaign_name: campaignName,
        }),
      });
      const result = await res.json();
      setActionState((s) => ({
        loading: null,
        results: {
          ...s.results,
          [key]: {
            ok: result.ok,
            message: result.ok
              ? `Scaled to ${result.new_budget} kr/day`
              : result.error || "Failed",
          },
        },
      }));
    } catch {
      setActionState((s) => ({
        loading: null,
        results: { ...s.results, [key]: { ok: false, message: "Network error" } },
      }));
    }
  }

  // ── Sort Campaigns ──

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function sortedCampaigns(): CampaignRow[] {
    if (!data) return [];
    return [...data.campaigns].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      const numA = Number(aVal) || 0;
      const numB = Number(bVal) || 0;
      return sortDir === "asc" ? numA - numB : numB - numA;
    });
  }

  // ── Sort Header Component ──

  function SortHeader({ field, label, className }: { field: SortField; label: string; className?: string }) {
    const active = sortField === field;
    return (
      <th
        className={cn(
          "px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none whitespace-nowrap",
          className
        )}
        onClick={() => handleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active && (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
        </span>
      </th>
    );
  }

  // ── Loading State ──

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="flex items-center justify-between">
            <div className="h-8 w-40 bg-gray-200 rounded" />
            <div className="flex gap-2">
              <div className="h-9 w-20 bg-gray-200 rounded" />
              <div className="h-9 w-20 bg-gray-200 rounded" />
              <div className="h-9 w-20 bg-gray-200 rounded" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-36 bg-gray-200 rounded-lg" />
            ))}
          </div>
          <div className="h-64 bg-gray-200 rounded-lg" />
          <div className="h-48 bg-gray-200 rounded-lg" />
        </div>
      </div>
    );
  }

  // ── Error State ──

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Meta Ads</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-800 font-medium">{error}</p>
          <button
            onClick={fetchData}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-md text-sm hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const campaigns = sortedCampaigns();
  const kpis = data.kpis;

  // Map sparklines for each KPI
  const spendSparkline = kpis?.sparklines.map((p) => ({ date: p.date, value: p.spend })) || [];
  const revenueSparkline = kpis?.sparklines.map((p) => ({ date: p.date, value: p.revenue })) || [];
  const roasSparkline = kpis?.sparklines.map((p) => ({ date: p.date, value: p.roas })) || [];
  const cpaSparkline = kpis?.sparklines.map((p) => ({ date: p.date, value: p.cpa })) || [];
  const purchasesSparkline = kpis?.sparklines.map((p) => ({ date: p.date, value: p.purchases })) || [];

  // Filtered breakdown items
  const breakdownItems = (() => {
    const items = data.creative_breakdown[breakdownTab] || [];
    return items.filter((item) => item.spend >= minSpend).sort((a, b) => b.roas - a.roas);
  })();

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-900">Meta Ads</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Period selector */}
          <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setPeriod(d)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium transition-colors",
                  period === d
                    ? "bg-indigo-600 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                )}
              >
                {d}d
              </button>
            ))}
          </div>

          {/* Country filter */}
          <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden">
            {(["all", "SE", "NO", "DK"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCountry(c)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium transition-colors",
                  country === c
                    ? "bg-indigo-600 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                )}
              >
                {c === "all" ? "All" : c}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      {kpis && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard
            label="Ad Spend"
            value={formatCurrency(kpis.spend.value)}
            changePercent={kpis.spend.change}
            sparklineData={spendSparkline}
          />
          <KpiCard
            label="Revenue"
            value={formatCurrency(kpis.revenue.value)}
            changePercent={kpis.revenue.change}
            sparklineData={revenueSparkline}
          />
          <KpiCard
            label="ROAS"
            value={formatRoas(kpis.roas.value)}
            changePercent={kpis.roas.change}
            sparklineData={roasSparkline}
            status={roasStatus(kpis.roas.value)}
          />
          <KpiCard
            label="CPA"
            value={formatCurrency(kpis.cpa.value)}
            changePercent={kpis.cpa.change}
            sparklineData={cpaSparkline}
          />
          <KpiCard
            label="Purchases"
            value={String(Math.round(kpis.purchases.value))}
            changePercent={kpis.purchases.change}
            sparklineData={purchasesSparkline}
          />
        </div>
      )}

      {/* ── Campaign Table ── */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            Campaigns
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({campaigns.length})
            </span>
          </h2>
        </div>

        {campaigns.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-500">
            <BarChart3 className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p>No campaign data for this period</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <SortHeader field="campaign_name" label="Name" className="min-w-[200px]" />
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Phase
                  </th>
                  <SortHeader field="spend" label="Spend" />
                  <SortHeader field="impressions" label="Impr." />
                  <SortHeader field="clicks" label="Clicks" />
                  <SortHeader field="ctr" label="CTR" />
                  <SortHeader field="cpc" label="CPC" />
                  <SortHeader field="purchases" label="Purch." />
                  <SortHeader field="revenue" label="Revenue" />
                  <SortHeader field="roas" label="ROAS" />
                  <SortHeader field="cpa" label="CPA" />
                  <SortHeader field="frequency" label="Freq." />
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {campaigns.map((c) => {
                  const learningStatus = getLearningStatus(c.adset_ids, learningPhase);
                  const scaleKey = `scale-${c.campaign_id}`;
                  const scaleResult = actionState.results[scaleKey];
                  const isScaling = actionState.loading === scaleKey;

                  return (
                    <tr key={c.campaign_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-3 text-sm font-medium text-gray-900 max-w-[250px] truncate" title={c.campaign_name}>
                        {c.campaign_name}
                      </td>
                      <td className="px-3 py-3">
                        <LearningBadge status={learningStatus} />
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700 tabular-nums">{formatCurrency(c.spend)}</td>
                      <td className="px-3 py-3 text-sm text-gray-700 tabular-nums">{formatNumber(c.impressions)}</td>
                      <td className="px-3 py-3 text-sm text-gray-700 tabular-nums">{formatNumber(c.clicks)}</td>
                      <td className="px-3 py-3 text-sm text-gray-700 tabular-nums">{formatPct(c.ctr)}</td>
                      <td className="px-3 py-3 text-sm text-gray-700 tabular-nums">{formatCurrency(c.cpc)}</td>
                      <td className="px-3 py-3 text-sm text-gray-700 tabular-nums">{c.purchases}</td>
                      <td className="px-3 py-3 text-sm text-gray-700 tabular-nums">{formatCurrency(c.revenue)}</td>
                      <td className={cn("px-3 py-3 text-sm font-semibold tabular-nums", roasColor(c.roas))}>
                        {formatRoas(c.roas)}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700 tabular-nums">
                        {c.purchases > 0 ? formatCurrency(c.cpa) : "-"}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700 tabular-nums">{c.frequency.toFixed(1)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* Scale +20% */}
                          <button
                            onClick={() => handleScale(c.campaign_id, c.campaign_name)}
                            disabled={isScaling}
                            title="Scale budget +20%"
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors",
                              scaleResult?.ok
                                ? "bg-green-50 text-green-700 border border-green-200"
                                : "bg-white border border-gray-200 text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200"
                            )}
                          >
                            {isScaling ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Rocket className="w-3 h-3" />
                            )}
                            {scaleResult ? scaleResult.message : "+20%"}
                          </button>

                          {/* External link to Meta Ads Manager */}
                          <a
                            href={metaCampaignUrl(c.campaign_id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open in Meta Ads Manager"
                            className="inline-flex items-center p-1.5 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Creative Breakdown ── */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Creative Performance</h2>

            <div className="flex flex-wrap items-center gap-3">
              {/* Breakdown tabs */}
              <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden">
                {(["headlines", "copies", "images"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setBreakdownTab(tab)}
                    className={cn(
                      "px-3 py-1.5 text-sm font-medium transition-colors capitalize",
                      breakdownTab === tab
                        ? "bg-indigo-600 text-white"
                        : "text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    {tab === "copies" ? "Copy" : tab === "headlines" ? "Headlines" : "Images"}
                  </button>
                ))}
              </div>

              {/* Min spend filter */}
              <div className="inline-flex items-center gap-2 text-sm text-gray-600">
                <Filter className="w-3.5 h-3.5" />
                <span>Min spend:</span>
                <input
                  type="number"
                  value={minSpend}
                  onChange={(e) => setMinSpend(Number(e.target.value) || 0)}
                  className="w-20 px-2 py-1 border border-gray-200 rounded text-sm text-right tabular-nums"
                />
                <span>kr</span>
              </div>
            </div>
          </div>
        </div>

        {breakdownItems.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-500">
            <Filter className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p>No creative data above {minSpend} kr spend</p>
          </div>
        ) : (
          <div className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {breakdownItems.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
                >
                  {/* Image thumbnail for images tab */}
                  {breakdownTab === "images" && item.image_url && (
                    <div className="mb-3 rounded-lg overflow-hidden bg-gray-100 aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.image_url}
                        alt="Ad creative"
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  )}

                  {/* Image placeholder when no URL */}
                  {breakdownTab === "images" && !item.image_url && (
                    <div className="mb-3 rounded-lg overflow-hidden bg-gray-100 aspect-square flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-gray-300" />
                    </div>
                  )}

                  {/* Headline text */}
                  {breakdownTab === "headlines" && item.headline && (
                    <p className="text-sm font-medium text-gray-900 mb-3 line-clamp-3">
                      &ldquo;{item.headline}&rdquo;
                    </p>
                  )}

                  {/* Copy text */}
                  {breakdownTab === "copies" && item.copy && (
                    <div className="mb-3">
                      <p
                        className={cn(
                          "text-sm text-gray-700",
                          !expandedCopies.has(idx) && "line-clamp-4"
                        )}
                      >
                        {item.copy}
                      </p>
                      {item.copy.length > 150 && (
                        <button
                          onClick={() =>
                            setExpandedCopies((prev) => {
                              const next = new Set(prev);
                              if (next.has(idx)) next.delete(idx);
                              else next.add(idx);
                              return next;
                            })
                          }
                          className="text-xs text-indigo-600 hover:text-indigo-800 mt-1 font-medium"
                        >
                          {expandedCopies.has(idx) ? "Show less" : "Show more"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div>
                      <p className="text-xs text-gray-500">ROAS</p>
                      <p className={cn("text-sm font-semibold tabular-nums", roasColor(item.roas))}>
                        {formatRoas(item.roas)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Spend</p>
                      <p className="text-sm font-medium text-gray-900 tabular-nums">
                        {formatCurrency(item.spend)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Purchases</p>
                      <p className="text-sm font-medium text-gray-900 tabular-nums">
                        {item.purchases}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">CTR</p>
                      <p className="text-sm font-medium text-gray-900 tabular-nums">
                        {formatPct(item.ctr)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
