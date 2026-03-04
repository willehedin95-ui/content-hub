"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  RefreshCw,
  Zap,
  Trophy,
  ThumbsDown,
  ExternalLink,
  Loader2,
  CheckCircle2,
  X,
  Ban,
  Rocket,
  Palette,
  ArrowLeftRight,
  Globe,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const META_AD_ACCOUNT_ID = process.env.NEXT_PUBLIC_META_AD_ACCOUNT_ID || "";

function metaAdUrl(adId: string) {
  return `https://business.facebook.com/adsmanager/manage/ads?act=${META_AD_ACCOUNT_ID}&selected_ad_ids=${adId}`;
}

// ── Types ──

interface Campaign {
  campaign_id: string;
  campaign_name: string;
  spend: number;
  active_ads: number;
}

interface SpendPacing {
  date: string;
  total_spend: number;
  total_purchases: number;
  total_revenue: number;
  blended_roas: number;
  campaigns: Campaign[];
}

interface WhatsRunning {
  date: string;
  active_campaigns: number;
  total_active_ads: number;
  campaigns: Array<{
    campaign_id: string;
    campaign_name: string;
    active_ads: number;
  }>;
}

interface PeriodMetrics {
  spend: number;
  revenue: number;
  purchases: number;
  roas: number;
  cpa: number;
  avg_ctr: number;
  avg_cpc: number;
  avg_frequency: number;
}

interface CampaignTrend {
  campaign_id: string;
  campaign_name: string;
  current_7d: PeriodMetrics;
  previous_7d: PeriodMetrics;
  trend: { roas: string; cpa: string; spend: string };
}

interface AdRanking {
  ad_id: string;
  ad_name: string | null;
  adset_name: string | null;
  campaign_name: string | null;
  spend: number;
  purchases: number;
  roas: number;
  cpa: number;
  ctr: number;
  frequency: number;
}

interface FatigueSignal {
  ad_id: string;
  ad_name: string | null;
  campaign_name: string | null;
  signal: string;
  detail: string;
}

interface Bleeder {
  ad_id: string;
  ad_name: string | null;
  adset_name: string | null;
  campaign_name: string | null;
  days_bleeding: number;
  total_spend: number;
  purchases: number;
  avg_cpa: number;
  campaign_avg_cpa: number;
  avg_ctr: number;
}

interface ConsistentWinner {
  ad_id: string;
  adset_id: string | null;
  campaign_id: string;
  ad_name: string | null;
  adset_name: string | null;
  campaign_name: string | null;
  consistent_days: number;
  total_spend: number;
  total_purchases: number;
  avg_roas: number;
  avg_cpa: number;
  avg_ctr: number;
  image_job_id: string | null;
}

interface LpVsCreativeFatigue {
  ad_id: string;
  ad_name: string | null;
  adset_name: string | null;
  campaign_name: string | null;
  diagnosis: "landing_page" | "creative";
  detail: string;
}

interface EfficiencyScore {
  campaign_id: string | null;
  campaign_name: string;
  spend_7d: number;
  roas_7d: number;
  avg_ctr: number;
  avg_cpc: number;
  purchases_7d: number;
  efficiency_score: number;
  current_budget_share: number;
  recommended_budget_share: number;
  recommendation: "increase" | "decrease" | "maintain";
}

interface ActionCard {
  id: string;
  type: "pause" | "scale" | "refresh" | "budget" | "landing_page";
  category: string;
  title: string;
  why: string;
  guidance: string;
  expected_impact: string;
  action_data: Record<string, unknown>;
  priority: number;
  ad_name?: string | null;
  adset_name?: string | null;
  campaign_name?: string | null;
  image_url?: string | null;
}

// ── Action card visual config per type ──

const ACTION_CONFIG: Record<
  ActionCard["type"],
  {
    Icon: React.ComponentType<{ className?: string }>;
    iconBg: string;
    iconColor: string;
    borderColor: string;
    tagColor: string;
    buttonLabel: string;
    buttonColor: string;
  }
