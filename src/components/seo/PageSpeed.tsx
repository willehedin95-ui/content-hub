"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  Gauge,
  Zap,
  Monitor,
  Smartphone,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  AlertTriangle,
  Plus,
  X,
  Save,
} from "lucide-react";

interface PageSpeedRow {
  id: string;
  url: string;
  strategy: "mobile" | "desktop";
  performance_score: number | null; // 0-1 from DB
  lcp_ms: number | null;
  fcp_ms: number | null;
  cls: number | null;
  tbt_ms: number | null;
  si_ms: number | null;
  ttfb_ms: number | null;
  opportunities: { id: string; title: string; savings_ms: number }[];
  checked_at: string;
}

interface GroupedResult {
  url: string;
  mobile: PageSpeedRow | null;
  desktop: PageSpeedRow | null;
}

function scoreToPercent(score: number | null): number | null {
  if (score === null) return null;
  // DB stores 0-1, display as 0-100
  return Math.round(score * 100);
}

function scoreColor(score: number): string {
  if (score >= 90) return "text-green-600 bg-green-50 border-green-200";
  if (score >= 50) return "text-yellow-600 bg-yellow-50 border-yellow-200";
  return "text-red-600 bg-red-50 border-red-200";
}

function scoreBg(score: number): string {
  if (score >= 90) return "bg-green-500";
  if (score >= 50) return "bg-yellow-500";
  return "bg-red-500";
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function cwvRating(
  metric: string,
  value: number
): "good" | "needs-improvement" | "poor" {
  switch (metric) {
    case "lcp":
      return value <= 2500 ? "good" : value <= 4000 ? "needs-improvement" : "poor";
    case "fcp":
      return value <= 1800 ? "good" : value <= 3000 ? "needs-improvement" : "poor";
    case "cls":
      return value <= 0.1 ? "good" : value <= 0.25 ? "needs-improvement" : "poor";
    case "tbt":
      return value <= 200 ? "good" : value <= 600 ? "needs-improvement" : "poor";
    case "si":
      return value <= 3400 ? "good" : value <= 5800 ? "needs-improvement" : "poor";
    case "ttfb":
      return value <= 800 ? "good" : value <= 1800 ? "needs-improvement" : "poor";
    default:
      return "good";
  }
}

function ratingColor(rating: "good" | "needs-improvement" | "poor"): string {
  switch (rating) {
    case "good":
      return "text-green-600";
    case "needs-improvement":
      return "text-yellow-600";
    case "poor":
      return "text-red-600";
  }
}

function ratingDot(rating: "good" | "needs-improvement" | "poor"): string {
  switch (rating) {
    case "good":
      return "bg-green-500";
    case "needs-improvement":
      return "bg-yellow-500";
    case "poor":
      return "bg-red-500";
  }
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-400">—</span>;
  return (
    <span
      className={`inline-flex items-center justify-center w-12 h-12 rounded-full border-2 text-lg font-bold ${scoreColor(score)}`}
    >
      {score}
    </span>
  );
}

function CwvRow({
  label,
  value,
  metric,
  unit,
}: {
  label: string;
  value: number | null;
  metric: string;
  unit: "ms" | "score";
}) {
  if (value === null) return null;
  const rating = cwvRating(metric, value);
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${ratingDot(rating)}`} />
        <span className={`text-sm font-medium ${ratingColor(rating)}`}>
          {unit === "ms" ? formatMs(value) : value.toFixed(3)}
        </span>
      </div>
    </div>
  );
}

export default function PageSpeed() {
  const [results, setResults] = useState<PageSpeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<Record<string, boolean>>({});
  const [checkingAll, setCheckingAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");

  // Settings state
  const [urls, setUrls] = useState<string[]>([]);
  const [threshold, setThreshold] = useState(50);
  const [enabled, setEnabled] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newUrl, setNewUrl] = useState("");

  const fetchResults = useCallback(async () => {
    try {
      const res = await fetch("/api/seo/pagespeed/results");
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      setUrls((data.pagespeed_urls as string[]) ?? []);
      setThreshold((data.pagespeed_threshold as number) ?? 50);
      setEnabled(!!data.pagespeed_enabled);
      setSettingsLoaded(true);
    } catch {
      setSettingsLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchResults();
    fetchSettings();
  }, [fetchResults, fetchSettings]);

  const grouped: GroupedResult[] = (() => {
    const map = new Map<string, GroupedResult>();
    for (const r of results) {
      if (!map.has(r.url)) {
        map.set(r.url, { url: r.url, mobile: null, desktop: null });
      }
      const g = map.get(r.url)!;
      if (r.strategy === "mobile" && !g.mobile) g.mobile = r;
      if (r.strategy === "desktop" && !g.desktop) g.desktop = r;
    }
    return Array.from(map.values());
  })();

  const checkUrl = async (url: string, strat: "mobile" | "desktop") => {
    const key = `${url}:${strat}`;
    setChecking((prev) => ({ ...prev, [key]: true }));
    try {
      await fetch("/api/seo/pagespeed/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, strategy: strat }),
      });
      await fetchResults();
    } catch {
      // ignore
    } finally {
      setChecking((prev) => ({ ...prev, [key]: false }));
    }
  };

  const checkAllUrls = async () => {
    if (urls.length === 0) return;
    setCheckingAll(true);
    for (const url of urls) {
      for (const strat of ["mobile", "desktop"] as const) {
        await checkUrl(url, strat);
        // Rate limit delay
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    setCheckingAll(false);
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings");
      const current = await res.json();
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...current,
          pagespeed_urls: urls,
          pagespeed_threshold: threshold,
          pagespeed_enabled: enabled,
        }),
      });
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const addUrl = () => {
    const trimmed = newUrl.trim();
    if (!trimmed || urls.includes(trimmed)) return;
    setUrls((prev) => [...prev, trimmed]);
    setNewUrl("");
  };

  const removeUrl = (url: string) => {
    setUrls((prev) => prev.filter((u) => u !== url));
  };

  // Compute averages for summary cards
  const avgMobile = (() => {
    const scores = grouped
      .map((g) => scoreToPercent(g.mobile?.performance_score ?? null))
      .filter((s): s is number => s !== null);
    return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  })();

  const avgDesktop = (() => {
    const scores = grouped
      .map((g) => scoreToPercent(g.desktop?.performance_score ?? null))
      .filter((s): s is number => s !== null);
    return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  })();

  const lastChecked = results.length
    ? new Date(
        Math.max(...results.map((r) => new Date(r.checked_at).getTime()))
      )
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Loading speed data...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Mobile Avg</span>
            <Smartphone className="w-4 h-4 text-gray-400" />
          </div>
          <div className="flex items-center gap-2">
            {avgMobile !== null ? (
              <>
                <span
                  className={`w-3 h-3 rounded-full ${scoreBg(avgMobile)}`}
                />
                <span className="text-2xl font-semibold text-gray-900">
                  {avgMobile}
                </span>
              </>
            ) : (
              <span className="text-2xl text-gray-300">—</span>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Desktop Avg</span>
            <Monitor className="w-4 h-4 text-gray-400" />
          </div>
          <div className="flex items-center gap-2">
            {avgDesktop !== null ? (
              <>
                <span
                  className={`w-3 h-3 rounded-full ${scoreBg(avgDesktop)}`}
                />
                <span className="text-2xl font-semibold text-gray-900">
                  {avgDesktop}
                </span>
              </>
            ) : (
              <span className="text-2xl text-gray-300">—</span>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">URLs Monitored</span>
            <Gauge className="w-4 h-4 text-gray-400" />
          </div>
          <span className="text-2xl font-semibold text-gray-900">
            {urls.length}
          </span>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Last Checked</span>
            <Zap className="w-4 h-4 text-gray-400" />
          </div>
          <span className="text-sm font-medium text-gray-900">
            {lastChecked
              ? lastChecked.toLocaleDateString("sv", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Never"}
          </span>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStrategy("mobile")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              strategy === "mobile"
                ? "bg-indigo-100 text-indigo-700 font-medium"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 inline mr-1" />
            Mobile
          </button>
          <button
            onClick={() => setStrategy("desktop")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              strategy === "desktop"
                ? "bg-indigo-100 text-indigo-700 font-medium"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Monitor className="w-3.5 h-3.5 inline mr-1" />
            Desktop
          </button>
        </div>

        <button
          onClick={checkAllUrls}
          disabled={checkingAll || urls.length === 0}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw
            className={`w-4 h-4 ${checkingAll ? "animate-spin" : ""}`}
          />
          {checkingAll ? "Checking..." : "Check All"}
        </button>
      </div>

      {/* Results Table */}
      {grouped.length > 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                  URL
                </th>
                <th className="text-center text-xs font-medium text-gray-500 px-4 py-3 w-24">
                  Score
                </th>
                <th className="text-center text-xs font-medium text-gray-500 px-4 py-3 w-20">
                  LCP
                </th>
                <th className="text-center text-xs font-medium text-gray-500 px-4 py-3 w-20">
                  CLS
                </th>
                <th className="text-center text-xs font-medium text-gray-500 px-4 py-3 w-20">
                  TBT
                </th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3 w-32">
                  Checked
                </th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => {
                const row = strategy === "mobile" ? g.mobile : g.desktop;
                const score = scoreToPercent(row?.performance_score ?? null);
                const isExpanded = expanded === g.url;
                const isChecking =
                  checking[`${g.url}:mobile`] || checking[`${g.url}:desktop`];

                return (
                  <Fragment key={g.url}>
                    <tr
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                      onClick={() =>
                        setExpanded(isExpanded ? null : g.url)
                      }
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          )}
                          <span className="text-sm font-medium text-gray-900 truncate max-w-md">
                            {new URL(g.url).pathname === "/"
                              ? g.url
                              : new URL(g.url).pathname}
                          </span>
                          <a
                            href={g.url}
                            target="_blank"
                            rel="noopener"
                            onClick={(e) => e.stopPropagation()}
                            className="text-gray-400 hover:text-indigo-600"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ScoreBadge score={score} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row?.lcp_ms != null ? (
                          <span
                            className={`text-sm font-medium ${ratingColor(cwvRating("lcp", row.lcp_ms))}`}
                          >
                            {formatMs(row.lcp_ms)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row?.cls != null ? (
                          <span
                            className={`text-sm font-medium ${ratingColor(cwvRating("cls", row.cls))}`}
                          >
                            {row.cls.toFixed(3)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row?.tbt_ms != null ? (
                          <span
                            className={`text-sm font-medium ${ratingColor(cwvRating("tbt", row.tbt_ms))}`}
                          >
                            {formatMs(row.tbt_ms)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-500">
                        {row?.checked_at
                          ? timeAgo(new Date(row.checked_at))
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            checkUrl(g.url, strategy);
                          }}
                          disabled={isChecking}
                          className="p-1.5 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                          title="Re-check"
                        >
                          <RefreshCw
                            className={`w-4 h-4 ${isChecking ? "animate-spin" : ""}`}
                          />
                        </button>
                      </td>
                    </tr>

                    {/* Expanded detail */}
                    {isExpanded && row && (
                      <tr>
                        <td colSpan={7} className="bg-gray-50 px-4 py-4">
                          <div className="grid grid-cols-2 gap-6">
                            {/* Core Web Vitals */}
                            <div>
                              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">
                                Core Web Vitals
                              </h4>
                              <div className="space-y-1">
                                <CwvRow
                                  label="Largest Contentful Paint (LCP)"
                                  value={row.lcp_ms}
                                  metric="lcp"
                                  unit="ms"
                                />
                                <CwvRow
                                  label="First Contentful Paint (FCP)"
                                  value={row.fcp_ms}
                                  metric="fcp"
                                  unit="ms"
                                />
                                <CwvRow
                                  label="Cumulative Layout Shift (CLS)"
                                  value={row.cls}
                                  metric="cls"
                                  unit="score"
                                />
                                <CwvRow
                                  label="Total Blocking Time (TBT)"
                                  value={row.tbt_ms}
                                  metric="tbt"
                                  unit="ms"
                                />
                                <CwvRow
                                  label="Speed Index (SI)"
                                  value={row.si_ms}
                                  metric="si"
                                  unit="ms"
                                />
                                <CwvRow
                                  label="Time to First Byte (TTFB)"
                                  value={row.ttfb_ms}
                                  metric="ttfb"
                                  unit="ms"
                                />
                              </div>
                            </div>

                            {/* Top Opportunities */}
                            <div>
                              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">
                                Top Opportunities
                              </h4>
                              {row.opportunities?.length > 0 ? (
                                <div className="space-y-2">
                                  {row.opportunities.map((opp) => (
                                    <div
                                      key={opp.id}
                                      className="flex items-start justify-between text-sm"
                                    >
                                      <span className="text-gray-700">
                                        {opp.title}
                                      </span>
                                      <span className="text-orange-600 font-medium ml-2 whitespace-nowrap">
                                        -{formatMs(opp.savings_ms)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-400">
                                  No significant opportunities found
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Gauge className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-1">No speed data yet</p>
          <p className="text-sm text-gray-400">
            Add URLs below and click &quot;Check All&quot; to run your first
            PageSpeed check.
          </p>
        </div>
      )}

      {/* Settings Section */}
      {settingsLoaded && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            PageSpeed Monitoring Settings
          </h3>

          {/* Enable toggle */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-sm font-medium text-gray-700">
                Daily automated check
              </span>
              <p className="text-xs text-gray-500">
                Runs every morning at 06:00 UTC. Sends a Telegram alert if
                scores drop.
              </p>
            </div>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enabled ? "bg-indigo-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Alert threshold */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Alert threshold
            </label>
            <p className="text-xs text-gray-500 mb-2">
              You&apos;ll get a Telegram alert if any score drops below this value.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={20}
                max={90}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="flex-1"
              />
              <span
                className={`text-sm font-bold w-8 text-center ${
                  threshold >= 90
                    ? "text-green-600"
                    : threshold >= 50
                      ? "text-yellow-600"
                      : "text-red-600"
                }`}
              >
                {threshold}
              </span>
            </div>
          </div>

          {/* URLs to monitor */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URLs to monitor
            </label>
            <div className="space-y-2 mb-2">
              {urls.map((url) => (
                <div
                  key={url}
                  className="flex items-center gap-2 text-sm bg-gray-50 rounded-md px-3 py-2"
                >
                  <span className="flex-1 text-gray-700 truncate">{url}</span>
                  <button
                    onClick={() => removeUrl(url)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addUrl()}
                placeholder="https://get-renew.com"
                className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <button
                onClick={addUrl}
                disabled={!newUrl.trim()}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-indigo-600 border border-indigo-300 rounded-md hover:bg-indigo-50 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>
          </div>

          {/* Save button */}
          <button
            onClick={saveSettings}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      )}

      {/* Info note */}
      <div className="flex items-start gap-2 text-xs text-gray-400 px-1">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span>
          Scores come from Google PageSpeed Insights (Lighthouse). Mobile scores
          are typically lower than desktop. A score above 50 is acceptable for
          Shopify stores; above 70 is good.
        </span>
      </div>
    </div>
  );
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
