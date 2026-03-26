"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { RefreshCw } from "lucide-react";

interface OnboardingData {
  funnel: { started: number; completed: number; rate: number };
  purchaseTypes: Array<{ type: string; count: number }>;
  bottleCounts: Array<{ bottles: number; count: number }>;
}

const PURCHASE_LABELS: Record<string, string> = {
  single: "Single Purchase",
  subscription: "Subscription",
  gift: "Gift",
};

export default function OnboardingSection() {
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/app-analytics?section=onboarding");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-40 bg-gray-100 rounded animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-lg p-5 h-40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
        <p className="font-medium">Failed to load onboarding data</p>
        <p className="mt-1">{error}</p>
        <button onClick={fetchData} className="mt-3 px-3 py-1.5 bg-red-100 hover:bg-red-200 rounded text-sm font-medium">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Onboarding</h3>
        <button onClick={fetchData} className="p-1.5 text-gray-400 hover:text-gray-600">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Funnel */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h4 className="text-sm font-medium text-gray-500 mb-4">Onboarding Funnel (All Time)</h4>
        <div className="space-y-4">
          <FunnelBar label="Started" count={data.funnel.started} maxCount={data.funnel.started} color="bg-indigo-500" />
          <FunnelBar label="Completed" count={data.funnel.completed} maxCount={data.funnel.started} color="bg-green-500" />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="text-sm text-gray-500">Completion rate:</span>
          <span className="text-sm font-bold text-gray-900">{data.funnel.rate}%</span>
        </div>
        {data.funnel.started > data.funnel.completed && (
          <p className="text-xs text-gray-400 mt-1">
            {data.funnel.started - data.funnel.completed} user{data.funnel.started - data.funnel.completed !== 1 ? "s" : ""} dropped off during onboarding
          </p>
        )}
      </div>

      {/* Purchase type breakdown */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h4 className="text-sm font-medium text-gray-500 mb-4">Purchase Type</h4>
        {data.purchaseTypes.length > 0 ? (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.purchaseTypes} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" fontSize={12} tick={{ fill: "#9ca3af" }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="type"
                  fontSize={12}
                  tick={{ fill: "#9ca3af" }}
                  tickFormatter={(t: string) => PURCHASE_LABELS[t] || t}
                  width={120}
                />
                <Tooltip
                  formatter={(val) => [String(val), "Users"]}
                  labelFormatter={(t) => PURCHASE_LABELS[String(t)] || String(t)}
                  contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
                <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">No purchase data yet</p>
        )}
      </div>

      {/* Bottle count distribution */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h4 className="text-sm font-medium text-gray-500 mb-4">Bottle Count</h4>
        {data.bottleCounts.length > 0 ? (
          <div className="space-y-3">
            {data.bottleCounts.map((b) => (
              <div key={b.bottles} className="flex items-center gap-3">
                <span className="text-sm text-gray-600 w-20">
                  {b.bottles} bottle{b.bottles !== 1 ? "s" : ""}
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-4">
                  <div
                    className="bg-indigo-500 h-4 rounded-full transition-all flex items-center justify-end pr-2"
                    style={{
                      width: `${Math.max((b.count / Math.max(...data.bottleCounts.map((bc) => bc.count))) * 100, 10)}%`,
                    }}
                  >
                    <span className="text-[10px] font-medium text-white">{b.count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">No bottle data yet</p>
        )}
      </div>
    </div>
  );
}

function FunnelBar({
  label,
  count,
  maxCount,
  color,
}: {
  label: string;
  count: number;
  maxCount: number;
  color: string;
}) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm font-bold text-gray-900">{count}</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-6">
        <div
          className={`${color} h-6 rounded-full transition-all flex items-center justify-end pr-3`}
          style={{ width: `${Math.max(pct, 5)}%` }}
        >
          <span className="text-xs font-medium text-white">{Math.round(pct)}%</span>
        </div>
      </div>
    </div>
  );
}
