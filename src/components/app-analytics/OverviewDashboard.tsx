"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { RefreshCw } from "lucide-react";
import KpiCard from "@/components/pulse/KpiCard";

interface OverviewData {
  totalUsers: number;
  avgDau: number;
  doses: number;
  onboardingRate: number;
  onboardingRateChange: number | null;
  installs: number;
  installsChange: number | null;
  dosesChange: number | null;
  dailyActivity: Array<{ date: string; value: number }>;
  dailyEvents: Array<{ date: string; value: number }>;
}

export default function OverviewDashboard() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState(30);

  const fetchData = async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/app-analytics?section=overview&period=${p}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(period);
  }, [period]);

  if (loading) return <OverviewSkeleton />;

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
        <p className="font-medium">Failed to load analytics</p>
        <p className="mt-1">{error}</p>
        <button
          onClick={() => fetchData(period)}
          className="mt-3 px-3 py-1.5 bg-red-100 hover:bg-red-200 rounded text-sm font-medium transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-2">
        {[7, 30, 90].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              period === p
                ? "bg-indigo-100 text-indigo-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {p}d
          </button>
        ))}
        <button
          onClick={() => fetchData(period)}
          className="ml-auto p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={`New Installs (${period}d)`}
          value={data.installs}
          changePercent={data.installsChange}
          subtitle="From app store"
        />
        <KpiCard
          label="Total Users"
          value={data.totalUsers}
          subtitle="All time unique"
        />
        <KpiCard
          label="Avg Daily Users"
          value={data.avgDau}
          subtitle={`${period}d average`}
          sparklineData={data.dailyActivity}
        />
        <KpiCard
          label={`Doses Logged (${period}d)`}
          value={data.doses}
          changePercent={data.dosesChange}
          sparklineData={data.dailyEvents}
        />
      </div>

      {/* Onboarding completion rate */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-medium text-gray-500">Onboarding Completion Rate</p>
          {data.onboardingRateChange !== null && (
            <span
              className={`text-xs font-medium ${
                data.onboardingRateChange > 0 ? "text-green-600" : data.onboardingRateChange < 0 ? "text-red-600" : "text-gray-500"
              }`}
            >
              {data.onboardingRateChange > 0 ? "+" : ""}
              {data.onboardingRateChange}pp
            </span>
          )}
        </div>
        <p className="text-3xl font-bold text-gray-900">{data.onboardingRate}%</p>
        <div className="mt-3 w-full bg-gray-100 rounded-full h-2.5">
          <div
            className="bg-indigo-600 h-2.5 rounded-full transition-all"
            style={{ width: `${Math.min(data.onboardingRate, 100)}%` }}
          />
        </div>
      </div>

      {/* Activity Chart */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-medium text-gray-500 mb-4">
          Daily Active Users ({period}d)
        </h3>
        {data.dailyActivity.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.dailyActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => {
                    const [, m, day] = d.split("-");
                    return `${day}/${m}`;
                  }}
                  fontSize={12}
                  tick={{ fill: "#9ca3af" }}
                />
                <YAxis
                  fontSize={12}
                  tick={{ fill: "#9ca3af" }}
                  allowDecimals={false}
                />
                <Tooltip
                  labelFormatter={(d) => {
                    const date = new Date(String(d) + "T00:00:00");
                    return date.toLocaleDateString("sv-SE", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    });
                  }}
                  formatter={(val) => [String(val), "Users"]}
                  contentStyle={{
                    fontSize: 13,
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                  }}
                />
                <defs>
                  <linearGradient id="userGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#userGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-12">No activity data yet</p>
        )}
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 w-12 bg-gray-100 rounded-md animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
            <div className="h-8 w-16 bg-gray-100 rounded animate-pulse" />
            <div className="h-12 w-full bg-gray-50 rounded animate-pulse" />
          </div>
        ))}
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="h-4 w-32 bg-gray-100 rounded animate-pulse mb-4" />
        <div className="h-64 bg-gray-50 rounded animate-pulse" />
      </div>
    </div>
  );
}
