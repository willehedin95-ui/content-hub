"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Trophy, ThumbsUp, ThumbsDown } from "lucide-react";

interface ChallengeData {
  completions: Array<{ tier: string; count: number; users: number }>;
  progression: Array<{ tier: string; accepted: number; dismissed: number; acceptRate: number }>;
}

const TIER_LABELS: Record<string, string> = {
  glowFoundation: "Glow Foundation (20d)",
  habitBuilder: "Habit Builder (40d)",
  skinCare: "Skin Care (60d)",
  deepResults: "Deep Results (90d)",
  fullTransformation: "Full Transformation (180d)",
};

const TIER_COLORS: Record<string, string> = {
  glowFoundation: "bg-amber-100 text-amber-700",
  habitBuilder: "bg-blue-100 text-blue-700",
  skinCare: "bg-pink-100 text-pink-700",
  deepResults: "bg-purple-100 text-purple-700",
  fullTransformation: "bg-green-100 text-green-700",
};

export default function ChallengeSection() {
  const [data, setData] = useState<ChallengeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/app-analytics?section=challenges");
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
        {[1, 2].map((i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-lg p-5 h-48 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
        <p className="font-medium">Failed to load challenge data</p>
        <p className="mt-1">{error}</p>
        <button onClick={fetchData} className="mt-3 px-3 py-1.5 bg-red-100 hover:bg-red-200 rounded text-sm font-medium">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const hasCompletions = data.completions.length > 0;
  const hasProgression = data.progression.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Challenge System</h3>
        <button onClick={fetchData} className="p-1.5 text-gray-400 hover:text-gray-600">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Completions */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h4 className="text-sm font-medium text-gray-500 mb-4 flex items-center gap-2">
          <Trophy className="w-4 h-4" />
          Challenge Completions
        </h4>
        {hasCompletions ? (
          <div className="space-y-3">
            {data.completions.map((c) => (
              <div key={c.tier} className="flex items-center justify-between">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${TIER_COLORS[c.tier] || "bg-gray-100 text-gray-700"}`}>
                  {TIER_LABELS[c.tier] || c.tier}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">{c.users} user{c.users !== 1 ? "s" : ""}</span>
                  <span className="text-sm font-bold text-gray-900">{c.count} completions</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Trophy className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No challenges completed yet</p>
            <p className="text-xs text-gray-300 mt-1">First completions will appear as users reach their target days</p>
          </div>
        )}
      </div>

      {/* Progression (accept vs dismiss) */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h4 className="text-sm font-medium text-gray-500 mb-4">Next Challenge: Accept vs Dismiss</h4>
        {hasProgression ? (
          <div className="space-y-4">
            {data.progression.map((p) => (
              <div key={p.tier} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    {TIER_LABELS[p.tier] || p.tier}
                  </span>
                  <span className={`text-xs font-bold ${p.acceptRate >= 50 ? "text-green-600" : "text-amber-600"}`}>
                    {p.acceptRate}% accept
                  </span>
                </div>
                <div className="flex gap-4 text-sm">
                  <span className="flex items-center gap-1 text-green-600">
                    <ThumbsUp className="w-3.5 h-3.5" /> {p.accepted} accepted
                  </span>
                  <span className="flex items-center gap-1 text-gray-400">
                    <ThumbsDown className="w-3.5 h-3.5" /> {p.dismissed} dismissed
                  </span>
                </div>
                {/* Progress bar */}
                <div className="mt-2 flex h-2 rounded-full overflow-hidden bg-gray-100">
                  <div className="bg-green-500 transition-all" style={{ width: `${p.acceptRate}%` }} />
                  <div className="bg-gray-300 transition-all" style={{ width: `${100 - p.acceptRate}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">No progression data yet</p>
            <p className="text-xs text-gray-300 mt-1">Appears when users complete a challenge and are offered the next tier</p>
          </div>
        )}
      </div>
    </div>
  );
}
