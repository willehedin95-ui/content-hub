"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  Languages,
  Image as ImageIcon,
  Coins,
  Loader2,
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

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    const params = days > 0 ? `?days=${days}` : "";
    const res = await fetch(`/api/usage${params}`);
    if (res.ok) {
      const data = await res.json();
      setLogs(data.logs);
      setSummary(data.summary);
    }
    setLoading(false);
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

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">Usage & Costs</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">USD → SEK</label>
            <input
              type="number"
              step="0.01"
              value={sekRate}
              onChange={(e) => handleSekRateChange(e.target.value)}
              className="w-20 bg-[#0a0c14] border border-[#1e2130] text-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-[#0a0c14] border border-[#1e2130] text-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-[#0f1117] border border-[#1e2130] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                Total Cost (USD)
              </span>
            </div>
            <p className="text-lg font-semibold text-white">
              {formatUsd(summary.total_cost_usd)}
            </p>
          </div>
          <div className="bg-[#0f1117] border border-[#1e2130] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Coins className="w-4 h-4 text-amber-400" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                Total Cost (SEK)
              </span>
            </div>
            <p className="text-lg font-semibold text-white">
              {formatSek(summary.total_cost_usd)}
            </p>
          </div>
          <div className="bg-[#0f1117] border border-[#1e2130] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Languages className="w-4 h-4 text-indigo-400" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                Translations
              </span>
            </div>
            <p className="text-lg font-semibold text-white">
              {summary.translation_count}
            </p>
            <p className="text-[10px] text-slate-600 mt-0.5">
              {formatTokens(summary.total_input_tokens + summary.total_output_tokens)} tokens
            </p>
          </div>
          <div className="bg-[#0f1117] border border-[#1e2130] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon className="w-4 h-4 text-pink-400" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                Image Generations
              </span>
            </div>
            <p className="text-lg font-semibold text-white">
              {summary.image_count}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-slate-500">No usage data yet.</p>
          <p className="text-xs text-slate-600 mt-1">
            Translate a page or generate an image to see costs here.
          </p>
        </div>
      ) : (
        <div className="bg-[#0f1117] border border-[#1e2130] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2130] text-left">
                <th className="px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                  Date
                </th>
                <th className="px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                  Type
                </th>
                <th className="px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                  Model
                </th>
                <th className="px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                  Page
                </th>
                <th className="px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium text-right">
                  Tokens
                </th>
                <th className="px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium text-right">
                  Cost (USD)
                </th>
                <th className="px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium text-right">
                  Cost (SEK)
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-[#1e2130] last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-2.5 text-xs text-slate-400">
                    {formatDate(log.created_at)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        log.type === "translation"
                          ? "bg-indigo-500/10 text-indigo-400"
                          : "bg-pink-500/10 text-pink-400"
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
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {log.model}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-400 truncate max-w-[160px]">
                    {log.pages
                      ? log.pages.name
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 text-right tabular-nums">
                    {log.input_tokens + log.output_tokens > 0
                      ? formatTokens(log.input_tokens + log.output_tokens)
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-300 text-right tabular-nums">
                    {formatUsd(Number(log.cost_usd))}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-300 text-right tabular-nums">
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
