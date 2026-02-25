"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Crosshair,
  Eye,
  MousePointerClick,
  ShoppingCart,
  DollarSign,
  Fingerprint,
  Loader2,
  AlertCircle,
} from "lucide-react";

const PERIOD_OPTIONS = [
  { value: 7, label: "7d" },
  { value: 14, label: "14d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
];

interface PixelStats {
  period: { days: number; since: string };
  pixel: { views: number; clicks: number; withFbp: number };
  attributions: {
    total: number;
    byMatchType: Record<string, number>;
    totalRevenue: number;
    currency: string;
  };
  enrichment: { capiSent: number; enrichedWithPixel: number; rate: number };
}

export default function AttributionClient() {
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState<PixelStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/pixel/stats?days=${days}`);
      if (!res.ok) throw new Error("Failed to load attribution data");
      const data = await res.json();
      setStats(data);
    } catch {
      setError("Failed to load attribution data.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fbpRate =
    stats && stats.pixel.views > 0
      ? ((stats.pixel.withFbp / stats.pixel.views) * 100).toFixed(1)
      : "0";

  const ctr =
    stats && stats.pixel.views > 0
      ? ((stats.pixel.clicks / stats.pixel.views) * 100).toFixed(1)
      : "0";

  return (
    <div className="max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Crosshair className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-900">Attribution</h1>
        </div>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                days === opt.value
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : stats ? (
        <>
          {/* Pixel Events */}
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              First-Party Pixel
            </h2>
            <div className="grid grid-cols-4 gap-4">
              <Card
                icon={<Eye className="w-4 h-4 text-blue-500" />}
                label="Page Views"
                value={stats.pixel.views.toLocaleString()}
                sub={`${ctr}% CTR`}
              />
              <Card
                icon={<MousePointerClick className="w-4 h-4 text-indigo-500" />}
                label="CTA Clicks"
                value={stats.pixel.clicks.toLocaleString()}
              />
              <Card
                icon={<Fingerprint className="w-4 h-4 text-purple-500" />}
                label="fbp Captured"
                value={stats.pixel.withFbp.toLocaleString()}
                sub={`${fbpRate}% of views`}
              />
              <Card
                icon={<Fingerprint className="w-4 h-4 text-emerald-500" />}
                label="CAPI Enrichment"
                value={`${stats.enrichment.rate}%`}
                sub={`${stats.enrichment.enrichedWithPixel} / ${stats.enrichment.capiSent} events`}
              />
            </div>
          </div>

          {/* Attribution */}
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Hub-Attributed Conversions
            </h2>
            <div className="grid grid-cols-4 gap-4">
              <Card
                icon={<ShoppingCart className="w-4 h-4 text-emerald-600" />}
                label="Attributed Orders"
                value={stats.attributions.total.toLocaleString()}
              />
              <Card
                icon={<DollarSign className="w-4 h-4 text-emerald-600" />}
                label="Attributed Revenue"
                value={formatCurrency(
                  stats.attributions.totalRevenue,
                  stats.attributions.currency
                )}
              />
              <Card
                icon={<Crosshair className="w-4 h-4 text-blue-500" />}
                label="fbclid Match"
                value={String(stats.attributions.byMatchType.fbclid || 0)}
                sub="High confidence"
              />
              <Card
                icon={<Crosshair className="w-4 h-4 text-amber-500" />}
                label="IP+UA Match"
                value={String(stats.attributions.byMatchType.ip_ua || 0)}
                sub="Medium confidence"
              />
            </div>
          </div>

          {/* Empty state */}
          {stats.pixel.views === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">
              No pixel events yet. Publish a page to start collecting data.
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function Card({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="text-xl font-bold text-gray-900 tabular-nums">
        {value}
      </div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function formatCurrency(amount: number, currency = "SEK"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
