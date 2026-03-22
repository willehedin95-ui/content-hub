"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Skull,
  TrendingUp,
  Sparkles,
  Check,
  X,
  RefreshCw,
  Video,
  Loader2,
  Radio,
} from "lucide-react";
import type { FeedItem } from "@/app/api/activity-feed/route";

const ICONS: Record<string, { icon: typeof Skull; color: string; bg: string }> = {
  kill_adset: { icon: Skull, color: "text-red-600", bg: "bg-red-50" },
  increase_budget: { icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
  concept_created: { icon: Sparkles, color: "text-indigo-600", bg: "bg-indigo-50" },
  concept_approved: { icon: Check, color: "text-emerald-600", bg: "bg-emerald-50" },
  concept_rejected: { icon: X, color: "text-gray-400", bg: "bg-gray-50" },
  video_created: { icon: Video, color: "text-indigo-600", bg: "bg-indigo-50" },
  video_approved: { icon: Check, color: "text-emerald-600", bg: "bg-emerald-50" },
  video_rejected: { icon: X, color: "text-gray-400", bg: "bg-gray-50" },
  iterate_concept: { icon: RefreshCw, color: "text-amber-600", bg: "bg-amber-50" },
  iterate_approved: { icon: Check, color: "text-emerald-600", bg: "bg-emerald-50" },
  iterate_rejected: { icon: X, color: "text-gray-400", bg: "bg-gray-50" },
  concept_pushed: { icon: TrendingUp, color: "text-indigo-600", bg: "bg-indigo-50" },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("sv-SE");
}

function groupByDate(items: FeedItem[]): { label: string; items: FeedItem[] }[] {
  const groups: Map<string, FeedItem[]> = new Map();
  const today = new Date().toLocaleDateString("sv-SE");
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("sv-SE");

  for (const item of items) {
    const dateStr = new Date(item.timestamp).toLocaleDateString("sv-SE");
    let label = dateStr;
    if (dateStr === today) label = "Today";
    else if (dateStr === yesterday) label = "Yesterday";

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

export default function ActivityFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch(`/api/activity-feed?days=${days}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  const groups = groupByDate(items);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-gray-400" />
          <h1 className="text-lg font-semibold text-gray-900">Activity</h1>
        </div>
        <select
          value={days}
          onChange={(e) => { setDays(Number(e.target.value)); setLoading(true); }}
          className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 bg-white focus:outline-none focus:border-indigo-500"
        >
          <option value={3}>Last 3 days</option>
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading activity...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Radio className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No autopilot activity in the last {days} days</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.label}>
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 px-1">
                {group.label}
              </h3>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const config = ICONS[item.type] ?? ICONS.concept_created;
                  const Icon = config.icon;

                  const content = (
                    <div
                      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                        item.linkUrl ? "hover:bg-gray-50 cursor-pointer" : ""
                      } ${item.success === false ? "opacity-60" : ""}`}
                    >
                      <div className={`mt-0.5 p-1.5 rounded-md ${config.bg}`}>
                        <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 leading-snug">{item.title}</p>
                        {item.details && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{item.details}</p>
                        )}
                      </div>
                      <span className="text-xs text-gray-300 whitespace-nowrap mt-0.5">
                        {relativeTime(item.timestamp)}
                      </span>
                    </div>
                  );

                  return item.linkUrl ? (
                    <Link key={item.id} href={item.linkUrl}>
                      {content}
                    </Link>
                  ) : (
                    <div key={item.id}>{content}</div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
