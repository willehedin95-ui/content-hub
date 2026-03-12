"use client";

import { useState, useEffect, useCallback } from "react";
import { FlaskConical, Trophy, Loader2, ExternalLink, ArrowRight } from "lucide-react";

interface PageTestAdset {
  id: string;
  variant: string;
  meta_adset_id: string;
  language: string;
  country: string;
}

interface PageTest {
  id: string;
  name: string;
  status: "active" | "completed";
  winner_page_id: string | null;
  created_at: string;
  image_jobs: {
    id: string;
    name: string;
    product: string;
    concept_number: number | null;
    source_images: Array<{ original_url: string }>;
  };
  page_a: { id: string; name: string; slug: string; thumbnail_url: string | null };
  page_b: { id: string; name: string; slug: string; thumbnail_url: string | null };
  page_test_adsets: PageTestAdset[];
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

interface StatsResponse {
  variants: { a: VariantStats | null; b: VariantStats | null };
  significance: { confident: boolean; p_value: number; winner: string | null; sample_size_ok: boolean } | null;
}

export default function PageTestsClient() {
  const [tests, setTests] = useState<PageTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTest, setSelectedTest] = useState<string | null>(null);

  const loadTests = useCallback(async () => {
    const res = await fetch("/api/page-tests");
    if (res.ok) {
      const data = await res.json();
      setTests(data.tests);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadTests(); }, [loadTests]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (tests.length === 0) {
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

  if (selectedTest) {
    const test = tests.find((t) => t.id === selectedTest);
    if (test) {
      return (
        <PageTestDetail
          test={test}
          onBack={() => setSelectedTest(null)}
          onUpdate={loadTests}
        />
      );
    }
  }

  return (
    <div className="space-y-3 mt-4">
      {tests.map((test) => {
        const thumb = test.image_jobs?.source_images?.[0]?.original_url;
        const daysRunning = Math.ceil(
          (Date.now() - new Date(test.created_at).getTime()) / (1000 * 60 * 60 * 24)
        );
        const markets = [...new Set(test.page_test_adsets.map((a) => a.country))];

        return (
          <button
            key={test.id}
            onClick={() => setSelectedTest(test.id)}
            className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-300 transition-colors"
          >
            <div className="flex items-start gap-4">
              {/* Concept thumbnail */}
              {thumb && (
                <img src={thumb} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {test.image_jobs?.name ?? test.name}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    test.status === "active"
                      ? "bg-green-50 text-green-700"
                      : "bg-gray-100 text-gray-600"
                  }`}>
                    {test.status === "active" ? "Running" : "Completed"}
                  </span>
                  {test.winner_page_id && (
                    <Trophy className="w-3.5 h-3.5 text-amber-500" />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                  <span className="truncate">{test.page_a?.name}</span>
                  <span className="text-gray-300">vs</span>
                  <span className="truncate">{test.page_b?.name}</span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400">
                  <span>{daysRunning}d running</span>
                  <span>{markets.join(", ")}</span>
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
/*  Page Test Detail (comparison view)                                 */
/* ------------------------------------------------------------------ */

function PageTestDetail({
  test,
  onBack,
  onUpdate,
}: {
  test: PageTest;
  onBack: () => void;
  onUpdate: () => void;
}) {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [declaring, setDeclaring] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/page-tests/${test.id}/stats`);
      if (res.ok) setStats(await res.json());
      setLoadingStats(false);
    }
    load();
    // Poll every 60s while active
    if (test.status === "active") {
      const iv = setInterval(load, 60_000);
      return () => clearInterval(iv);
    }
  }, [test.id, test.status]);

  async function declareWinner(winner: "a" | "b") {
    const pageName = winner === "a" ? test.page_a?.name : test.page_b?.name;
    if (!confirm(`Declare "${pageName}" as winner?\n\nThis will pause ad sets for the losing page.`)) return;
    setDeclaring(true);
    const res = await fetch(`/api/page-tests/${test.id}/winner`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winner }),
    });
    if (res.ok) {
      onUpdate();
    }
    setDeclaring(false);
  }

  const daysRunning = Math.ceil(
    (Date.now() - new Date(test.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  const a = stats?.variants.a;
  const b = stats?.variants.b;

  return (
    <div className="space-y-6 mt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className="text-xs text-indigo-600 hover:text-indigo-700 mb-1">
            &larr; Back to tests
          </button>
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            {test.image_jobs?.name ?? test.name}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              test.status === "active"
                ? "bg-green-50 text-green-700"
                : "bg-gray-100 text-gray-600"
            }`}>
              {test.status === "active" ? `Running ${daysRunning}d` : "Completed"}
            </span>
          </h2>
        </div>
      </div>

      {/* Page comparison cards */}
      <div className="grid grid-cols-2 gap-4">
        <PageCard
          page={test.page_a}
          label="Page A"
          isWinner={test.winner_page_id === test.page_a?.id}
        />
        <PageCard
          page={test.page_b}
          label="Page B"
          isWinner={test.winner_page_id === test.page_b?.id}
        />
      </div>

      {/* Stats comparison */}
      {loadingStats ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : a && b ? (
        <div className="space-y-4">
          {/* Metrics table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Metric</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Page A</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Page B</th>
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
          {stats?.significance && (
            <div className={`px-4 py-3 rounded-xl border text-sm ${
              stats.significance.confident
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-gray-50 border-gray-200 text-gray-600"
            }`}>
              {stats.significance.confident ? (
                <>
                  <strong>Statistically significant</strong> (p={stats.significance.p_value}) —{" "}
                  Page {stats.significance.winner?.toUpperCase()} has a significantly higher conversion rate.
                </>
              ) : !stats.significance.sample_size_ok ? (
                <>
                  <strong>Not enough data yet</strong> — Need at least 30 clicks per variant for significance testing.
                  Currently: A={a.clicks} clicks, B={b.clicks} clicks.
                </>
              ) : (
                <>
                  <strong>Not yet significant</strong> (p={stats.significance.p_value}) — Keep running to gather more data.
                </>
              )}
            </div>
          )}

          {/* Winner buttons */}
          {test.status === "active" && (
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
          <p className="text-sm text-gray-400">No performance data yet — data syncs twice daily (6 AM & 6 PM UTC)</p>
        </div>
      )}
    </div>
  );
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
    <div className={`rounded-xl border-2 overflow-hidden ${
      isWinner ? "border-amber-400 bg-amber-50/30" : "border-gray-200"
    }`}>
      {page.thumbnail_url && (
        <div className="aspect-[16/9] bg-gray-100">
          <img src={page.thumbnail_url} alt="" className="w-full h-full object-cover object-top" />
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
      <td className={`px-4 py-2.5 text-right font-medium ${aWins ? "text-green-700" : "text-gray-900"}`}>
        {a}
      </td>
      <td className={`px-4 py-2.5 text-right font-medium ${bWins ? "text-green-700" : "text-gray-900"}`}>
        {b}
      </td>
    </tr>
  );
}
