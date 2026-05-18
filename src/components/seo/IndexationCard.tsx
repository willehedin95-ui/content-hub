"use client";

import { useEffect, useState } from "react";
import { Globe, TrendingUp, TrendingDown, AlertCircle, AlertTriangle, Loader2 } from "lucide-react";

interface IndexStatRow {
  property: string;
  sitemapPath: string;
  submitted: number;
  indexed: number;
  indexationRate: number;
  errors: number;
  warnings: number;
  lastSubmitted: string | null;
  checkedAt: string;
  weekAgoIndexed: number | null;
  weekOverWeekChange: number | null;
}

function formatHost(property: string): string {
  return property.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function trendIcon(wow: number | null) {
  if (wow === null) return null;
  if (wow > 0) return <TrendingUp className="w-3.5 h-3.5 text-green-600" />;
  if (wow < 0) return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
  return null;
}

export default function IndexationCard() {
  const [rows, setRows] = useState<IndexStatRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/seo/index-stats")
      .then((r) => r.json())
      .then((d) => setRows(d.rows ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="border rounded-lg p-4">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading indexation stats...</span>
        </div>
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="border rounded-lg p-4 text-sm text-gray-500">
        <div className="flex items-center gap-2 mb-2 text-gray-700 font-medium">
          <Globe className="w-4 h-4" />
          Indexation status
        </div>
        Inga indexation-stats än. Cronen kör måndagar 06:45 UTC och fyller på data efter första körningen.
      </div>
    );
  }

  const totalSubmitted = rows.reduce((s, r) => s + r.submitted, 0);
  const totalIndexed = rows.reduce((s, r) => s + r.indexed, 0);
  const totalErrors = rows.reduce((s, r) => s + r.errors, 0);
  const overallRate = totalSubmitted > 0 ? Math.round((totalIndexed / totalSubmitted) * 100) : 0;

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-gray-700 font-medium">
          <Globe className="w-4 h-4" />
          Indexation status
        </div>
        <div className="text-xs text-gray-500">
          {totalIndexed.toLocaleString()} / {totalSubmitted.toLocaleString()} indexed ({overallRate}%)
          {totalErrors > 0 && <span className="ml-2 text-red-600">· {totalErrors} errors</span>}
        </div>
      </div>

      <table className="w-full text-xs">
        <thead className="text-gray-500">
          <tr>
            <th className="text-left py-1.5 font-normal">Property</th>
            <th className="text-right py-1.5 font-normal">Submitted</th>
            <th className="text-right py-1.5 font-normal">Indexed</th>
            <th className="text-right py-1.5 font-normal">Rate</th>
            <th className="text-right py-1.5 font-normal">WoW</th>
            <th className="text-right py-1.5 font-normal">Issues</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={`${r.property}-${r.sitemapPath}`}>
              <td className="py-2 text-gray-700">
                <div className="truncate max-w-[200px]" title={r.property}>{formatHost(r.property)}</div>
                <div className="text-[10px] text-gray-400 truncate max-w-[200px]" title={r.sitemapPath}>{r.sitemapPath.replace(/^https?:\/\/[^/]+\//, "/")}</div>
              </td>
              <td className="text-right tabular-nums text-gray-600">{r.submitted.toLocaleString()}</td>
              <td className="text-right tabular-nums text-gray-900">{r.indexed.toLocaleString()}</td>
              <td className="text-right tabular-nums">
                <span className={`px-1.5 py-0.5 rounded ${
                  r.indexationRate >= 80 ? "bg-green-50 text-green-700" :
                  r.indexationRate >= 50 ? "bg-amber-50 text-amber-700" :
                  "bg-red-50 text-red-700"
                }`}>
                  {r.indexationRate}%
                </span>
              </td>
              <td className="text-right tabular-nums">
                {r.weekOverWeekChange !== null ? (
                  <span className={`inline-flex items-center gap-0.5 ${
                    r.weekOverWeekChange > 0 ? "text-green-600" :
                    r.weekOverWeekChange < 0 ? "text-red-500" : "text-gray-400"
                  }`}>
                    {trendIcon(r.weekOverWeekChange)}
                    {r.weekOverWeekChange > 0 ? "+" : ""}{r.weekOverWeekChange}%
                  </span>
                ) : (
                  <span className="text-gray-300">-</span>
                )}
              </td>
              <td className="text-right tabular-nums">
                {r.errors > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-red-600 mr-1.5" title={`${r.errors} errors`}>
                    <AlertCircle className="w-3 h-3" />{r.errors}
                  </span>
                )}
                {r.warnings > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-amber-600" title={`${r.warnings} warnings`}>
                    <AlertTriangle className="w-3 h-3" />{r.warnings}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
