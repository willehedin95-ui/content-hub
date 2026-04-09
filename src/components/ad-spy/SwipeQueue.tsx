"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, Check, ExternalLink, Clock } from "lucide-react";

interface QueueItem {
  id: string;
  gethookd_ad_id: number;
  brand_name: string;
  status: string;
  media_urls: string[];
  created_at: string;
  updated_at: string;
  image_job: {
    id: string;
    name: string;
    concept_number: number;
    status: string;
    launchpad_priority: number | null;
    archived_at: string | null;
  } | null;
}

export default function SwipeQueue({ onCountChange }: { onCountChange: (count: number) => void }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ queued: 0, swiping: 0, swiped: 0 });
  const processingRef = useRef(false);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/ad-spy/queue");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items ?? []);
      setCounts(data.counts ?? { queued: 0, swiping: 0, swiped: 0 });
      onCountChange((data.counts?.queued ?? 0) + (data.counts?.swiping ?? 0));
    } catch {
      // ignore polling errors
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  // Poll every 5s
  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  // Auto-trigger process-next when there are queued items.
  // We rely only on processingRef (in-flight local request) to prevent
  // double-triggering — NOT on counts.swiping, because a single stuck
  // "swiping" row would otherwise block the queue forever.
  useEffect(() => {
    if (counts.queued > 0 && !processingRef.current) {
      processingRef.current = true;
      fetch("/api/ad-spy/process-next", { method: "POST" })
        .catch(() => {})
        .finally(() => {
          processingRef.current = false;
        });
    }
  }, [counts.queued]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading queue...</span>
      </div>
    );
  }

  const swipingItems = items.filter((i) => i.status === "swiping");
  const queuedItems = items.filter((i) => i.status === "queued");
  const recentDone = items.filter((i) => i.status === "swiped" && i.image_job);

  const totalActive = swipingItems.length + queuedItems.length;

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        No items in the swipe queue. Go to the Discovered tab to swipe ads.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      {totalActive > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              {swipingItems.length > 0 ? "Processing..." : "Queued"}
            </span>
            <span className="text-xs text-gray-400">
              {counts.swiped} done / {totalActive + counts.swiped} total
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all"
              style={{ width: `${totalActive + counts.swiped > 0 ? (counts.swiped / (totalActive + counts.swiped)) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Currently swiping */}
      {swipingItems.length > 0 && (
        <Section title="Processing Now">
          {swipingItems.map((item) => (
            <div key={item.id} className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
              <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                {item.media_urls?.[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.media_urls[0]} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{item.brand_name}</p>
                <p className="text-xs text-gray-400">Analyzing with AI + generating images...</p>
              </div>
              <Loader2 className="w-4 h-4 text-indigo-500 animate-spin shrink-0" />
            </div>
          ))}
        </Section>
      )}

      {/* Queued */}
      {queuedItems.length > 0 && (
        <Section title={`Queued (${queuedItems.length})`}>
          {queuedItems.map((item, idx) => (
            <div key={item.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
              <span className="text-xs text-gray-400 w-6 text-center shrink-0">#{idx + 1}</span>
              <div className="w-8 h-8 rounded bg-gray-100 overflow-hidden shrink-0">
                {item.media_urls?.[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.media_urls[0]} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <span className="text-sm text-gray-600 truncate flex-1">{item.brand_name}</span>
              <Clock className="w-3.5 h-3.5 text-gray-300 shrink-0" />
            </div>
          ))}
        </Section>
      )}

      {/* Recently completed — view only, no approve/reject */}
      {recentDone.length > 0 && (
        <Section title={`Completed (${recentDone.length})`}>
          {recentDone.map((item) => (
            <div key={item.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="text-sm text-gray-700 flex-1 truncate">
                #{item.image_job?.concept_number} {item.image_job?.name}
              </span>
              <a href={`/images/${item.image_job?.id}`} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                Review <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="px-4">{children}</div>
    </div>
  );
}
