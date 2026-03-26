"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Bell, Camera, Gift, Map } from "lucide-react";

interface FeatureData {
  milestoneViews: Array<{ type: string; count: number; users: number }>;
  selfiesTaken: number;
  selfieUsers: number;
  rewardCodes: Array<{ code: string; copies: number }>;
  notificationPermission: { granted: number; denied: number; rate: number };
  eventBreakdown: Array<{ eventType: string; count: number; users: number }>;
}

const EVENT_LABELS: Record<string, string> = {
  "dose.taken": "Dose Logged",
  "dose.undone": "Dose Undone",
  "onboarding.started": "Onboarding Started",
  "onboarding.completed": "Onboarding Completed",
  "challenge.completed": "Challenge Completed",
  "challenge.nextAccepted": "Next Challenge Accepted",
  "challenge.nextDismissed": "Next Challenge Dismissed",
  "journey.milestoneViewed": "Milestone Viewed",
  "reward.codeCopied": "Reward Code Copied",
  "selfie.taken": "Selfie Taken",
  "notification.permissionResult": "Notification Permission",
};

export default function FeatureSection() {
  const [data, setData] = useState<FeatureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/app-analytics?section=features&period=30");
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
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-lg p-5 h-32 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
        <p className="font-medium">Failed to load feature data</p>
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
        <h3 className="text-lg font-semibold text-gray-900">Feature Usage</h3>
        <button onClick={fetchData} className="p-1.5 text-gray-400 hover:text-gray-600">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Feature KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <FeatureCard
          icon={<Map className="w-5 h-5 text-indigo-500" />}
          label="Milestone Views"
          value={data.milestoneViews.reduce((sum, m) => sum + m.count, 0)}
          subtitle={`${new Set(data.milestoneViews.map((m) => m.users)).size || data.milestoneViews.reduce((sum, m) => sum + m.users, 0)} users`}
        />
        <FeatureCard
          icon={<Camera className="w-5 h-5 text-pink-500" />}
          label="Selfies Taken"
          value={data.selfiesTaken}
          subtitle={`${data.selfieUsers} user${data.selfieUsers !== 1 ? "s" : ""}`}
        />
        <FeatureCard
          icon={<Gift className="w-5 h-5 text-amber-500" />}
          label="Codes Copied"
          value={data.rewardCodes.reduce((sum, r) => sum + r.copies, 0)}
          subtitle={`${data.rewardCodes.length} unique code${data.rewardCodes.length !== 1 ? "s" : ""}`}
        />
        <FeatureCard
          icon={<Bell className="w-5 h-5 text-green-500" />}
          label="Notification Opt-in"
          value={`${data.notificationPermission.rate}%`}
          subtitle={`${data.notificationPermission.granted} of ${data.notificationPermission.granted + data.notificationPermission.denied}`}
        />
      </div>

      {/* Milestone breakdown */}
      {data.milestoneViews.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h4 className="text-sm font-medium text-gray-500 mb-4">Milestone Views by Type</h4>
          <div className="space-y-2">
            {data.milestoneViews
              .sort((a, b) => b.count - a.count)
              .map((m) => (
                <div key={m.type} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-700 capitalize">{m.type.replace(/_/g, " ")}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{m.users} user{m.users !== 1 ? "s" : ""}</span>
                    <span className="text-sm font-medium text-gray-900">{m.count} views</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Reward codes */}
      {data.rewardCodes.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h4 className="text-sm font-medium text-gray-500 mb-4">Reward Code Usage</h4>
          <div className="space-y-2">
            {data.rewardCodes
              .sort((a, b) => b.copies - a.copies)
              .map((r) => (
                <div key={r.code} className="flex items-center justify-between py-1.5">
                  <code className="text-sm bg-gray-100 px-2 py-0.5 rounded font-mono">{r.code}</code>
                  <span className="text-sm font-medium text-gray-900">{r.copies} copies</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Notification permission */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h4 className="text-sm font-medium text-gray-500 mb-4 flex items-center gap-2">
          <Bell className="w-4 h-4" />
          Notification Permission
        </h4>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex h-4 rounded-full overflow-hidden bg-gray-100">
              <div
                className="bg-green-500 transition-all"
                style={{ width: `${data.notificationPermission.rate}%` }}
              />
              <div
                className="bg-red-300 transition-all"
                style={{ width: `${100 - data.notificationPermission.rate}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-green-600 font-medium">{data.notificationPermission.granted} allowed</span>
            <span className="text-red-400">{data.notificationPermission.denied} denied</span>
          </div>
        </div>
      </div>

      {/* All events breakdown */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h4 className="text-sm font-medium text-gray-500 mb-4">All Events (30d)</h4>
        <div className="space-y-2">
          {data.eventBreakdown.map((e) => (
            <div key={e.eventType} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
              <span className="text-sm text-gray-700">{EVENT_LABELS[e.eventType] || e.eventType}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{e.users} user{e.users !== 1 ? "s" : ""}</span>
                <span className="text-sm font-medium text-gray-900">{e.count}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  subtitle: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className="text-sm font-medium text-gray-500">{label}</p>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
    </div>
  );
}
