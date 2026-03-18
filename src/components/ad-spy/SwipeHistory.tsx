"use client";

import { useState, useEffect } from "react";
import { Loader2, ExternalLink, Check, X, Clock } from "lucide-react";

interface HistoryItem {
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

export default function SwipeHistory() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch("/api/ad-spy/queue?history=true");
        if (!res.ok) return;
        const data = await res.json();
        setItems(data.items ?? []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading history...</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        No swiped ads yet.
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/50">
            <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-2">Ad</th>
            <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-2">Concept</th>
            <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-2">Brand</th>
            <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-2">Status</th>
            <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-2">Date</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const job = item.image_job;
            const status = getStatus(item);

            return (
              <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-4 py-2.5">
                  <div className="w-8 h-8 rounded bg-gray-100 overflow-hidden">
                    {item.media_urls?.[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.media_urls[0]} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  {job ? (
                    <span className="text-gray-800">
                      <span className="text-gray-400 mr-1">#{job.concept_number}</span>
                      {job.name}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-gray-600">{item.brand_name}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${status.className}`}>
                    <status.icon className="w-3 h-3" />
                    {status.label}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-400">
                  {new Date(item.updated_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-2.5">
                  {job && (
                    <a href={`/images/${job.id}`} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                      View <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function getStatus(item: HistoryItem) {
  const job = item.image_job;
  if (!job) return { label: "Draft", icon: Clock, className: "bg-gray-100 text-gray-600" };
  if (job.archived_at) return { label: "Rejected", icon: X, className: "bg-red-50 text-red-600" };
  if (job.launchpad_priority) return { label: "Approved", icon: Check, className: "bg-emerald-50 text-emerald-600" };
  return { label: "Pending", icon: Clock, className: "bg-yellow-50 text-yellow-600" };
}