> = {
  pause: {
    Icon: Ban,
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
    borderColor: "border-l-4 border-l-red-400",
    tagColor: "bg-red-50 text-red-700",
    buttonLabel: "Pause this ad",
    buttonColor: "text-white bg-red-600 hover:bg-red-700",
  },
  scale: {
    Icon: Rocket,
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
    borderColor: "border-l-4 border-l-green-400",
    tagColor: "bg-green-50 text-green-700",
    buttonLabel: "Increase budget +20%",
    buttonColor: "text-white bg-green-600 hover:bg-green-700",
  },
  refresh: {
    Icon: Palette,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    borderColor: "border-l-4 border-l-amber-400",
    tagColor: "bg-amber-50 text-amber-700",
    buttonLabel: "Create new ads",
    buttonColor: "text-white bg-amber-600 hover:bg-amber-700",
  },
  budget: {
    Icon: ArrowLeftRight,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    borderColor: "border-l-4 border-l-blue-400",
    tagColor: "bg-blue-50 text-blue-700",
    buttonLabel: "Rebalance budgets",
    buttonColor: "text-white bg-blue-600 hover:bg-blue-700",
  },
  landing_page: {
    Icon: Globe,
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
    borderColor: "border-l-4 border-l-purple-400",
    tagColor: "bg-purple-50 text-purple-700",
    buttonLabel: "Review landing pages",
    buttonColor: "text-white bg-purple-600 hover:bg-purple-700",
  },
};

interface MorningBriefData {
  generated_at: string;
  data_date: string;
  questions: {
    spend_pacing: SpendPacing;
    whats_running: WhatsRunning;
    performance_trends: CampaignTrend[];
    winners_losers: { winners: AdRanking[]; losers: AdRanking[] };
    fatigue_signals: {
      critical: FatigueSignal[];
      warning: FatigueSignal[];
      monitor: FatigueSignal[];
    };
  };
  signals: {
    bleeders: Bleeder[];
    consistent_winners: ConsistentWinner[];
    lp_vs_creative_fatigue: LpVsCreativeFatigue[];
    efficiency_scoring: EfficiencyScore[];
  };
  action_cards: ActionCard[];
}

// ── Helpers ──

function formatCurrency(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k kr`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k kr`;
  return `${n.toFixed(0)} kr`;
}

function formatRoas(n: number): string {
  return `${n.toFixed(2)}x`;
}

function TrendBadge({ direction, label }: { direction: string; label?: string }) {
  if (direction === "up")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
        <TrendingUp className="w-3 h-3" />
        {label || "Up"}
      </span>
    );
  if (direction === "down")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
        <TrendingDown className="w-3 h-3" />
        {label || "Down"}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
      <Minus className="w-3 h-3" />
      {label || "Stable"}
    </span>
  );
}

function changePct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// ── Main Component ──

