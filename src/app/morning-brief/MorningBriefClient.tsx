"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  AlertTriangle,
  Eye,
  Trophy,
  ThumbsDown,
  RefreshCw,
  DollarSign,
  ShoppingCart,
  BarChart3,
  Zap,
  Flame,
  Star,
  Stethoscope,
  Gauge,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Loader2,
  Pause,
  Rocket,
  CheckCircle2,
  GitBranch,
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
}

// ── Helpers ──

function formatCurrency(n: number): string {
  if (n >= 10000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
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

function SeverityBadge({ level }: { level: "critical" | "warning" | "monitor" }) {
  const styles = {
    critical: "bg-red-100 text-red-800 border-red-200",
    warning: "bg-amber-100 text-amber-800 border-amber-200",
    monitor: "bg-blue-100 text-blue-700 border-blue-200",
  };
  const icons = {
    critical: <AlertCircle className="w-3.5 h-3.5" />,
    warning: <AlertTriangle className="w-3.5 h-3.5" />,
    monitor: <Eye className="w-3.5 h-3.5" />,
  };
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border", styles[level])}>
      {icons[level]}
      {level.charAt(0).toUpperCase() + level.slice(1)}
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
    loading: string | null; // action key currently loading
    results: Record<string, { ok: boolean; message: string }>;
  }>({ loading: null, results: {} });

  async function handlePauseBleeders(bleedersToStop: Bleeder[]) {
    setActionState((s) => ({ ...s, loading: "pause_bleeders" }));
    try {
      const res = await fetch("/api/morning-brief/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "pause_bleeders",
          bleeders: bleedersToStop.map((b) => ({
            ad_id: b.ad_id,
            ad_name: b.ad_name,
            campaign_name: b.campaign_name,
            days_bleeding: b.days_bleeding,
            total_spend: b.total_spend,
            avg_ctr: b.avg_ctr,
            avg_cpa: b.avg_cpa,
          })),
        }),
      });
      const data = await res.json();
      setActionState((s) => ({
        ...s,
        loading: null,
        results: {
          ...s.results,
          pause_bleeders: {
            ok: data.ok,
            message: `Paused ${data.paused} ad${data.paused !== 1 ? "s" : ""}${data.failed ? `, ${data.failed} failed` : ""}`,
          },
        },
      }));
    } catch {
      setActionState((s) => ({
        ...s,
        loading: null,
        results: { ...s.results, pause_bleeders: { ok: false, message: "Action failed" } },
      }));
    }
  }

  async function handlePauseAd(adId: string, adName?: string | null, campaignName?: string | null) {
    const key = `pause_${adId}`;
    setActionState((s) => ({ ...s, loading: key }));
    try {
      const res = await fetch("/api/morning-brief/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "pause_ad",
          ad_id: adId,
          ad_name: adName,
          campaign_name: campaignName,
          reason: "Paused from Morning Brief",
        }),
      });
      const data = await res.json();
      setActionState((s) => ({
        ...s,
        loading: null,
        results: { ...s.results, [key]: { ok: data.ok, message: data.ok ? "Paused" : "Failed" } },
      }));
    } catch {
      setActionState((s) => ({
        ...s,
        loading: null,
        results: { ...s.results, [key]: { ok: false, message: "Failed" } },
      }));
    }
  }

  async function handleScaleWinner(w: ConsistentWinner) {
    const key = `scale_${w.ad_id}`;
    setActionState((s) => ({ ...s, loading: key }));
    try {
      const res = await fetch("/api/morning-brief/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "scale_winner",
          ad_id: w.ad_id,
          adset_id: w.adset_id,
          campaign_id: w.campaign_id,
          ad_name: w.ad_name,
          campaign_name: w.campaign_name,
        }),
      });
      const data = await res.json();
      setActionState((s) => ({
        ...s,
        loading: null,
        results: {
          ...s.results,
          [key]: {
            ok: data.ok,
            message: data.ok
              ? `${data.level === "adset" ? "Ad set" : "Campaign"} budget: $${data.old_budget} → $${data.new_budget}/day`
              : "Failed",
          },
        },
      }));
    } catch {
      setActionState((s) => ({
        ...s,
        loading: null,
        results: { ...s.results, [key]: { ok: false, message: "Failed" } },
      }));
    }
  }

  async function handleScaleAllWinners(winners: ConsistentWinner[]) {
    setActionState((s) => ({ ...s, loading: "scale_all" }));
    for (const w of winners) {
      await handleScaleWinner(w);
    }
    setActionState((s) => ({
      ...s,
      loading: null,
      results: {
        ...s.results,
        scale_all: { ok: true, message: `Scaled ${winners.length} winner${winners.length !== 1 ? "s" : ""} +20%` },
      },
    }));
  }

  async function handleApplyBudgetShifts(scores: EfficiencyScore[]) {
    setActionState((s) => ({ ...s, loading: "budget_shifts" }));
    try {
      const shifts = scores
        .filter((s) => s.recommendation !== "maintain" && s.campaign_id)
        .map((s) => ({
          campaign_id: s.campaign_id!,
          campaign_name: s.campaign_name,
          efficiency_score: s.efficiency_score,
          recommended_budget_share: s.recommended_budget_share,
          recommendation: s.recommendation,
        }));
      const res = await fetch("/api/morning-brief/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply_budget_shifts", shifts }),
      });
      const data = await res.json();
      setActionState((s) => ({
        ...s,
        loading: null,
        results: {
          ...s.results,
          budget_shifts: {
            ok: data.ok,
            message: data.ok ? `Updated ${data.updated} campaign budget${data.updated !== 1 ? "s" : ""}` : "Failed",
          },
        },
      }));
    } catch {
      setActionState((s) => ({
        ...s,
        loading: null,
        results: { ...s.results, budget_shifts: { ok: false, message: "Failed" } },
      }));
    }
  }

  useEffect(() => {
    fetchBrief();
  }, []);

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 bg-gray-200 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-gray-200 rounded-lg" />
            ))}
          </div>
          <div className="h-64 bg-gray-200 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Morning Brief</h1>
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

  const { spend_pacing, whats_running, performance_trends, winners_losers, fatigue_signals } =
    data.questions;
  const { bleeders, consistent_winners, lp_vs_creative_fatigue, efficiency_scoring } =
    data.signals;

  const totalFatigueCount =
    fatigue_signals.critical.length + fatigue_signals.warning.length + fatigue_signals.monitor.length;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Morning Brief</h1>
          <p className="text-sm text-gray-500 mt-1">
            Data from {data.data_date} &middot; Generated{" "}
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

      {/* Q1: Spend Pacing — KPI Row */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon={<DollarSign className="w-5 h-5 text-gray-400" />}
            label="Spend"
            value={formatCurrency(spend_pacing.total_spend)}
            sub={`${whats_running.active_campaigns} campaigns`}
          />
          <KpiCard
            icon={<ShoppingCart className="w-5 h-5 text-gray-400" />}
            label="Purchases"
            value={spend_pacing.total_purchases.toString()}
            sub={
              spend_pacing.total_purchases > 0
                ? `$${(spend_pacing.total_spend / spend_pacing.total_purchases).toFixed(0)} CPA`
                : "No purchases"
            }
          />
          <KpiCard
            icon={<BarChart3 className="w-5 h-5 text-gray-400" />}
            label="Revenue"
            value={formatCurrency(spend_pacing.total_revenue)}
            sub={`${whats_running.total_active_ads} active ads`}
          />
          <KpiCard
            icon={<Zap className="w-5 h-5 text-gray-400" />}
            label="Blended ROAS"
            value={formatRoas(spend_pacing.blended_roas)}
            highlight={spend_pacing.blended_roas >= 3}
            sub={spend_pacing.blended_roas >= 3 ? "Above target" : "Below target"}
          />
        </div>
      </section>

      {/* Q2 + Q3: Campaign Performance Trends */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Campaign Performance</h2>
        <p className="text-sm text-gray-500 -mt-3 mb-4">7-day current vs 7-day previous</p>
        <div className="space-y-3">
          {performance_trends.map((ct) => (
            <CampaignCard key={ct.campaign_id} trend={ct} />
          ))}
        </div>
      </section>

      {/* Q4: Winners & Losers */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Winners & Losers</h2>
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
      </section>

      {/* Q5: Fatigue Signals */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Fatigue Signals</h2>
          {totalFatigueCount > 0 && (
            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {totalFatigueCount} signal{totalFatigueCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {totalFatigueCount === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <p className="text-green-800 font-medium">All clear — no fatigue signals detected</p>
          </div>
        ) : (
          <div className="space-y-3">
            {fatigue_signals.critical.length > 0 && (
              <>
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                  <p className="text-sm text-red-800">
                    <span className="font-semibold">Recommendation:</span> Pause critical fatigue ads and brainstorm fresh creatives.
                  </p>
                </div>
                <FatigueGroup
                  level="critical"
                  signals={fatigue_signals.critical}
                  onPauseAd={handlePauseAd}
                  actionState={actionState}
                />
              </>
            )}
            {fatigue_signals.warning.length > 0 && (
              <FatigueGroup level="warning" signals={fatigue_signals.warning} />
            )}
            {fatigue_signals.monitor.length > 0 && (
              <FatigueGroup level="monitor" signals={fatigue_signals.monitor} />
            )}
          </div>
        )}
      </section>

      {/* Bleeders */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Bleeders</h2>
          {bleeders.length > 0 ? (
            <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
              {bleeders.length} ad{bleeders.length !== 1 ? "s" : ""} bleeding
            </span>
          ) : (
            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              None
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 -mt-3 mb-4">
          Ads with high spend, low CTR (&lt;1%), and CPA &gt;2.5x campaign average for 2+ days
        </p>
        {bleeders.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <p className="text-green-800 text-sm font-medium">No bleeders detected</p>
          </div>
        ) : (
          <>
            {/* Recommendation */}
            <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-3">
              <p className="text-sm text-red-800">
                <span className="font-semibold">Recommendation:</span> Pause these ads — they&apos;re spending without converting.
              </p>
              {actionState.results.pause_bleeders ? (
                <span className={cn("text-xs font-medium px-3 py-1.5 rounded-lg", actionState.results.pause_bleeders.ok ? "text-green-700 bg-green-100" : "text-red-700 bg-red-100")}>
                  <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                  {actionState.results.pause_bleeders.message}
                </span>
              ) : (
                <button
                  onClick={() => handlePauseBleeders(bleeders)}
                  disabled={actionState.loading === "pause_bleeders"}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors shrink-0"
                >
                  {actionState.loading === "pause_bleeders" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Pause className="w-3.5 h-3.5" />
                  )}
                  Pause All Bleeders ({bleeders.length})
                </button>
              )}
            </div>
            <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-red-500 overflow-hidden divide-y divide-gray-100">
              {bleeders.map((b) => {
                const pauseKey = `pause_${b.ad_id}`;
                const pauseResult = actionState.results[pauseKey] || actionState.results.pause_bleeders;
                return (
                  <div key={b.ad_id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-gray-900 truncate" title={b.ad_name ?? ""}>
                            <Flame className="w-3.5 h-3.5 text-red-500 inline mr-1.5" />
                            {b.ad_name || "Unnamed"}
                          </p>
                          <a href={metaAdUrl(b.ad_id)} target="_blank" rel="noopener noreferrer"
                             className="shrink-0 text-gray-300 hover:text-indigo-500 transition-colors" title="View in Meta Ads Manager">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                        <p className="text-xs text-gray-500">{b.campaign_name}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded">
                          {b.days_bleeding}d bleeding
                        </span>
                        {!pauseResult && (
                          <button
                            onClick={() => handlePauseAd(b.ad_id, b.ad_name, b.campaign_name)}
                            disabled={!!actionState.loading}
                            className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50 transition-colors"
                          >
                            {actionState.loading === pauseKey ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              "Pause"
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span>Spent: <span className="font-medium text-gray-700">{formatCurrency(b.total_spend)}</span></span>
                      <span>Purchases: <span className="font-medium text-gray-700">{b.purchases}</span></span>
                      <span>CTR: <span className="font-medium text-red-600">{b.avg_ctr}%</span></span>
                      <span>Campaign avg CPA: <span className="font-medium text-gray-700">${b.campaign_avg_cpa}</span></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* Consistent Winners */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Consistent Winners</h2>
          {consistent_winners.length > 0 ? (
            <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
              {consistent_winners.length} ad{consistent_winners.length !== 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              None yet
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 -mt-3 mb-4">
          Ads with ROAS &gt;1, CTR &gt;1%, and CPA at/below campaign avg for 5+ consecutive days
        </p>
        {consistent_winners.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
            <p className="text-gray-600 text-sm">No ads have sustained 5+ winning days yet</p>
          </div>
        ) : (
          <>
            {/* Recommendation */}
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-3">
              <p className="text-sm text-green-800">
                <span className="font-semibold">Recommendation:</span> Scale budget for these proven performers.
              </p>
              {actionState.results.scale_all ? (
                <span className="text-xs font-medium text-green-700 bg-green-100 px-3 py-1.5 rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                  {actionState.results.scale_all.message}
                </span>
              ) : (
                <button
                  onClick={() => handleScaleAllWinners(consistent_winners)}
                  disabled={actionState.loading === "scale_all"}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors shrink-0"
                >
                  {actionState.loading === "scale_all" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Rocket className="w-3.5 h-3.5" />
                  )}
                  Scale All +20%
                </button>
              )}
            </div>
            <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-green-500 overflow-hidden divide-y divide-gray-100">
              {consistent_winners.map((w) => {
                const scaleKey = `scale_${w.ad_id}`;
                const scaleResult = actionState.results[scaleKey];
                return (
                  <div key={w.ad_id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-gray-900 truncate" title={w.ad_name ?? ""}>
                            <Star className="w-3.5 h-3.5 text-green-600 inline mr-1.5" />
                            {w.ad_name || "Unnamed"}
                          </p>
                          <a href={metaAdUrl(w.ad_id)} target="_blank" rel="noopener noreferrer"
                             className="shrink-0 text-gray-300 hover:text-indigo-500 transition-colors" title="View in Meta Ads Manager">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                        <p className="text-xs text-gray-500">{w.campaign_name}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded">
                          {w.consistent_days}d winning
                        </span>
                        {w.image_job_id && (
                          <Link
                            href={`/images/${w.image_job_id}`}
                            className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                            title="Create iteration of this winner"
                          >
                            <GitBranch className="w-3.5 h-3.5" />
                            Iterate
                          </Link>
                        )}
                        {scaleResult ? (
                          <span className={cn("text-xs", scaleResult.ok ? "text-green-600" : "text-red-600")}>
                            {scaleResult.message}
                          </span>
                        ) : !actionState.results.scale_all && (
                          <button
                            onClick={() => handleScaleWinner(w)}
                            disabled={!!actionState.loading}
                            className="text-xs font-medium text-green-600 hover:text-green-700 disabled:opacity-50 transition-colors"
                          >
                            {actionState.loading === scaleKey ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              "+20%"
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span>Spent: <span className="font-medium text-gray-700">{formatCurrency(w.total_spend)}</span></span>
                      <span>Purchases: <span className="font-medium text-gray-700">{w.total_purchases}</span></span>
                      <span>ROAS: <span className="font-medium text-green-700">{formatRoas(w.avg_roas)}</span></span>
                      <span>CPA: <span className="font-medium text-gray-700">${w.avg_cpa}</span></span>
                      <span>CTR: <span className="font-medium text-gray-700">{w.avg_ctr}%</span></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* LP vs Creative Fatigue */}
      {lp_vs_creative_fatigue.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Fatigue Diagnosis</h2>
            <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
              {lp_vs_creative_fatigue.length} signal{lp_vs_creative_fatigue.length !== 1 ? "s" : ""}
            </span>
          </div>
          <p className="text-sm text-gray-500 -mt-3 mb-4">
            Distinguishing landing page issues from creative fatigue
          </p>
          <div className="space-y-2">
            {lp_vs_creative_fatigue.map((f, i) => (
              <div
                key={`${f.ad_id}-${i}`}
                className={cn(
                  "bg-white rounded-lg border border-gray-200 border-l-4 px-5 py-3",
                  f.diagnosis === "landing_page" ? "border-l-purple-500" : "border-l-orange-500"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-900 truncate" title={f.ad_name ?? ""}>
                        <Stethoscope className="w-3.5 h-3.5 text-purple-600 inline mr-1.5" />
                        {f.ad_name || "Unnamed"}
                      </p>
                      <a href={metaAdUrl(f.ad_id)} target="_blank" rel="noopener noreferrer"
                         className="shrink-0 text-gray-300 hover:text-indigo-500 transition-colors" title="View in Meta Ads Manager">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <p className="text-xs text-gray-500">{f.campaign_name}</p>
                  </div>
                  <span
                    className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded shrink-0",
                      f.diagnosis === "landing_page"
                        ? "text-purple-700 bg-purple-50"
                        : "text-orange-700 bg-orange-50"
                    )}
                  >
                    {f.diagnosis === "landing_page" ? "Landing Page Issue" : "Creative Fatigue"}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{f.detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Efficiency Scoring */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Campaign Efficiency</h2>
        </div>
        <p className="text-sm text-gray-500 -mt-3 mb-4">
          CTR/CPC efficiency ratio with budget allocation recommendations (30% max shift)
        </p>
        {efficiency_scoring.some((s) => s.recommendation !== "maintain") && (
          <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 mb-3">
            <p className="text-sm text-indigo-800">
              <span className="font-semibold">Recommendation:</span> Rebalance budgets based on performance.
            </p>
            {actionState.results.budget_shifts ? (
              <span className={cn("text-xs font-medium px-3 py-1.5 rounded-lg", actionState.results.budget_shifts.ok ? "text-green-700 bg-green-100" : "text-red-700 bg-red-100")}>
                <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                {actionState.results.budget_shifts.message}
              </span>
            ) : (
              <button
                onClick={() => handleApplyBudgetShifts(efficiency_scoring)}
                disabled={actionState.loading === "budget_shifts"}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors shrink-0"
              >
                {actionState.loading === "budget_shifts" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Gauge className="w-3.5 h-3.5" />
                )}
                Apply Recommended Shifts
              </button>
            )}
          </div>
        )}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Campaign</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Spend 7d</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">ROAS</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">CTR</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">CPC</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Efficiency</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Budget</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {efficiency_scoring.map((c) => (
                <tr key={c.campaign_id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{c.campaign_name}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(c.spend_7d)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn("font-medium", c.roas_7d >= 3 ? "text-green-700" : c.roas_7d >= 1 ? "text-gray-700" : "text-red-600")}>
                      {formatRoas(c.roas_7d)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{c.avg_ctr}%</td>
                  <td className="px-4 py-3 text-right text-gray-700">${c.avg_cpc}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono font-medium text-gray-900">{c.efficiency_score}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                        c.recommendation === "increase"
                          ? "text-green-700 bg-green-50"
                          : c.recommendation === "decrease"
                          ? "text-red-700 bg-red-50"
                          : "text-gray-500 bg-gray-100"
                      )}
                    >
                      {c.recommendation === "increase" && <ArrowUpRight className="w-3 h-3" />}
                      {c.recommendation === "decrease" && <ArrowDownRight className="w-3 h-3" />}
                      {c.current_budget_share}% → {c.recommended_budget_share}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent Actions (from ad_learnings) */}
      <RecentActionsSection />
    </div>
  );
}

function RecentActionsSection() {
  const [learnings, setLearnings] = useState<Array<{
    id: string;
    meta_ad_id: string;
    ad_name: string | null;
    campaign_name: string | null;
    event_type: string;
    detail: string;
    created_at: string;
  }>>([]);

  useEffect(() => {
    fetch("/api/ad-learnings?limit=10")
      .then((r) => r.json())
      .then((d) => setLearnings(d.learnings ?? []))
      .catch(() => {});
  }, []);

  if (learnings.length === 0) return null;

  const eventIcons: Record<string, string> = {
    paused_bleeder: "🛑",
    graduated_winner: "🚀",
    fatigue_detected: "⚠️",
    creative_refresh: "🔄",
    budget_shifted: "⚡",
    manual_note: "📝",
  };

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <RefreshCw className="w-5 h-5 text-gray-600" />
        Recent Actions
      </h2>
      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
        {learnings.map((l) => (
          <div key={l.id} className="px-5 py-3">
            <div className="flex items-start gap-2">
              <span className="text-base shrink-0 mt-0.5">{eventIcons[l.event_type] || "📋"}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{l.ad_name || "Unknown"}</p>
                <p className="text-xs text-gray-500">{l.detail}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(l.created_at).toLocaleDateString()} {new Date(l.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Sub-Components ──

function KpiCard({
  icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className="text-sm font-medium text-gray-500">{label}</p>
      </div>
      <p className={cn("text-3xl font-bold mb-1", highlight ? "text-green-700" : "text-gray-900")}>
        {value}
      </p>
      {sub && <p className="text-sm text-gray-500">{sub}</p>}
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
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">{trend.campaign_name}</h3>
        <div className="flex items-center gap-2">
          <TrendBadge direction={trend.trend.roas} label={`ROAS ${trend.trend.roas}`} />
          <TrendBadge direction={trend.trend.cpa} label={`CPA ${trend.trend.cpa}`} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
        <MetricCell label="Spend" current={formatCurrency(curr.spend)} changePct={spendChange} />
        <MetricCell label="Revenue" current={formatCurrency(curr.revenue)} changePct={changePct(curr.revenue, prev.revenue)} />
        <MetricCell label="Purchases" current={curr.purchases.toString()} changePct={changePct(curr.purchases, prev.purchases)} />
        <MetricCell label="ROAS" current={formatRoas(curr.roas)} changePct={roasChange} goodDirection="up" />
        <MetricCell label="CPA" current={curr.cpa > 0 ? `$${curr.cpa.toFixed(0)}` : "—"} changePct={changePct(curr.cpa, prev.cpa)} goodDirection="down" />
        <MetricCell label="CTR" current={`${curr.avg_ctr.toFixed(2)}%`} changePct={changePct(curr.avg_ctr, prev.avg_ctr)} goodDirection="up" />
      </div>

      {!hasPrev && (
        <p className="text-xs text-gray-400 mt-3">New campaign — no previous period data</p>
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
  const isGood = hasChange && ((goodDirection === "up" && change > 0) || (goodDirection === "down" && change < 0));
  const isBad = hasChange && ((goodDirection === "up" && change < 0) || (goodDirection === "down" && change > 0));

  return (
    <div>
      <p className="text-gray-500 text-xs mb-0.5">{label}</p>
      <p className="font-semibold text-gray-900">{current}</p>
      {hasChange && (
        <p
          className={cn(
            "text-xs mt-0.5",
            Math.abs(change) < 5 ? "text-gray-400" : isGood ? "text-green-600" : isBad ? "text-red-600" : "text-gray-400"
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
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        {icon}
        <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
      </div>
      <div className="divide-y divide-gray-100">
        {ads.map((ad, i) => (
          <div key={ad.ad_id} className="px-5 py-3 flex items-start gap-3">
            <span
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5",
                type === "winner" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
              )}
            >
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-gray-900 truncate" title={ad.ad_name ?? ""}>
                  {ad.ad_name || "Unnamed"}
                </p>
                <a href={metaAdUrl(ad.ad_id)} target="_blank" rel="noopener noreferrer"
                   className="shrink-0 text-gray-300 hover:text-indigo-500 transition-colors" title="View in Meta Ads Manager">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <p className="text-xs text-gray-500 truncate">{ad.campaign_name}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                <span>Spend: {formatCurrency(ad.spend)}</span>
                <span>
                  ROAS:{" "}
                  <span
                    className={cn(
                      "font-medium",
                      ad.roas >= 3 ? "text-green-700" : ad.roas > 0 ? "text-amber-700" : "text-red-600"
                    )}
                  >
                    {formatRoas(ad.roas)}
                  </span>
                </span>
                <span>CTR: {ad.ctr.toFixed(2)}%</span>
                {ad.purchases > 0 && <span>{ad.purchases} purchase{ad.purchases !== 1 ? "s" : ""}</span>}
              </div>
            </div>
          </div>
        ))}
        {ads.length === 0 && (
          <div className="px-5 py-4 text-sm text-gray-400 text-center">No ads to show</div>
        )}
      </div>
    </div>
  );
}

function FatigueGroup({
  level,
  signals,
  onPauseAd,
  actionState,
}: {
  level: "critical" | "warning" | "monitor";
  signals: FatigueSignal[];
  onPauseAd?: (adId: string, adName?: string | null, campaignName?: string | null) => void;
  actionState?: { loading: string | null; results: Record<string, { ok: boolean; message: string }> };
}) {
  const borderColor = {
    critical: "border-l-red-500",
    warning: "border-l-amber-500",
    monitor: "border-l-blue-400",
  };

  return (
    <div className={cn("bg-white rounded-lg border border-gray-200 border-l-4 overflow-hidden", borderColor[level])}>
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <SeverityBadge level={level} />
        <span className="text-xs text-gray-500">
          {signals.length} signal{signals.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="divide-y divide-gray-100">
        {signals.map((s, i) => {
          const pauseKey = `pause_${s.ad_id}`;
          const pauseResult = actionState?.results[pauseKey];
          return (
            <div key={`${s.ad_id}-${i}`} className="px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-gray-900 truncate" title={s.ad_name ?? ""}>
                      {s.ad_name || "Unnamed"}
                    </p>
                    <a href={metaAdUrl(s.ad_id)} target="_blank" rel="noopener noreferrer"
                       className="shrink-0 text-gray-300 hover:text-indigo-500 transition-colors" title="View in Meta Ads Manager">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  <p className="text-xs text-gray-500">{s.campaign_name}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                    {s.signal}
                  </span>
                  {onPauseAd && !pauseResult && (
                    <button
                      onClick={() => onPauseAd(s.ad_id, s.ad_name, s.campaign_name)}
                      disabled={actionState?.loading === pauseKey}
                      className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50 transition-colors"
                    >
                      {actionState?.loading === pauseKey ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        "Pause"
                      )}
                    </button>
                  )}
                  {pauseResult && (
                    <span className={cn("text-xs", pauseResult.ok ? "text-green-600" : "text-red-600")}>
                      {pauseResult.message}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">{s.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
