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
  CheckCircle2,
  AlertCircle,
  Eye,
} from "lucide-react";
import type { FeedItem, PendingItem } from "@/app/api/activity-feed/route";

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

type CronStatus = Record<string, { status: string; completed_at: string | null; error_message: string | null }>;

export default function ActivityFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [cronStatus, setCronStatus] = useState<CronStatus | null>(null);

  const fetchFeed = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [feedRes, cronRes] = await Promise.all([
        fetch(`/api/activity-feed?days=${days}`),
        fetch("/api/cron-status"),
      ]);
      if (feedRes.ok) {
        const data = await feedRes.json();
        setItems(data.items);
        setPending(data.pending ?? []);
      }
      if (cronRes.ok) {
        setCronStatus(await cronRes.json());
      }
    } catch {
      // Silently fail
    } finally {
      if (!silent) setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchFeed();
    const interval = setInterval(() => fetchFeed(true), 30_000);
    return () => clearInterval(interval);
  }, [fetchFeed]);

  async function handlePendingApprove(item: PendingItem) {
    setActionLoading(item.id);
    try {
      const res = await fetch(`/api/autopilot/concepts/${item.jobId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: true }),
      });
      if (res.ok) {
        setPending((prev) => prev.filter((p) => p.id !== item.id));
      }
    } catch {
      // Silently fail
    }
    setActionLoading(null);
  }

  async function handlePendingReject(item: PendingItem) {
    setActionLoading(item.id);
    try {
      const res = await fetch(`/api/autopilot/concepts/${item.jobId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: false }),
      });
      if (res.ok) {
        setPending((prev) => prev.filter((p) => p.id !== item.id));
      }
    } catch {
      // Silently fail
    }
    setActionLoading(null);
  }

  async function handleApproveTranslation(item: PendingItem) {
    setActionLoading(item.id);
    try {
      const res = await fetch(`/api/image-jobs/${item.jobId}/approve-translations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setPending((prev) => prev.filter((p) => p.id !== item.id));
      }
    } catch {
      // Silently fail
    }
    setActionLoading(null);
  }

  async function handleBulkApproveTranslations() {
    const translationItems = pending.filter((p) => p.type === "pending_translation_review");
    if (translationItems.length === 0) return;
    setBulkApproving(true);
    for (const item of translationItems) {
      try {
        const res = await fetch(`/api/image-jobs/${item.jobId}/approve-translations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (res.ok) {
          setPending((prev) => prev.filter((p) => p.id !== item.id));
        }
      } catch {
        // Continue with next item
      }
    }
    setBulkApproving(false);
  }

  const groups = groupByDate(items);
  const translationReviewCount = pending.filter((p) => p.type === "pending_translation_review").length;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-gray-400" />
          <h1 className="text-lg font-semibold text-gray-900">Activity</h1>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 bg-white focus:outline-none focus:border-indigo-500"
        >
          <option value={3}>Last 3 days</option>
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
        </select>
      </div>

      {/* Pipeline health indicator */}
      {cronStatus && (() => {
        const hasError = Object.values(cronStatus).some((c) => c.status === "error");
        const latestRun = Object.values(cronStatus)
          .filter((c) => c.completed_at)
          .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())[0];
        const lastTime = latestRun?.completed_at ? relativeTime(latestRun.completed_at) : "never";

        if (hasError) {
          const failedCrons = Object.entries(cronStatus)
            .filter(([, c]) => c.status === "error")
            .map(([name]) => name.replace(/-/g, " "));
          return (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              <span>Cron error: {failedCrons.join(", ")}</span>
            </div>
          );
        }

        return (
          <div className="flex items-center gap-2 mb-4 px-3 py-1.5 text-xs text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
            <span>Last sync: {lastTime}</span>
          </div>
        );
      })()}

      {/* Pending actions section */}
      {!loading && pending.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-gray-900">
                Needs Your Attention ({pending.length})
              </h2>
            </div>
            {translationReviewCount >= 2 && (
              <button
                onClick={handleBulkApproveTranslations}
                disabled={bulkApproving || actionLoading !== null}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-50"
              >
                {bulkApproving ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
                Approve all translations ({translationReviewCount})
              </button>
            )}
          </div>
          <div className="space-y-2">
            {pending.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 bg-amber-50/50 border border-amber-100 rounded-xl"
              >
                {item.thumbnail && (
                  <img
                    src={item.thumbnail}
                    alt=""
                    className="w-12 h-15 object-cover rounded-lg border border-gray-200 shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {item.details ? `${item.details} ` : ""}{item.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {item.type === "pending_concept" ? "Ready for approval" : item.details}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {item.type === "pending_concept" && (
                    <>
                      <button
                        onClick={() => handlePendingReject(item)}
                        disabled={actionLoading !== null}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Reject"
                      >
                        {actionLoading === item.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <X className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => handlePendingApprove(item)}
                        disabled={actionLoading !== null || !item.landingPageId}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
                        title={!item.landingPageId ? "No landing page assigned" : "Approve & queue"}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        Approve
                      </button>
                    </>
                  )}
                  {item.type === "pending_translation_review" && (
                    <button
                      onClick={() => handleApproveTranslation(item)}
                      disabled={actionLoading !== null}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {actionLoading === item.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Check className="w-3 h-3" />
                      )}
                      Approve
                    </button>
                  )}
                  <Link
                    href={item.linkUrl}
                    className="p-1.5 text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title="View details"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading activity...
        </div>
      ) : items.length === 0 && pending.length === 0 ? (
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