export default function MorningBriefClient() {
  const [data, setData] = useState<MorningBriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const fetchBrief = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/morning-brief");
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  // Action state
  const [actionState, setActionState] = useState<{
    loading: string | null;
    results: Record<string, { ok: boolean; message: string }>;
  }>({ loading: null, results: {} });

  async function handleApply(card: ActionCard) {
    if (card.type === "refresh") {
      window.location.href = "/brainstorm";
      return;
    }
    if (card.type === "landing_page") {
      window.location.href = "/pages";
      return;
    }

    setActionState((s) => ({ ...s, loading: card.id }));
    try {
      const res = await fetch("/api/morning-brief/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(card.action_data),
      });
      const result = await res.json();
      setActionState((s) => ({
        loading: null,
        results: {
          ...s.results,
          [card.id]: {
            ok: result.ok,
            message: result.ok ? "Done!" : result.error || "Failed",
          },
        },
      }));
    } catch {
      setActionState((s) => ({
        loading: null,
        results: {
          ...s.results,
          [card.id]: { ok: false, message: "Network error" },
        },
      }));
    }
  }

  useEffect(() => {
    fetchBrief();
  }, []);

  if (loading) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-200 rounded-lg" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-40 bg-gray-200 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Daily Actions</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-800 font-medium">{error}</p>
          <button
            onClick={fetchBrief}
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

  const { spend_pacing, whats_running, performance_trends, winners_losers } =
    data.questions;

  const visibleActions = (data.action_cards ?? []).filter(
    (c) => !dismissed.has(c.id)
  );

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      {/* 1. Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Zap className="w-6 h-6 text-indigo-600" />
            Daily Actions
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {data.data_date} &middot; Generated{" "}
            {new Date(data.generated_at).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <button
          onClick={fetchBrief}
          className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-md text-sm hover:bg-gray-50 text-gray-700"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* 2. Compact KPI strip */}
      <div className="bg-white border border-gray-200 rounded-lg px-5 py-3">
        <div className="flex items-center gap-6 text-sm text-gray-600">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            Yesterday
          </span>
          <span className="text-gray-200">|</span>
          <span>
            Spend:{" "}
            <span className="font-semibold text-gray-900">
              {formatCurrency(spend_pacing.total_spend)}
            </span>
          </span>
          <span className="text-gray-200">|</span>
          <span>
            Revenue:{" "}
            <span className="font-semibold text-gray-900">
              {formatCurrency(spend_pacing.total_revenue)}
            </span>
          </span>
          <span className="text-gray-200">|</span>
          <span>
            ROAS:{" "}
            <span className="font-semibold text-gray-900">
              {formatRoas(spend_pacing.blended_roas)}
            </span>
          </span>
          <span className="text-gray-200">|</span>
          <span>
            Purchases:{" "}
            <span className="font-semibold text-gray-900">
              {spend_pacing.total_purchases}
            </span>
          </span>
        </div>
      </div>

      {/* 3. Action Cards — single column, Madgicx-style */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-gray-700">
            {visibleActions.length} action{visibleActions.length !== 1 ? "s" : ""} today
          </h2>
        </div>

        {visibleActions.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <p className="text-green-800 font-semibold text-lg">All clear</p>
            <p className="text-green-700 text-sm mt-1">
              No actions needed today. Your campaigns are running well.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleActions.map((card) => {
              const config = ACTION_CONFIG[card.type];
              const result = actionState.results[card.id];
              const isLoading = actionState.loading === card.id;
              const TypeIcon = config.Icon;

              return (
                <div
                  key={card.id}
                  className={cn(
                    "bg-white border border-gray-200 rounded-lg overflow-hidden",
                    config.borderColor
                  )}
                >
                  {/* Main row */}
                  <div className="flex items-center gap-4 p-4">
                    {/* Type icon */}
                    <div
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                        config.iconBg
                      )}
                    >
                      <TypeIcon className={cn("w-5 h-5", config.iconColor)} />
                    </div>

                    {/* Ad image */}
                    {card.image_url && (
                      <img
                        src={card.image_url}
                        alt=""
                        className="w-10 h-10 rounded-lg object-cover shrink-0 border border-gray-200"
                      />
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900">
                        {card.title}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                        {card.why}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {card.campaign_name && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 truncate max-w-[200px]">
                            {card.campaign_name}
                          </span>
                        )}
                        <span
                          className={cn(
                            "text-[11px] px-2 py-0.5 rounded-full font-medium",
                            config.tagColor
                          )}
                        >
                          {card.category}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {result ? (
                        <span
                          className={cn(
                            "text-xs font-medium px-3 py-2 rounded-md",
                            result.ok
                              ? "bg-green-50 text-green-700"
                              : "bg-red-50 text-red-700"
                          )}
                        >
                          {result.ok ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                              Done
                            </>
                          ) : (
                            result.message
                          )}
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() =>
                              setDismissed((prev) =>
                                new Set(prev).add(card.id)
                              )
                            }
                            className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
                            title="Dismiss"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleApply(card)}
                            disabled={!!actionState.loading}
                            className={cn(
                              "px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 whitespace-nowrap",
                              config.buttonColor
                            )}
                          >
                            {isLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              config.buttonLabel
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expandable guidance */}
                  {card.guidance && !result && (
                    <details className="border-t border-gray-100 group">
                      <summary className="px-4 py-2 text-xs text-indigo-600 cursor-pointer hover:bg-gray-50 select-none flex items-center gap-1">
                        <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
                        Why should I do this?
                      </summary>
                      <div className="px-4 pb-3 text-xs text-gray-600 leading-relaxed pl-8">
                        {card.guidance}
                        {card.expected_impact && (
                          <p className="mt-1.5 font-medium text-gray-700">
                            Expected impact: {card.expected_impact}
                          </p>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Collapsible detail sections */}

      {/* Campaign Trends */}
      <details className="bg-white border border-gray-200 rounded-lg">
        <summary className="px-5 py-3 cursor-pointer text-sm font-semibold text-gray-900 hover:bg-gray-50 rounded-lg select-none">
          Campaign Trends
          <span className="text-xs font-normal text-gray-500 ml-2">
            7d vs previous 7d
          </span>
        </summary>
        <div className="px-5 pb-5 space-y-3">
          {performance_trends.map((ct) => (
            <CampaignCard key={ct.campaign_id} trend={ct} />
          ))}
        </div>
      </details>

      {/* Winners & Losers */}
      <details className="bg-white border border-gray-200 rounded-lg">
        <summary className="px-5 py-3 cursor-pointer text-sm font-semibold text-gray-900 hover:bg-gray-50 rounded-lg select-none">
          Winners & Losers
          <span className="text-xs font-normal text-gray-500 ml-2">
            Top/bottom 5 by ROAS
          </span>
        </summary>
        <div className="px-5 pb-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AdTable
              title="Top Performers"
              icon={<Trophy className="w-4 h-4 text-green-600" />}
              ads={winners_losers.winners}
              type="winner"
            />
            <AdTable
              title="Underperformers"
              icon={<ThumbsDown className="w-4 h-4 text-red-500" />}
              ads={winners_losers.losers}
              type="loser"
            />
          </div>
        </div>
      </details>

      {/* Recent Actions */}
      <details className="bg-white border border-gray-200 rounded-lg">
        <summary className="px-5 py-3 cursor-pointer text-sm font-semibold text-gray-900 hover:bg-gray-50 rounded-lg select-none">
          Recent Actions
          <span className="text-xs font-normal text-gray-500 ml-2">
            Activity log
          </span>
        </summary>
        <div className="px-5 pb-5">
          <RecentActionsContent />
        </div>
      </details>
    </div>
  );
}

// ── Sub-Components ──

function RecentActionsContent() {
  const [learnings, setLearnings] = useState<
    Array<{
      id: string;
      meta_ad_id: string;
      ad_name: string | null;
      campaign_name: string | null;
      event_type: string;
      detail: string;
      created_at: string;
    }>
  >([]);

  useEffect(() => {
    fetch("/api/ad-learnings?limit=10")
      .then((r) => r.json())
      .then((d) => setLearnings(d.learnings ?? []))
      .catch(() => {});
  }, []);

  const eventIcons: Record<string, string> = {
    paused_bleeder: "🛑",
    graduated_winner: "🚀",
    fatigue_detected: "⚠️",
    creative_refresh: "🔄",
    budget_shifted: "⚡",
    manual_note: "📝",
  };

  if (learnings.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-4">
        No recent actions recorded
      </p>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {learnings.map((l) => (
        <div key={l.id} className="py-3 flex items-start gap-2">
          <span className="text-base shrink-0 mt-0.5">
            {eventIcons[l.event_type] || "📋"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 truncate">
              {l.ad_name || "Unknown"}
            </p>
            <p className="text-xs text-gray-500">{l.detail}</p>
            <p className="text-xs text-gray-400 mt-1">
              {new Date(l.created_at).toLocaleDateString()}{" "}
              {new Date(l.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function CampaignCard({ trend }: { trend: CampaignTrend }) {
  const curr = trend.current_7d;
  const prev = trend.previous_7d;
  const hasPrev = prev.spend > 0;

  const spendChange = changePct(curr.spend, prev.spend);
  const roasChange = changePct(curr.roas, prev.roas);

  return (
    <div className="border border-gray-100 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 text-sm">
          {trend.campaign_name}
        </h3>
        <div className="flex items-center gap-2">
          <TrendBadge
            direction={trend.trend.roas}
            label={`ROAS ${trend.trend.roas}`}
          />
          <TrendBadge
            direction={trend.trend.cpa}
            label={`CPA ${trend.trend.cpa}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
        <MetricCell
          label="Spend"
          current={formatCurrency(curr.spend)}
          changePct={spendChange}
        />
        <MetricCell
          label="Revenue"
          current={formatCurrency(curr.revenue)}
          changePct={changePct(curr.revenue, prev.revenue)}
        />
        <MetricCell
          label="Purchases"
          current={curr.purchases.toString()}
          changePct={changePct(curr.purchases, prev.purchases)}
        />
        <MetricCell
          label="ROAS"
          current={formatRoas(curr.roas)}
          changePct={roasChange}
          goodDirection="up"
        />
        <MetricCell
          label="CPA"
          current={curr.cpa > 0 ? `${curr.cpa.toFixed(0)} kr` : "\u2014"}
          changePct={changePct(curr.cpa, prev.cpa)}
          goodDirection="down"
        />
        <MetricCell
          label="CTR"
          current={`${curr.avg_ctr.toFixed(2)}%`}
          changePct={changePct(curr.avg_ctr, prev.avg_ctr)}
          goodDirection="up"
        />
      </div>

      {!hasPrev && (
        <p className="text-xs text-gray-400 mt-3">
          New campaign -- no previous period data
        </p>
      )}
    </div>
  );
}

function MetricCell({
  label,
  current,
  changePct: change,
  goodDirection = "up",
}: {
  label: string;
  current: string;
  changePct: number | null;
  goodDirection?: "up" | "down";
}) {
  const hasChange = change !== null && Number.isFinite(change);
  const isGood =
    hasChange &&
    ((goodDirection === "up" && change > 0) ||
      (goodDirection === "down" && change < 0));
  const isBad =
    hasChange &&
    ((goodDirection === "up" && change < 0) ||
      (goodDirection === "down" && change > 0));

  return (
    <div>
      <p className="text-gray-500 text-xs mb-0.5">{label}</p>
      <p className="font-semibold text-gray-900">{current}</p>
      {hasChange && (
        <p
          className={cn(
            "text-xs mt-0.5",
            Math.abs(change) < 5
              ? "text-gray-400"
              : isGood
              ? "text-green-600"
              : isBad
              ? "text-red-600"
              : "text-gray-400"
          )}
        >
          {change > 0 ? "+" : ""}
          {change.toFixed(0)}%
        </p>
      )}
    </div>
  );
}

function AdTable({
  title,
  icon,
  ads,
  type,
}: {
  title: string;
  icon: React.ReactNode;
  ads: AdRanking[];
  type: "winner" | "loser";
}) {
  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        {icon}
        <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
      </div>
      <div className="divide-y divide-gray-100">
        {ads.map((ad, i) => (
          <div key={ad.ad_id} className="px-4 py-2.5 flex items-start gap-3">
            <span
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5",
                type === "winner"
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              )}
            >
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p
                  className="text-sm font-medium text-gray-900 truncate"
                  title={ad.ad_name ?? ""}
                >
                  {ad.ad_name || "Unnamed"}
                </p>
                <a
                  href={metaAdUrl(ad.ad_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-gray-300 hover:text-indigo-500 transition-colors"
                  title="View in Meta Ads Manager"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <p className="text-xs text-gray-500 truncate">
                {ad.campaign_name}
              </p>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                <span>Spend: {formatCurrency(ad.spend)}</span>
                <span>
                  ROAS:{" "}
                  <span
                    className={cn(
                      "font-medium",
                      ad.roas >= 3
                        ? "text-green-700"
                        : ad.roas > 0
                        ? "text-amber-700"
                        : "text-red-600"
                    )}
                  >
                    {formatRoas(ad.roas)}
                  </span>
                </span>
                <span>CTR: {ad.ctr.toFixed(2)}%</span>
                {ad.purchases > 0 && (
                  <span>
                    {ad.purchases} purchase{ad.purchases !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        {ads.length === 0 && (
          <div className="px-4 py-4 text-sm text-gray-400 text-center">
            No ads to show
          </div>
        )}
      </div>
    </div>
  );
}
