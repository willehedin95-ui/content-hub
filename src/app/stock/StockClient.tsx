"use client";

import { useEffect, useState, useCallback } from "react";
import { Warehouse, RefreshCw, Package, TrendingUp, ShieldAlert } from "lucide-react";
import type { StockResponse } from "@/app/api/stock/route";

const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

const STATUS_COLORS = {
  healthy: {
    badge: "bg-emerald-100 text-emerald-700",
    text: "text-emerald-700",
    bar: "bg-emerald-500",
    banner: "bg-emerald-50 border-emerald-200 text-emerald-800",
  },
  warning: {
    badge: "bg-amber-100 text-amber-700",
    text: "text-amber-700",
    bar: "bg-amber-500",
    banner: "bg-amber-50 border-amber-200 text-amber-800",
  },
  critical: {
    badge: "bg-red-100 text-red-700",
    text: "text-red-700",
    bar: "bg-red-500",
    banner: "bg-red-50 border-red-200 text-red-800",
  },
  unknown: {
    badge: "bg-gray-100 text-gray-700",
    text: "text-gray-500",
    bar: "bg-gray-400",
    banner: "bg-gray-50 border-gray-200 text-gray-700",
  },
};

const STATUS_LABELS: Record<StockResponse["status"], string> = {
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
  unknown: "Unknown",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function LoadingSkeleton() {
  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-gray-200 rounded" />
          <div>
            <div className="h-6 bg-gray-200 rounded w-32 mb-1.5" />
            <div className="h-4 bg-gray-200 rounded w-48" />
          </div>
        </div>
        <div className="h-8 bg-gray-200 rounded w-44" />
      </div>

      {/* Cards skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="h-4 bg-gray-200 rounded w-28 mb-4" />
          <div className="h-10 bg-gray-200 rounded w-40 mb-3" />
          <div className="h-4 bg-gray-200 rounded w-48 mb-4" />
          <div className="h-3 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-64" />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="h-4 bg-gray-200 rounded w-28 mb-4" />
          <div className="flex gap-3 mb-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex-1 h-20 bg-gray-200 rounded-lg" />
            ))}
          </div>
          <div className="h-4 bg-gray-200 rounded w-36 mb-4" />
          <div className="h-20 bg-gray-200 rounded" />
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="h-4 bg-gray-200 rounded w-36 mb-4" />
        <div className="h-12 bg-gray-200 rounded mb-4" />
        <div className="flex gap-8">
          <div className="h-16 bg-gray-200 rounded flex-1" />
          <div className="h-16 bg-gray-200 rounded flex-1" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stock Overview Card
// ---------------------------------------------------------------------------
function StockOverviewCard({ data }: { data: StockResponse }) {
  const colors = STATUS_COLORS[data.status];
  const daysRemainingRounded =
    data.daysRemaining !== null ? Math.round(data.daysRemaining) : null;

  // Progress bar: width as % of a reasonable range
  const maxDays = data.leadTimeDays + data.reorderThresholdDays + 30;
  const barWidth =
    data.daysRemaining !== null
      ? Math.min(100, (data.daysRemaining / maxDays) * 100)
      : 0;

  // Lead time marker position
  const leadTimeMarkerPct = Math.min(
    100,
    (data.leadTimeDays / maxDays) * 100
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Package className="w-4 h-4 text-gray-400" />
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
          Stock Overview
        </h2>
      </div>

      {/* Big number + status badge */}
      <div className="flex items-baseline gap-3 mb-1">
        <span className="text-4xl font-bold tabular-nums text-gray-900">
          {data.stock.disposable.toLocaleString()}
        </span>
        <span className="text-lg text-gray-500">units</span>
        <span
          className={`ml-2 px-2.5 py-0.5 rounded-full text-xs font-medium ${colors.badge}`}
        >
          {STATUS_LABELS[data.status]}
        </span>
      </div>

      {/* Days remaining */}
      {daysRemainingRounded !== null && (
        <p className={`text-sm font-medium mb-4 ${colors.text}`}>
          ~{daysRemainingRounded} days of stock remaining
        </p>
      )}

      {/* Secondary breakdown */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mb-5">
        <span>
          Physical: <strong className="text-gray-700">{data.stock.physical}</strong>
        </span>
        <span>
          On deliveries: <strong className="text-gray-700">{data.stock.onDeliveries}</strong>
        </span>
        <span>
          Incoming: <strong className="text-gray-700">{data.stock.incomingDeliveries}</strong>
        </span>
        <span>
          Returns: <strong className="text-gray-700">{data.stock.returns}</strong>
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative">
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        {/* Lead time marker */}
        <div
          className="absolute top-0 h-3 w-0.5 bg-gray-800"
          style={{ left: `${leadTimeMarkerPct}%` }}
          title={`Lead time: ${data.leadTimeDays} days`}
        />
        <div className="flex justify-between mt-1.5 text-xs text-gray-400">
          <span>0 days</span>
          <span
            className="absolute text-xs text-gray-500 -translate-x-1/2"
            style={{ left: `${leadTimeMarkerPct}%` }}
          >
            Lead ({data.leadTimeDays}d)
          </span>
          <span>{maxDays}d</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sales Velocity Card
// ---------------------------------------------------------------------------
function SalesVelocityCard({ data }: { data: StockResponse }) {
  const rates = [
    { label: "7 day", value: data.sellRates.daily7d, primary: false },
    { label: "30 day", value: data.sellRates.daily30d, primary: true },
    { label: "90 day", value: data.sellRates.daily90d, primary: false },
  ];

  const monthlyBurn = Math.round(data.sellRates.daily30d * 30);

  // Mini bar chart data (last 30 days)
  const timeseries = data.sellRates.dailyTimeseries;
  const maxUnits = Math.max(...timeseries.map((d) => d.units), 1);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-gray-400" />
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
          Sales Velocity
        </h2>
      </div>

      {/* Rate boxes */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {rates.map((r) => (
          <div
            key={r.label}
            className={`rounded-lg px-3 py-2.5 text-center ${
              r.primary
                ? "bg-indigo-50 border-2 border-indigo-200"
                : "bg-gray-50 border border-gray-200"
            }`}
          >
            <p
              className={`text-lg font-bold tabular-nums ${
                r.primary ? "text-indigo-700" : "text-gray-900"
              }`}
            >
              {r.value.toFixed(1)}
              <span className="text-xs font-normal text-gray-500">/day</span>
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{r.label}</p>
          </div>
        ))}
      </div>

      {/* Monthly burn */}
      <p className="text-sm text-gray-600 mb-4">
        Projected monthly burn:{" "}
        <strong className="text-gray-900">~{monthlyBurn} units/month</strong>
      </p>

      {/* Mini bar chart */}
      <div className="relative">
        <div className="flex items-end gap-px h-20">
          {timeseries.map((day) => {
            const heightPct = (day.units / maxUnits) * 100;
            return (
              <div
                key={day.date}
                className="flex-1 bg-indigo-400 rounded-t transition-all duration-300 hover:bg-indigo-500"
                style={{ height: `${Math.max(heightPct, 2)}%`, minHeight: "2px" }}
                title={`${formatShortDate(day.date)}: ${day.units} units`}
              />
            );
          })}
        </div>
        {/* X-axis labels */}
        {timeseries.length > 0 && (
          <div className="flex justify-between mt-1.5 text-xs text-gray-400">
            <span>{formatShortDate(timeseries[0].date)}</span>
            <span>{formatShortDate(timeseries[timeseries.length - 1].date)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reorder Intelligence Card
// ---------------------------------------------------------------------------
function ReorderIntelligenceCard({ data }: { data: StockResponse }) {
  const colors = STATUS_COLORS[data.status];
  const daysRemainingRounded =
    data.daysRemaining !== null ? Math.round(data.daysRemaining) : null;

  // Status-based headline
  let headline = "";
  if (data.status === "healthy") {
    headline = `No action needed \u2014 stock covers ${daysRemainingRounded} days`;
  } else if (data.status === "warning") {
    const daysUntilReorder =
      data.reorderByDate !== null
        ? Math.max(
            0,
            Math.ceil(
              (new Date(data.reorderByDate).getTime() - Date.now()) /
                (24 * 60 * 60 * 1000)
            )
          )
        : null;
    headline =
      daysUntilReorder !== null
        ? `Order within ${daysUntilReorder} days to avoid stockout`
        : "Order soon to avoid stockout";
  } else if (data.status === "critical") {
    headline = `Order NOW \u2014 stockout projected in ${daysRemainingRounded ?? "?"} days`;
  } else {
    headline = "Insufficient data to determine reorder status";
  }

  // Date color logic
  let dateColor = "text-gray-900";
  if (data.reorderByDate) {
    const reorderDate = new Date(data.reorderByDate);
    const now = new Date();
    const diffDays = Math.ceil(
      (reorderDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );
    if (diffDays < 0) dateColor = "text-red-600 font-bold";
    else if (diffDays <= 7) dateColor = "text-amber-600 font-semibold";
  }

  const dailyRate = data.sellRates.daily30d;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <ShieldAlert className="w-4 h-4 text-gray-400" />
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
          Reorder Intelligence
        </h2>
      </div>

      {/* Status banner */}
      <div className={`rounded-lg border px-4 py-3 mb-5 ${colors.banner}`}>
        <p className="text-sm font-medium">{headline}</p>
      </div>

      {/* Two info columns */}
      <div className="grid grid-cols-2 gap-6 mb-4">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            Order by
          </p>
          <p className={`text-xl font-bold tabular-nums ${dateColor}`}>
            {data.reorderByDate ? formatDate(data.reorderByDate) : "\u2014"}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            Suggested quantity
          </p>
          <p className="text-xl font-bold tabular-nums text-gray-900">
            {data.suggestedOrderQty !== null
              ? `${data.suggestedOrderQty} units`
              : "\u2014"}
          </p>
        </div>
      </div>

      {/* Calculation breakdown */}
      {dailyRate > 0 && (
        <p className="text-xs text-gray-400">
          Based on {dailyRate.toFixed(1)}/day &times; ({data.leadTimeDays} +{" "}
          30 days) &minus; {data.stock.disposable} current stock
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main StockClient
// ---------------------------------------------------------------------------
export default function StockClient() {
  const [data, setData] = useState<StockResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/stock");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json: StockResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch stock data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => fetchData(true), AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Loading state
  if (loading && !data) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Warehouse className="w-6 h-6 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
            <p className="text-sm text-gray-500 mt-0.5">COLLAGEN-MARINE-12500</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {data?.updatedAt && (
            <span className="text-xs text-gray-400">
              Updated {formatTime(data.updatedAt)}
            </span>
          )}
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-red-700 mb-2">{error}</p>
          <button
            onClick={() => fetchData()}
            className="text-sm text-red-700 font-medium underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Cards */}
      {data && (
        <div className="space-y-6">
          {/* Top row: Stock Overview + Sales Velocity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StockOverviewCard data={data} />
            <SalesVelocityCard data={data} />
          </div>

          {/* Bottom row: Reorder Intelligence */}
          <ReorderIntelligenceCard data={data} />
        </div>
      )}
    </div>
  );
}
