"use client";

import { useEffect, useState } from "react";
import { TrendingUp, AlertTriangle } from "lucide-react";
import MetricCard from "./MetricCard";
import type { GrowthData } from "@/app/api/pulse/growth/route";

function formatSEK(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M kr`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}k kr`;
  return `${Math.round(amount)} kr`;
}

function formatNumber(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function GrowthEngine() {
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/pulse/growth");
        if (!res.ok) throw new Error("Failed to fetch growth data");
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-green-600" />
        <h2 className="text-lg font-semibold text-gray-900">Growth Engine</h2>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
              <div className="h-7 bg-gray-200 rounded w-32 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-40" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Data */}
      {data && !loading && (
        <>
          {/* API integration warnings */}
          {data.errors && Object.keys(data.errors).length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800">
                {data.errors.shopify && <p>Shopify: {data.errors.shopify}</p>}
                {data.errors.meta && <p>Meta: {data.errors.meta}</p>}
                {data.errors.googleAds && <p>Google Ads: {data.errors.googleAds}</p>}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Revenue (7d) */}
            <MetricCard
              label="Revenue (7d)"
              value={formatSEK(data.week.revenue)}
              subtitle={`30d: ${formatSEK(data.month.revenue)}`}
            />

            {/* Ad Spend & ROAS (7d) */}
            <MetricCard
              label="Ad Spend & ROAS (7d)"
              value={`${formatSEK(data.week.totalSpend ?? 0)} · ${data.week.roas != null ? `${data.week.roas.toFixed(2)}x` : "N/A"}`}
              subtitle={[
                data.week.metaSpend ? `Meta ${formatSEK(data.week.metaSpend)}` : null,
                data.week.googleSpend ? `Google ${formatSEK(data.week.googleSpend)}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || undefined}
            />

            {/* Orders (7d) */}
            <MetricCard
              label="Orders (7d)"
              value={formatNumber(data.week.orders)}
              subtitle={`AOV: ${formatSEK(data.week.aov)}`}
            />
          </div>

          {/* Today summary */}
          <p className="text-sm text-gray-500 mt-3">
            Idag: {formatSEK(data.today.revenue)} &middot; {data.today.orders} ordrar
          </p>
        </>
      )}
    </section>
  );
}
