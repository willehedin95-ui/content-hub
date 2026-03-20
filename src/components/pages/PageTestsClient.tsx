"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FlaskConical,
  Trophy,
  Loader2,
  ExternalLink,
  ArrowRight,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PagePairGroup {
  groupKey: string;
  page_a: { id: string; name: string; slug: string; thumbnail_url: string | null };
  page_b: { id: string; name: string; slug: string; thumbnail_url: string | null };
  status: "active" | "completed";
  winner_page_id: string | null;
  tests: Array<{
    id: string;
    name: string;
    status: string;
    image_jobs: {
      id: string;
      name: string;
      product: string;
      concept_number: number | null;
      source_images: Array<{ original_url: string }>;
    };
    created_at: string;
  }>;
  concept_count: number;
  markets: string[];
  earliest_created_at: string;
}

interface VariantStats {
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
  ctr: number;
  roas: number;
  cpa: number;
  cvr: number;
  days: number;
}

interface PerConceptStats {
  conceptId: string;
  conceptName: string;
  conceptNumber: number | null;
  thumbnail: string | null;
  variants: { a: VariantStats; b: VariantStats };
}

interface GroupStatsResponse {
  aggregated: {
    variants: { a: VariantStats | null; b: VariantStats | null };
    significance: {
      confident: boolean;
      p_value: number;
      winner: string | null;
      sample_size_ok: boolean;
    } | null;
  };
  perConcept: PerConceptStats[];
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function PageTestsClient() {
  const [groups, setGroups] = useState<PagePairGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    const res = await fetch("/api/page-tests");
    if (res.ok) {
      const data = await res.json();
      setGroups(data.groups ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-16">
        <FlaskConical className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">No page tests yet</p>
        <p className="text-xs text-gray-400 mt-1">
          Push a concept with two landing pages to start testing
        </p>
      </div>
    );
  }

  if (selectedGroupKey) {
    const group = groups.find((g) => g.groupKey === selectedGroupKey);
    if (group) {
      return (
        <PagePairDetail
          group={group}
          onBack={() => setSelectedGroupKey(null)}
          onUpdate={loadGroups}
        />
      );
    }
  }

  return (
    <div className="space-y-3 mt-4">
      {groups.map((group) => {
        const daysRunning = Math.ceil(
          (Date.now() - new Date(group.earliest_created_at).getTime()) /
            (1000 * 60 * 60 * 24)
        );

        return (
          <button
            key={group.groupKey}
            onClick={() => setSelectedGroupKey(group.groupKey)}
            className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-300 transition-colors"
          >
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {group.page_a?.name}
                  </span>
                  <span className="text-xs text-gray-300">vs</span>
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {group.page_b?.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      group.status === "active"
                        ? "bg-green-50 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {group.status === "active" ? "Running" : "Completed"}
                  </span>
                  {group.winner_page_id && (
                    <Trophy className="w-3.5 h-3.5 text-amber-500" />
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400">
                  <span>{group.concept_count} concept{group.concept_count !== 1 ? "s" : ""}</span>
                  <span>{daysRunning}d running</span>
                  <span>{group.markets.join(", ")}</span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 shrink-0 self-center" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page Pair Detail (grouped comparison view)                         */
/* ------------------------------------------------------------------ */

function PagePairDetail({
  group,
  onBack,
  onUpdate,
}: {
  group: PagePairGroup;
  onBack: () => void;
  onUpdate: () => void;
}) {
  const [stats, setStats] = useState<GroupStatsResponse | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [declaring, setDeclaring] = useState(false);
  const [conceptsExpanded, setConceptsExpanded] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch(
        `/api/page-tests/group-stats?page_a_id=${group.page_a.id}&page_b_id=${group.page_b.id}`
      );
      if (res.ok) setStats(await res.json());
      setLoadingStats(false);
    }
    load();
    if (group.status === "active") {
      const iv = setInterval(load, 60_000);
      return () => clearInterval(iv);
    }
  }, [group.page_a.id, group.page_b.id, group.status]);

  async function declareWinner(winner: "a" | "b") {
    const pageName = winner === "a" ? group.page_a?.name : group.page_b?.name;

    // Check for outlier concepts
    const outliers = findOutliers(stats?.perConcept ?? [], winner);
    let confirmMsg = `Declare "${pageName}" as winner?\n\nThis will pause losing ad sets across all ${group.concept_count} concept(s).`;
    if (outliers.length > 0) {
      confirmMsg += `\n\n⚠️ Note: ${outliers.length} concept(s) actually perform better on the losing page:`;
      for (const o of outliers) {
        confirmMsg += `\n  • ${o.name} (${o.metric})`;
      }
      confirmMsg += `\n\nConsider updating their landing pages after declaring the winner.`;
    }

    if (!confirm(confirmMsg)) return;
    setDeclaring(true);
    const res = await fetch("/api/page-tests/group-winner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page_a_id: group.page_a.id,
        page_b_id: group.page_b.id,
        winner,
      }),
    });
    if (res.ok) {
      onUpdate();
    }
    setDeclaring(false);
  }

  const daysRunning = Math.ceil(
    (Date.now() - new Date(group.earliest_created_at).getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const a = stats?.aggregated.variants.a;
  const b = stats?.aggregated.variants.b;

  return (
    <div className="space-y-6 mt-4">
      {/* Header */}
      <div>
        <button
          onClick={onBack}
          className="text-xs text-indigo-600 hover:text-indigo-700 mb-1"
        >
          &larr; Back to tests
        </button>
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          {group.page_a?.name}
          <span className="text-xs text-gray-400 font-normal">vs</span>
          {group.page_b?.name}
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              group.status === "active"
                ? "bg-green-50 text-green-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {group.status === "active" ? `Running ${daysRunning}d` : "Completed"}
          </span>
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">
          {group.concept_count} concept{group.concept_count !== 1 ? "s" : ""} testing
          &middot; {group.markets.join(", ")}
        </p>
      </div>

      {/* Page comparison cards */}
      <div className="grid grid-cols-2 gap-4">
        <PageCard
          page={group.page_a}
          label="Page A"
          isWinner={group.winner_page_id === group.page_a?.id}
        />
        <PageCard
          page={group.page_b}
          label="Page B"
          isWinner={group.winner_page_id === group.page_b?.id}
        />
      </div>

      {/* Stats */}
      {loadingStats ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : a && b ? (
        <div className="space-y-4">
          {/* Aggregated metrics table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">
                    Metric
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">
                    Page A
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">
                    Page B
                  </th>
                </tr>
              </thead>
              <tbody>
                <MetricRow label="Spend" a={`${a.spend.toLocaleString()} SEK`} b={`${b.spend.toLocaleString()} SEK`} />
                <MetricRow label="Impressions" a={a.impressions.toLocaleString()} b={b.impressions.toLocaleString()} />
                <MetricRow label="Clicks" a={a.clicks.toLocaleString()} b={b.clicks.toLocaleString()} />
                <MetricRow label="CTR" a={`${a.ctr}%`} b={`${b.ctr}%`} higherBetter aVal={a.ctr} bVal={b.ctr} />
                <MetricRow label="Purchases" a={String(a.purchases)} b={String(b.purchases)} higherBetter aVal={a.purchases} bVal={b.purchases} />
                <MetricRow label="Revenue" a={`${a.revenue.toLocaleString()} SEK`} b={`${b.revenue.toLocaleString()} SEK`} higherBetter aVal={a.revenue} bVal={b.revenue} />
                <MetricRow label="CPA" a={a.cpa > 0 ? `${a.cpa} SEK` : "—"} b={b.cpa > 0 ? `${b.cpa} SEK` : "—"} lowerBetter aVal={a.cpa} bVal={b.cpa} />
                <MetricRow label="ROAS" a={`${a.roas}x`} b={`${b.roas}x`} higherBetter aVal={a.roas} bVal={b.roas} />
                <MetricRow label="CVR" a={`${a.cvr}%`} b={`${b.cvr}%`} higherBetter aVal={a.cvr} bVal={b.cvr} />
              </tbody>
            </table>
          </div>

          {/* Significance */}
          {stats?.aggregated.significance && (
            <div
              className={`px-4 py-3 rounded-xl border text-sm ${
                stats.aggregated.significance.confident
                  ? "bg-green-50 border-green-200 text-green-800"
                  : "bg-gray-50 border-gray-200 text-gray-600"
              }`}
            >
              {stats.aggregated.significance.confident ? (
                <>
                  <strong>Statistically significant</strong> (p=
                  {stats.aggregated.significance.p_value}) — Page{" "}
                  {stats.aggregated.significance.winner?.toUpperCase()} has a significantly
                  higher conversion rate.
                </>
              ) : !stats.aggregated.significance.sample_size_ok ? (
                <>
                  <strong>Not enough data yet</strong> — Need at least 30 clicks per
                  variant. Currently: A={a.clicks} clicks, B={b.clicks} clicks.
                </>
              ) : (
                <>
                  <strong>Not yet significant</strong> (p=
                  {stats.aggregated.significance.p_value}) — Keep running to gather more
                  data.
                </>
              )}
            </div>
          )}

          {/* Per-concept breakdown */}
          {stats?.perConcept && stats.perConcept.length > 1 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setConceptsExpanded(!conceptsExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <span>Per-concept breakdown ({stats.perConcept.length} concepts)</span>
                {conceptsExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
              </button>
              {conceptsExpanded && (
                <div className="border-t border-gray-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-2 font-medium text-gray-500">
                          Concept
                        </th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500">
                          A ROAS
                        </th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500">
                          B ROAS
                        </th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500">
                          A CPA
                        </th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500">
                          B CPA
                        </th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500">
                          A CVR
                        </th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500">
                          B CVR
                        </th>
                        <th className="text-center px-3 py-2 font-medium text-gray-500">
                          Favors
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.perConcept.map((pc) => {
                        const favorsA =
                          pc.variants.a.roas > pc.variants.b.roas ||
                          (pc.variants.a.roas === pc.variants.b.roas &&
                            pc.variants.a.cvr > pc.variants.b.cvr);
                        const favorsB =
                          pc.variants.b.roas > pc.variants.a.roas ||
                          (pc.variants.a.roas === pc.variants.b.roas &&
                            pc.variants.b.cvr > pc.variants.a.cvr);
                        const hasData =
                          pc.variants.a.clicks > 0 || pc.variants.b.clicks > 0;

                        return (
                          <tr
                            key={pc.conceptId}
                            className="border-b border-gray-50 last:border-0"
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                {pc.thumbnail && (
                                  <img
                                    src={pc.thumbnail}
                                    alt=""
                                    className="w-6 h-6 rounded object-cover shrink-0"
                                  />
                                )}
                                <span className="text-gray-800 truncate max-w-[160px]">
                                  {pc.conceptName}
                                </span>
                              </div>
                            </td>
                            <td
                              className={`px-3 py-2.5 text-right font-medium ${
                                favorsA && hasData ? "text-green-700" : "text-gray-600"
                              }`}
                            >
                              {pc.variants.a.roas}x
                            </td>
                            <td
                              className={`px-3 py-2.5 text-right font-medium ${
                                favorsB && hasData ? "text-green-700" : "text-gray-600"
                              }`}
                            >
                              {pc.variants.b.roas}x
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-600">
                              {pc.variants.a.cpa > 0 ? `${pc.variants.a.cpa}` : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-600">
                              {pc.variants.b.cpa > 0 ? `${pc.variants.b.cpa}` : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-600">
                              {pc.variants.a.cvr}%
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-600">
                              {pc.variants.b.cvr}%
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {!hasData ? (
                                <span className="text-gray-300">—</span>
                              ) : favorsA ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                                  A
                                </span>
                              ) : favorsB ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium">
                                  B
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Winner buttons */}
          {group.status === "active" && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => declareWinner("a")}
                disabled={declaring}
                className="flex-1 flex items-center justify-center gap-2 bg-white border border-gray-300 hover:border-indigo-400 text-gray-800 rounded-xl px-4 py-3 text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Trophy className="w-4 h-4" />
                Winner: Page A
              </button>
              <button
                onClick={() => declareWinner("b")}
                disabled={declaring}
                className="flex-1 flex items-center justify-center gap-2 bg-white border border-gray-300 hover:border-indigo-400 text-gray-800 rounded-xl px-4 py-3 text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Trophy className="w-4 h-4" />
                Winner: Page B
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-sm text-gray-400">
            No performance data yet — data syncs twice daily (6 AM &amp; 6 PM UTC)
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function findOutliers(
  perConcept: PerConceptStats[],
  winner: "a" | "b"
): Array<{ name: string; metric: string }> {
  const loser = winner === "a" ? "b" : "a";
  const outliers: Array<{ name: string; metric: string }> = [];

  for (const pc of perConcept) {
    const winnerRoas = pc.variants[winner].roas;
    const loserRoas = pc.variants[loser].roas;
    const hasData = pc.variants[winner].clicks > 0 || pc.variants[loser].clicks > 0;

    if (hasData && loserRoas > winnerRoas && loserRoas > 0) {
      const ratio =
        winnerRoas > 0
          ? `${(loserRoas / winnerRoas).toFixed(1)}x better ROAS on Page ${loser.toUpperCase()}`
          : `ROAS ${loserRoas}x on Page ${loser.toUpperCase()} vs 0x`;
      outliers.push({ name: pc.conceptName, metric: ratio });
    }
  }

  return outliers;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function PageCard({
  page,
  label,
  isWinner,
}: {
  page: { id: string; name: string; slug: string; thumbnail_url: string | null };
  label: string;
  isWinner: boolean;
}) {
  return (
    <div
      className={`rounded-xl border-2 overflow-hidden ${
        isWinner ? "border-amber-400 bg-amber-50/30" : "border-gray-200"
      }`}
    >
      {page.thumbnail_url && (
        <div className="aspect-[16/9] bg-gray-100">
          <img
            src={page.thumbnail_url}
            alt=""
            className="w-full h-full object-cover object-top"
          />
        </div>
      )}
      <div className="p-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-gray-400 uppercase">{label}</span>
          {isWinner && <Trophy className="w-3.5 h-3.5 text-amber-500" />}
        </div>
        <p className="text-sm font-medium text-gray-900 mt-0.5 truncate">{page.name}</p>
        <a
          href={`/pages/${page.id}`}
          className="flex items-center gap-1 text-[10px] text-indigo-500 hover:text-indigo-700 mt-1"
        >
          <ExternalLink className="w-3 h-3" />
          View page
        </a>
      </div>
    </div>
  );
}

function MetricRow({
  label,
  a,
  b,
  higherBetter,
  lowerBetter,
  aVal,
  bVal,
}: {
  label: string;
  a: string;
  b: string;
  higherBetter?: boolean;
  lowerBetter?: boolean;
  aVal?: number;
  bVal?: number;
}) {
  let aWins = false;
  let bWins = false;
  if (aVal !== undefined && bVal !== undefined && aVal !== bVal) {
    if (higherBetter) {
      aWins = aVal > bVal;
      bWins = bVal > aVal;
    } else if (lowerBetter) {
      aWins = aVal < bVal && aVal > 0;
      bWins = bVal < aVal && bVal > 0;
    }
  }

  return (
    <tr className="border-b border-gray-50 last:border-0">
      <td className="px-4 py-2.5 text-gray-600">{label}</td>
      <td
        className={`px-4 py-2.5 text-right font-medium ${
          aWins ? "text-green-700" : "text-gray-900"
        }`}
      >
        {a}
      </td>
      <td
        className={`px-4 py-2.5 text-right font-medium ${
          bWins ? "text-green-700" : "text-gray-900"
        }`}
      >
        {b}
      </td>
    </tr>
  );
}
