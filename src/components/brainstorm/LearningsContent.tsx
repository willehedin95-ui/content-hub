"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AWARENESS_LEVELS } from "@/types";
import { toast } from "sonner";

/* ── Filter option types ──────────────────────────── */

type ProductFilter = "all" | "happysleep" | "hydro13";
type MarketFilter = "all" | "SE" | "DK" | "NO" | "DE";
type OutcomeFilter = "all" | "winner" | "loser";
type AwarenessFilter = "all" | (typeof AWARENESS_LEVELS)[number];

const PRODUCT_OPTIONS: { value: ProductFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "happysleep", label: "HappySleep" },
  { value: "hydro13", label: "Hydro13" },
];

const MARKET_OPTIONS: { value: MarketFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "SE", label: "SE" },
  { value: "DK", label: "DK" },
  { value: "NO", label: "NO" },
  { value: "DE", label: "DE" },
];

const OUTCOME_OPTIONS: { value: OutcomeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "winner", label: "Winner" },
  { value: "loser", label: "Loser" },
];

const AWARENESS_OPTIONS: { value: AwarenessFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...AWARENESS_LEVELS.map((a) => ({ value: a as AwarenessFilter, label: a })),
];

/* ── Learning type ────────────────────────────────── */

interface Learning {
  id: string;
  image_job_market_id: string | null;
  image_job_id: string | null;
  product: string | null;
  market: string | null;
  outcome: "winner" | "loser";
  angle: string | null;
  awareness_level: string | null;
  style: string | null;
  concept_type: string | null;
  concept_name: string | null;
  days_tested: number | null;
  total_spend: number | null;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  conversions: number | null;
  cpa: number | null;
  roas: number | null;
  hypothesis_tested: string | null;
  takeaway: string | null;
  tags: string[] | null;
  signal: string | null;
  created_at: string;
}

interface PatternEntry {
  wins: number;
  losses: number;
}

/* ── Helpers ──────────────────────────────────────── */

