"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  DollarSign,
  Languages,
  Image as ImageIcon,
  Coins,
  Loader2,
  AlertCircle,
  MessageSquare,
  Download,
} from "lucide-react";
import { UsageLog } from "@/types";

interface Summary {
  total_cost_usd: number;
  translation_count: number;
  image_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
}

const PERIOD_OPTIONS = [
  { label: "All time", value: 0 },
  { label: "Last 7 days", value: 7 },
  { label: "Last 30 days", value: 30 },
  { label: "Last 90 days", value: 90 },
];

export default function UsagePage() {
  const [logs, setLogs] = useState<(UsageLog & { pages?: { name: string } | null })[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(0);
  const [sekRate, setSekRate] = useState(() => {
    if (typeof window !== "undefined") {
      return parseFloat(localStorage.getItem("sek_rate") || "10.50");
    }
    return 10.5;
  });

  const [fetchError, setFetchError] = useState("");

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    setFetchError("");
    try {
      const params = days > 0 ? `?days=${days}` : "";
      const res = await fetch(`/api/usage${params}`);
      if (!res.ok) throw new Error("Failed to load usage data");
      const data = await res.json();
      setLogs(data.logs);
      setSummary(data.summary);
    } catch {
      setFetchError("Failed to load usage data. Try refreshing the page.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  function handleSekRateChange(value: string) {
    const rate = parseFloat(value) || 0;
    setSekRate(rate);
    localStorage.setItem("sek_rate", String(rate));
  }

  function formatUsd(amount: number) {
    return `$${amount.toFixed(4)}`;
  }

  function formatSek(usd: number) {
    return `${(usd * sekRate).toFixed(2)} kr`;
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString("sv-SE", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatTokens(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  }

  const breakdown = useMemo(() => {
    const cats = { pages: 0, images: 0, adCopy: 0 };
    for (const log of logs) {
      const cost = Number(log.cost_usd);
      const purpose = (log.metadata as Record<string, unknown>)?.purpose as string | undefined;
      if (purpose === "ad_copy_translation" || purpose === "ad_copy_quality_analysis") {
        cats.adCopy += cost;
      } else if (log.type === "image_generation" || purpose === "quality_analysis") {
        cats.images += cost;
      } else {
        cats.pages += cost;
      }
    }
    const total = cats.pages + cats.images + cats.adCopy;
    return { ...cats, total };
  }, [logs]);

  function exportCsv() {
    if (logs.length === 0) return;
    const header = "Date,Type,Model,Page,Input Tokens,Output Tokens,Cost USD,Cost SEK";
    const rows = logs.map((log) => {
      const date = new Date(log.created_at).toISOString();
      const page = log.pages?.name?.replace(/,/g, " ") ?? "";
      return `${date},${log.type},${log.model},${page},${log.input_tokens},${log.output_tokens},${Number(log.cost_usd).toFixed(4)},${(Number(log.cost_usd) * sekRate).toFixed(2)}`;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `content-hub-usage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Usage & Costs</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">USD → SEK</label>
            <input
              type="number"
              step="0.01"
              value={sekRate}
              onChange={(e) => handleSekRateChange(e.target.value)}
              className="w-20 bg-white border border-gray-300 text-gray-800 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-white border border-gray-300 text-gray-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={exportCsv}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
            title="Export as CSV"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span className="text-xs text-gray-400 uppercase tracking-wider">
                Total Cost (USD)
              </span>
            </div>
            <p className="text-lg font-semibold text-gray-900">
              {formatUsd(summary.total_cost_usd)}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Coins className="w-4 h-4 text-amber-600" />
              <span className="text-xs text-gray-400 uppercase tracking-wider">
                Total Cost (SEK)
              </span>
            </div>
            <p className="text-lg font-semibold text-gray-900">
              {formatSek(summary.total_cost_usd)}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Languages className="w-4 h-4 text-indigo-600" />
              <span className="text-xs text-gray-400 uppercase tracking-wider">
                Translations
              </span>
            </div>
            <p className="text-lg font-semibold text-gray-900">
              {summary.translation_count}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {formatTokens(summary.total_input_tokens + summary.total_output_tokens)} tokens
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon className="w-4 h-4 text-pink-600" />
              <span className="text-xs text-gray-400 uppercase tracking-wider">
                Image Generations
              </span>
            </div>
            <p className="text-lg font-semibold text-gray-900">
              {summary.image_count}
            </p>
          </div>
        </div>
      )}

      {/* Cost breakdown by feature */}
      {breakdown.total > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">
            Cost Breakdown
          </p>
          <div className="flex items-center gap-1 h-3 rounded-full overflow-hidden bg-gray-100 mb-3">
            {breakdown.pages > 0 && (
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${(breakdown.pages / breakdown.total) * 100}%` }}
              />
            )}
            {breakdown.images > 0 && (
              <div
                className="h-full bg-pink-500 rounded-full transition-all"
                style={{ width: `${(breakdown.images / breakdown.total) * 100}%` }}
              />
            )}
            {breakdown.adCopy > 0 && (
              <div
                className="h-full bg-amber-500 rounded-full transition-all"
                style={{ width: `${(breakdown.adCopy / breakdown.total) * 100}%` }}
              />
            )}
          </div>
          <div className="flex items-center gap-6 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              <Languages className="w-3 h-3 text-gray-400" />
              <span className="text-gray-600">Pages</span>
              <span className="text-gray-400 tabular-nums">{formatUsd(breakdown.pages)}</span>
              <span className="text-gray-300 tabular-nums">{formatSek(breakdown.pages)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-pink-500" />
              <ImageIcon className="w-3 h-3 text-gray-400" />
              <span className="text-gray-600">Images</span>
              <span className="text-gray-400 tabular-nums">{formatUsd(breakdown.images)}</span>
              <span className="text-gray-300 tabular-nums">{formatSek(breakdown.images)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <MessageSquare className="w-3 h-3 text-gray-400" />
              <span className="text-gray-600">Ad Copy</span>
              <span className="text-gray-400 tabular-nums">{formatUsd(breakdown.adCopy)}</span>
              <span className="text-gray-300 tabular-nums">{formatSek(breakdown.adCopy)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {fetchError && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {fetchError}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-gray-400">No usage data yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Translate a page or generate an image to see costs here.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wider font-medium">
                  Date
                </th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wider font-medium">
                  Type
                </th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wider font-medium">
                  Model
                </th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wider font-medium">
                  Page
                </th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wider font-medium text-right">
                  Tokens
                </th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wider font-medium text-right">
                  Cost (USD)
                </th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wider font-medium text-right">
                  Cost (SEK)
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-gray-200 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-2.5 text-xs text-gray-500">
                    {formatDate(log.created_at)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        log.type === "translation"
                          ? "bg-indigo-50 text-indigo-600"
                          : "bg-pink-50 text-pink-600"
                      }`}
                    >
                      {log.type === "translation" ? (
                        <Languages className="w-3 h-3" />
                      ) : (
                        <ImageIcon className="w-3 h-3" />
                      )}
                      {log.type === "translation" ? "Translation" : "Image"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">
                    {log.model}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 truncate max-w-[160px]">
                    {log.pages
                      ? log.pages.name
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-400 text-right tabular-nums">
                    {log.input_tokens + log.output_tokens > 0
                      ? formatTokens(log.input_tokens + log.output_tokens)
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-700 text-right tabular-nums">
                    {formatUsd(Number(log.cost_usd))}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-700 text-right tabular-nums">
                    {formatSek(Number(log.cost_usd))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
