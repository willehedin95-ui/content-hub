"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, Zap, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface GapKeyword {
  query: string;
  page: string | null;
  country: string;
  market: string;
  property: string;
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number;
  avgPosition: number;
  positionTrend: number;
  opportunityScore: number;
}

const MARKETS = [
  { value: "", label: "All Markets" },
  { value: "swe", label: "\u{1F1F8}\u{1F1EA} Sweden" },
  { value: "dnk", label: "\u{1F1E9}\u{1F1F0} Denmark" },
  { value: "nor", label: "\u{1F1F3}\u{1F1F4} Norway" },
];

function PositionBadge({ position }: { position: number }) {
  const color =
    position <= 10 ? "bg-green-50 text-green-700 border-green-200" :
    position <= 15 ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
    "bg-orange-50 text-orange-700 border-orange-200";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", color)}>
      #{position}
    </span>
  );
}

function TrendIndicator({ value }: { value: number }) {
  if (value === 0) return <Minus className="w-4 h-4 text-gray-300" />;
  if (value > 0) return (
    <span className="flex items-center gap-0.5 text-green-600 text-xs font-medium">
      <TrendingUp className="w-3.5 h-3.5" /> +{value}
    </span>
  );
  return (
    <span className="flex items-center gap-0.5 text-red-500 text-xs font-medium">
      <TrendingDown className="w-3.5 h-3.5" /> {value}
    </span>
  );
}

export default function GapKeywords() {
  const [data, setData] = useState<GapKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (country) params.set("country", country);
    params.set("limit", "100");

    fetch(`/api/seo/gap-keywords?${params}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [country]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <Zap className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Gap Keywords Found</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Gap keywords are search terms where you rank between positions 5-20. These are your best opportunities to reach page 1.
          Sync your GSC data first if you haven&apos;t already.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3">
        <p className="text-sm text-indigo-700">
          <strong>Gap keywords</strong> are search terms where you rank between positions 5-20.
          These are your easiest wins — a well-optimized blog post can push you to page 1 and unlock free traffic.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        {MARKETS.map((m) => (
          <button
            key={m.value}
            onClick={() => setCountry(m.value)}
            className={cn(
              "px-3 py-1.5 text-sm rounded-lg border transition-colors",
              country === m.value
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left py-3 px-4 font-medium text-gray-600">Keyword</th>
              <th className="text-center py-3 px-3 font-medium text-gray-600 w-20">Position</th>
              <th className="text-center py-3 px-3 font-medium text-gray-600 w-16">Trend</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600 w-24">Impressions</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600 w-20">Clicks</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600 w-16">CTR</th>
              <th className="text-center py-3 px-3 font-medium text-gray-600 w-16">Market</th>
              <th className="text-right py-3 px-3 font-medium text-gray-600 w-24">Opportunity</th>
            </tr>
          </thead>
          <tbody>
            {data.map((kw, i) => (
              <tr key={`${kw.query}-${kw.country}-${kw.property}`} className={cn("border-b border-gray-100 hover:bg-gray-50", i === 0 && "bg-yellow-50/30")}>
                <td className="py-3 px-4">
                  <div className="font-medium text-gray-900">{kw.query}</div>
                  {kw.page && (
                    <a href={kw.page} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-indigo-500 flex items-center gap-1 mt-0.5">
                      {new URL(kw.page).pathname}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </td>
                <td className="text-center py-3 px-3">
                  <PositionBadge position={kw.avgPosition} />
                </td>
                <td className="text-center py-3 px-3">
                  <TrendIndicator value={kw.positionTrend} />
                </td>
                <td className="text-right py-3 px-3 text-gray-700 tabular-nums">{kw.totalImpressions.toLocaleString()}</td>
                <td className="text-right py-3 px-3 text-gray-700 tabular-nums">{kw.totalClicks.toLocaleString()}</td>
                <td className="text-right py-3 px-3 text-gray-500 tabular-nums">{(kw.avgCtr * 100).toFixed(1)}%</td>
                <td className="text-center py-3 px-3">
                  <span className="text-xs text-gray-500">{kw.market}</span>
                </td>
                <td className="text-right py-3 px-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                    {kw.opportunityScore.toLocaleString()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