function productColor(product: string | null) {
  if (product === "happysleep") return "bg-sky-50 text-sky-700 border-sky-200";
  if (product === "hydro13") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

function productLabel(product: string | null) {
  if (product === "happysleep") return "HappySleep";
  if (product === "hydro13") return "Hydro13";
  return product ?? "Unknown";
}

function marketColor(market: string | null) {
  if (market === "SE") return "bg-blue-50 text-blue-700 border-blue-200";
  if (market === "DK") return "bg-red-50 text-red-700 border-red-200";
  if (market === "NO") return "bg-indigo-50 text-indigo-700 border-indigo-200";
  if (market === "DE") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

function formatCurrency(value: number | null) {
  if (value == null) return "\u2014";
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number | null) {
  if (value == null) return "\u2014";
  return `${(value * 100).toFixed(1)}%`;
}

function formatRoas(value: number | null) {
  if (value == null) return "\u2014";
  return `${value.toFixed(2)}x`;
}

/* ── Pattern helpers ──────────────────────────────── */

function parsePatterns(patterns: Record<string, PatternEntry>) {
  const byAngle: { label: string; wins: number; losses: number }[] = [];
  const byAwareness: { label: string; wins: number; losses: number }[] = [];
  const byStyle: { label: string; wins: number; losses: number }[] = [];

  for (const [key, entry] of Object.entries(patterns)) {
    const [type, ...rest] = key.split(":");
    const label = rest.join(":");
    const row = { label, wins: entry.wins, losses: entry.losses };
    if (type === "angle") byAngle.push(row);
    else if (type === "awareness") byAwareness.push(row);
    else if (type === "style") byStyle.push(row);
  }

  // Sort by total count descending
  const byTotal = (a: { wins: number; losses: number }, b: { wins: number; losses: number }) =>
    b.wins + b.losses - (a.wins + a.losses);
  byAngle.sort(byTotal);
  byAwareness.sort(byTotal);
  byStyle.sort(byTotal);

  return { byAngle, byAwareness, byStyle };
}

/* ── Component ────────────────────────────────────── */

export default function LearningsContent() {
  const [learnings, setLearnings] = useState<Learning[]>([]);
  const [patterns, setPatterns] = useState<Record<string, PatternEntry>>({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [product, setProduct] = useState<ProductFilter>("all");
  const [market, setMarket] = useState<MarketFilter>("all");
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [angle, setAngle] = useState("");
  const [awareness, setAwareness] = useState<AwarenessFilter>("all");

  // Unique angles from data for suggestions
  const uniqueAngles = useMemo(() => {
    const set = new Set<string>();
    for (const l of learnings) {
      if (l.angle) set.add(l.angle);
    }
    return Array.from(set).sort();
  }, [learnings]);

  /* ── Fetch ──────────────────────────────────────── */

  const fetchLearnings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (product !== "all") params.set("product", product);
      if (market !== "all") params.set("market", market);
      if (outcome !== "all") params.set("outcome", outcome);
      if (angle.trim()) params.set("angle", angle.trim());
      if (awareness !== "all") params.set("awareness_level", awareness);

      const res = await fetch(`/api/learnings?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLearnings(data.learnings ?? []);
        setPatterns(data.patterns ?? {});
      } else {
        toast.error("Failed to load learnings");
      }
    } finally {
      setLoading(false);
    }
  }, [product, market, outcome, angle, awareness]);

  useEffect(() => {
    fetchLearnings();
  }, [fetchLearnings]);

  /* ── Derived data ───────────────────────────────── */

  const parsedPatterns = useMemo(() => parsePatterns(patterns), [patterns]);
  const showPatterns = learnings.length >= 5;

  const winCount = learnings.filter((l) => l.outcome === "winner").length;
  const loseCount = learnings.filter((l) => l.outcome === "loser").length;

  /* ── Render ─────────────────────────────────────── */

  return (
    <>
      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          {/* Product */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Product</label>
            <select
              value={product}
              onChange={(e) => setProduct(e.target.value as ProductFilter)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
            >
              {PRODUCT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Market */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Market</label>
            <select
              value={market}
              onChange={(e) => setMarket(e.target.value as MarketFilter)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
            >
              {MARKET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Outcome */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Outcome</label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as OutcomeFilter)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
            >
              {OUTCOME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Angle */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Angle</label>
            <input
              type="text"
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              placeholder="Filter by angle..."
              list="angle-suggestions"
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white w-44"
            />
            <datalist id="angle-suggestions">
              {uniqueAngles.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>

          {/* Awareness Level */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Awareness</label>
            <select
              value={awareness}
              onChange={(e) => setAwareness(e.target.value as AwarenessFilter)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
            >
              {AWARENESS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && learnings.length === 0 && (
        <div className="text-center py-20">
          <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            No learnings yet. Learnings are automatically generated when concepts are killed or promoted.
          </p>
        </div>
      )}

      {/* Content */}
      {!loading && learnings.length > 0 && (
        <>
          {/* Summary bar */}
          <div className="flex items-center gap-3 mb-4 text-sm text-gray-500">
            <span>{learnings.length} learning{learnings.length !== 1 ? "s" : ""}</span>
            <span className="text-gray-300">|</span>
            <span className="text-emerald-600">{winCount} winner{winCount !== 1 ? "s" : ""}</span>
            <span className="text-gray-300">|</span>
            <span className="text-red-500">{loseCount} loser{loseCount !== 1 ? "s" : ""}</span>
          </div>

          {/* Pattern summary (only when 5+ learnings) */}
          {showPatterns && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Pattern Summary</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {parsedPatterns.byAngle.length > 0 && (
                  <PatternGroup title="Angle Win Rates" rows={parsedPatterns.byAngle} />
                )}
                {parsedPatterns.byAwareness.length > 0 && (
                  <PatternGroup title="Awareness Win Rates" rows={parsedPatterns.byAwareness} />
                )}
                {parsedPatterns.byStyle.length > 0 && (
                  <PatternGroup title="Style Win Rates" rows={parsedPatterns.byStyle} />
                )}
              </div>
            </div>
          )}

          {/* Learning cards */}
          <div className="space-y-3">
            {learnings.map((l) => (
              <LearningCard key={l.id} learning={l} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

/* ── Pattern Group component ──────────────────────── */

function PatternGroup({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; wins: number; losses: number }[];
}) {
  return (
    <div>
      <h3 className="text-xs font-medium text-gray-500 mb-2">{title}</h3>
      <div className="space-y-1.5">
        {rows.map((row) => {
          const total = row.wins + row.losses;
          const winRate = total > 0 ? row.wins / total : 0;
          const pct = Math.round(winRate * 100);
          return (
            <div key={row.label} className="flex items-center gap-2">
              <span className="text-xs text-gray-700 w-28 truncate shrink-0" title={row.label}>
                {row.label}
              </span>
              <span className="text-xs text-gray-500 w-16 shrink-0 text-right">
                {row.wins}/{total} ({pct}%)
              </span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    pct >= 60 ? "bg-emerald-500" : pct >= 30 ? "bg-amber-400" : "bg-red-400"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Learning Card component ──────────────────────── */

function LearningCard({ learning: l }: { learning: Learning }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-colors">
      {/* Top row: concept name + outcome badge */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-gray-900">
          {l.concept_name || "Unnamed Concept"}
        </h3>
        <span
          className={cn(
            "text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0",
            l.outcome === "winner"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          )}
        >
          {l.outcome === "winner" ? "Winner" : "Loser"}
        </span>
      </div>

      {/* Pills row: product, market, CASH DNA */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {/* Product */}
        {l.product && (
          <span
            className={cn(
              "text-[11px] font-medium px-2 py-0.5 rounded-lg border",
              productColor(l.product)
            )}
          >
            {productLabel(l.product)}
          </span>
        )}

        {/* Market */}
        {l.market && (
          <span
            className={cn(
              "text-[11px] font-medium px-2 py-0.5 rounded-lg border",
              marketColor(l.market)
            )}
          >
            {l.market}
          </span>
        )}

        {/* Angle */}
        {l.angle && (
          <span className="text-[11px] font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded-lg border border-violet-200">
            {l.angle}
          </span>
        )}

        {/* Awareness level */}
        {l.awareness_level && (
          <span className="text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
            {l.awareness_level}
          </span>
        )}

        {/* Style */}
        {l.style && (
          <span className="text-[11px] font-medium text-orange-700 bg-orange-50 px-2 py-0.5 rounded-lg border border-orange-200">
            {l.style}
          </span>
        )}
      </div>

      {/* Metrics row */}
      <div className="flex flex-wrap items-center gap-4 mb-3 text-xs">
        <MetricItem label="Spend" value={formatCurrency(l.total_spend)} />
        <MetricItem label="CPA" value={formatCurrency(l.cpa)} />
        <MetricItem label="ROAS" value={formatRoas(l.roas)} />
        <MetricItem label="CTR" value={formatPercent(l.ctr)} />
        {l.days_tested != null && (
          <MetricItem label="Days" value={String(l.days_tested)} />
        )}
      </div>

      {/* Takeaway */}
      {l.takeaway && (
        <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 mb-3">
          {l.takeaway}
        </p>
      )}

      {/* Tags */}
      {l.tags && l.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {l.tags.map((tag) => (
            <span
              key={tag}
              className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Metric Item ──────────────────────────────────── */

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-gray-400">{label}</span>
      <span className="font-medium text-gray-700">{value}</span>
    </div>
  );
}
