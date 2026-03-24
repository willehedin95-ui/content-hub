"use client";

import { useState } from "react";
import {
  Search,
  TrendingUp,
  Loader2,
  Globe,
  Lightbulb,
  BarChart3,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";

interface KeywordData {
  keyword: string;
  searchVolume: number | null;
  competition: string | null;
  competitionIndex: number | null;
  cpc: number | null;
  lowBid: number | null;
  highBid: number | null;
  monthlySearches: { year: number; month: number; searchVolume: number }[];
}

type Mode = "volume" | "suggestions" | "competitor";
type Market = "SE" | "NO" | "DK";

const MARKET_OPTIONS: { value: Market; label: string; flag: string }[] = [
  { value: "SE", label: "Sweden", flag: "🇸🇪" },
  { value: "NO", label: "Norway", flag: "🇳🇴" },
  { value: "DK", label: "Denmark", flag: "🇩🇰" },
];

function CompetitionBadge({ level }: { level: string | null }) {
  if (!level) return <span className="text-gray-300">—</span>;
  const colors: Record<string, string> = {
    LOW: "bg-green-100 text-green-700",
    MEDIUM: "bg-amber-100 text-amber-700",
    HIGH: "bg-red-100 text-red-700",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[level] || "bg-gray-100 text-gray-600"}`}>
      {level}
    </span>
  );
}

function MiniSparkline({ data }: { data: { searchVolume: number }[] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.searchVolume), 1);
  const width = 60;
  const height = 20;
  const points = data
    .slice(-12)
    .map((d, i, arr) => {
      const x = (i / (arr.length - 1)) * width;
      const y = height - (d.searchVolume / max) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-indigo-400"
      />
    </svg>
  );
}

export default function KeywordResearch() {
  const [mode, setMode] = useState<Mode>("volume");
  const [market, setMarket] = useState<Market>("SE");
  const [input, setInput] = useState("");
  const [results, setResults] = useState<KeywordData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [sortBy, setSortBy] = useState<"volume" | "competition" | "cpc">("volume");

  const search = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const body: Record<string, unknown> = { mode, market };

      if (mode === "competitor") {
        body.target = input.trim();
      } else {
        body.keywords = input
          .split("\n")
          .map((k) => k.trim())
          .filter(Boolean);
      }

      const res = await fetch("/api/seo/keyword-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Request failed");
        return;
      }

      setResults(data.keywords || data.suggestions || []);
      setCost(data.cost ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const sorted = [...results].sort((a, b) => {
    if (sortBy === "volume") return (b.searchVolume ?? 0) - (a.searchVolume ?? 0);
    if (sortBy === "competition") return (a.competitionIndex ?? 0) - (b.competitionIndex ?? 0);
    if (sortBy === "cpc") return (b.cpc ?? 0) - (a.cpc ?? 0);
    return 0;
  });

  return (
    <div className="mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 mb-2"
      >
        <Search className="w-4 h-4" />
        Keyword Research
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div className="border rounded-lg p-4 bg-gray-50">
          {/* Mode tabs + market selector */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-1">
              {([
                { value: "volume" as Mode, label: "Search Volume", icon: BarChart3 },
                { value: "suggestions" as Mode, label: "Keyword Ideas", icon: Lightbulb },
                { value: "competitor" as Mode, label: "Competitor Keywords", icon: Globe },
              ]).map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => { setMode(tab.value); setResults([]); }}
                  className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-md transition-colors ${
                    mode === tab.value
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-100 border"
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              {MARKET_OPTIONS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMarket(m.value)}
                  className={`px-2 py-1 text-xs rounded ${
                    market === m.value
                      ? "bg-indigo-100 text-indigo-700 font-medium"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                  title={m.label}
                >
                  {m.flag}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="flex gap-2 mb-3">
            {mode === "competitor" ? (
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Enter competitor domain (e.g. kuddguiden.se)"
                className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                onKeyDown={(e) => e.key === "Enter" && search()}
              />
            ) : (
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  mode === "volume"
                    ? "Enter keywords (one per line):\nbästa kudden 2026\nkudde bäst i test\nergonomisk kudde"
                    : "Enter seed keywords (one per line):\nkudde\nsömn\nnacksmärta"
                }
                rows={3}
                className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white resize-none"
              />
            )}
            <button
              onClick={search}
              disabled={loading || !input.trim()}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 self-end"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-xs mb-3 bg-red-50 p-2 rounded">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">
                  {results.length} keywords found
                  {cost !== null && <span className="ml-2 text-gray-400">(cost: ${cost.toFixed(3)})</span>}
                </span>
                <div className="flex gap-1">
                  {([
                    { value: "volume" as const, label: "Volume" },
                    { value: "competition" as const, label: "Easiest" },
                    { value: "cpc" as const, label: "CPC" },
                  ]).map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setSortBy(s.value)}
                      className={`px-2 py-0.5 text-[10px] rounded ${
                        sortBy === s.value ? "bg-gray-200 text-gray-800" : "text-gray-500 hover:bg-gray-100"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden bg-white max-h-[400px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Keyword</th>
                      <th className="text-right px-3 py-2 font-medium">Volume/mo</th>
                      <th className="text-center px-3 py-2 font-medium">Competition</th>
                      <th className="text-right px-3 py-2 font-medium">CPC (USD)</th>
                      <th className="text-right px-3 py-2 font-medium">Trend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sorted.map((kw) => (
                      <tr key={kw.keyword} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-900">{kw.keyword}</td>
                        <td className="text-right px-3 py-2 tabular-nums">
                          {kw.searchVolume?.toLocaleString() ?? "—"}
                        </td>
                        <td className="text-center px-3 py-2">
                          <CompetitionBadge level={kw.competition} />
                        </td>
                        <td className="text-right px-3 py-2 tabular-nums text-gray-600">
                          {kw.cpc !== null ? `$${kw.cpc.toFixed(2)}` : "—"}
                        </td>
                        <td className="text-right px-3 py-2">
                          <MiniSparkline data={kw.monthlySearches} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Help text */}
          {results.length === 0 && !loading && !error && (
            <p className="text-xs text-gray-400">
              {mode === "volume" && "Enter keywords to check their monthly search volume and competition."}
              {mode === "suggestions" && "Enter seed keywords to discover related keyword opportunities."}
              {mode === "competitor" && "Enter a competitor domain to see what keywords they target."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
