// src/app/pulse/page.tsx

"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import KpiCard from "@/components/pulse/KpiCard";
import PeriodSelector, { type Period } from "@/components/pulse/PeriodSelector";
import type { PulseMetricsResponse } from "@/app/api/pulse/metrics/route";

export default function PulsePage() {
  const [period, setPeriod] = useState<Period>("7d");
  const [data, setData] = useState<PulseMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMetrics() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/pulse/metrics?period=${period}`);
        if (!res.ok) throw new Error("Failed to fetch metrics");
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchMetrics();
  }, [period]);

  function formatSEK(amount: number): string {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M kr`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}k kr`;
    return `${Math.round(amount)} kr`;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Business Pulse</h1>
            <p className="text-sm text-gray-500 mt-0.5">Realtidsöversikt över nyckeltal</p>
          </div>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* Error state */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 mb-6">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
              <div className="h-8 bg-gray-200 rounded w-32 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-20 mb-3" />
              <div className="h-12 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      {data && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Revenue */}
          <KpiCard
            label="Intäkter"
            value={formatSEK(data.metrics.revenue.current)}
            changePercent={data.metrics.revenue.changePercent}
            sparklineData={data.metrics.revenue.timeseries}
          />

          {/* Blended ROAS */}
          <KpiCard
            label="Blended ROAS"
            value={`${data.metrics.blendedRoas.current.toFixed(2)}x`}
            changePercent={data.metrics.blendedRoas.changePercent}
            sparklineData={data.metrics.blendedRoas.timeseries}
          />

          {/* Klaviyo Revenue */}
          <KpiCard
            label="Klaviyo-intäkter"
            value={formatSEK(data.metrics.klaviyoRevenue.current)}
            changePercent={data.metrics.klaviyoRevenue.changePercent}
            sparklineData={data.metrics.klaviyoRevenue.timeseries}
          />

          {/* Hydro13 Stock */}
          <KpiCard
            label="Hydro13 Lager"
            value={`${data.metrics.hydro13Stock.current}d kvar`}
            subtitle={`${data.metrics.hydro13Stock.units} enheter · ${data.metrics.hydro13Stock.sellRate.toFixed(1)}/dag`}
            status={data.metrics.hydro13Stock.status}
            sparklineData={data.metrics.hydro13Stock.timeseries}
          />

          {/* Orders */}
          <KpiCard
            label="Ordrar"
            value={data.metrics.orders.current}
            changePercent={data.metrics.orders.changePercent}
            sparklineData={data.metrics.orders.timeseries}
          />

          {/* AOV */}
          <KpiCard
            label="AOV"
            value={formatSEK(data.metrics.aov.current)}
            changePercent={data.metrics.aov.changePercent}
            sparklineData={data.metrics.aov.timeseries}
          />

          {/* Meta Ads */}
          <KpiCard
            label="Meta Ads"
            value={formatSEK(data.metrics.metaAds.spend.current)}
            subtitle={`ROAS: ${data.metrics.metaAds.roas.current.toFixed(2)}x`}
            changePercent={data.metrics.metaAds.spend.changePercent}
            sparklineData={data.metrics.metaAds.spend.timeseries}
          />

          {/* Google Ads */}
          <KpiCard
            label="Google Ads"
            value={formatSEK(data.metrics.googleAds.spend.current)}
            subtitle={`ROAS: ${data.metrics.googleAds.roas.current.toFixed(2)}x`}
            changePercent={data.metrics.googleAds.spend.changePercent}
            sparklineData={data.metrics.googleAds.spend.timeseries}
          />
        </div>
      )}
    </div>
  );
}
