"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { RefreshCw } from "lucide-react";

interface EngagementData {
  doseTrend: Array<{ date: string; doses: number; users: number }>;
  streakDistribution: Array<{ streak: number; count: number }>;
  undoRate: number;
  totalDoses: number;
  totalUndos: number;
  challengeTierDistribution: Array<{ tier: string; count: number; users: number }>;
}

const TIER_LABELS: Record<string, string> = {
  glowFoundation: "Glow Foundation",
  habitBuilder: "Habit Builder",
  skinCare: "Skin Care",
  deepResults: "Deep Results",
  fullTransformation: "Full Transformation",
};

export default function EngagementSection() {
  const [data, setData] = useState<EngagementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/app-analytics?section=engagement&period=30");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) return <SectionSkeleton />;
  if (error) return <ErrorState error={error} onRetry={fetchData} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Engagement (30d)</h3>
        <button onClick={fetchData} className="p-1.5 text-gray-400 hover:text-gray-600">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <p className="text-sm font-medium text-gray-500">Total Doses</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{data.totalDoses}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <p className="text-sm font-medium text-gray-500">Undo Rate</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{data.undoRate}%</p>
          <p className="text-xs text-gray-400 mt-1">{data.totalUndos} undos</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <p className="text-sm font-medium text-gray-500">Max Streak</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {data.streakDistribution.length > 0
              ? Math.max(...data.streakDistribution.map((s) => s.streak))
              : 0}{" "}
            days
          </p>
        </div>
      </div>

      {/* Dose trend chart */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h4 className="text-sm font-medium text-gray-500 mb-4">Daily Dose Logging</h4>
        {data.doseTrend.length > 0 ? (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.doseTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5).replace("-", "/")}
                  fontSize={12}
                  tick={{ fill: "#9ca3af" }}
                />
                <YAxis fontSize={12} tick={{ fill: "#9ca3af" }} allowDecimals={false} />
                <Tooltip
                  formatter={(val, name) => [String(val), name === "doses" ? "Doses" : "Users"]}
                  contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
                <defs>
                  <linearGradient id="doseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="doses" stroke="#10b981" strokeWidth={2} fill="url(#doseGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">No dose data yet</p>
        )}
      </div>

      {/* Streak distribution */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h4 className="text-sm font-medium text-gray-500 mb-4">Streak Distribution</h4>
        {data.streakDistribution.length > 0 ? (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.streakDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="streak"
                  fontSize={12}
                  tick={{ fill: "#9ca3af" }}
                  label={{ value: "Streak (days)", position: "insideBottom", offset: -5, fontSize: 11, fill: "#9ca3af" }}
                />
                <YAxis fontSize={12} tick={{ fill: "#9ca3af" }} allowDecimals={false} />
                <Tooltip
                  formatter={(val) => [String(val), "Times"]}
                  labelFormatter={(s) => `Streak: ${s} days`}
                  contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">No streak data yet</p>
        )}
      </div>

      {/* Challenge tier breakdown */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h4 className="text-sm font-medium text-gray-500 mb-4">Active Challenge Tiers</h4>
        {data.challengeTierDistribution.length > 0 ? (
          <div className="space-y-3">
            {data.challengeTierDistribution.map((t) => (
              <div key={t.tier} className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {TIER_LABELS[t.tier] || t.tier}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">{t.users} users</span>
                  <span className="text-sm font-medium text-gray-900">{t.count} doses</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">No tier data yet</p>
        )}
      </div>
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-6 w-40 bg-gray-100 rounded animate-pulse" />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-lg p-5 space-y-2">
            <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
            <div className="h-8 w-14 bg-gray-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="h-52 bg-gray-50 rounded animate-pulse" />
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
      <p className="font-medium">Failed to load engagement data</p>
      <p className="mt-1">{error}</p>
      <button onClick={onRetry} className="mt-3 px-3 py-1.5 bg-red-100 hover:bg-red-200 rounded text-sm font-medium">
        Retry
      </button>
    </div>
  );
}
