"use client";

import { useState } from "react";
import Image from "next/image";
import { CheckCircle2, XCircle, Bot, RefreshCw, Languages, Video } from "lucide-react";
import type { ReviewItem } from "@/app/api/review/pending/route";

interface Props {
  item: ReviewItem;
  onAction: (id: string, action: "approve" | "reject", type: string) => Promise<void>;
  isHighlighted?: boolean;
}

const TYPE_CONFIG = {
  concept: { icon: Bot, label: "Concept", color: "text-purple-600 bg-purple-50" },
  iteration: { icon: RefreshCw, label: "Refresh", color: "text-blue-600 bg-blue-50" },
  video: { icon: Video, label: "Video", color: "text-orange-600 bg-orange-50" },
  translation_review: { icon: Languages, label: "Translation", color: "text-amber-600 bg-amber-50" },
};

export default function ReviewCard({ item, onAction, isHighlighted }: Props) {
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const config = TYPE_CONFIG[item.type];
  const Icon = config.icon;

  async function handleAction(action: "approve" | "reject") {
    if (loading) return;
    setLoading(true);
    setDismissed(true);
    try {
      await onAction(item.id, action, item.type);
    } catch {
      setDismissed(false);
    } finally {
      setLoading(false);
    }
  }

  const timeAgo = getTimeAgo(item.created_at);

  return (
    <div
      className={`bg-white border rounded-xl overflow-hidden shadow-sm transition-all duration-300 ${
        dismissed ? "opacity-0 scale-95 h-0 mb-0 overflow-hidden" : ""
      } ${isHighlighted ? "ring-2 ring-blue-500 ring-offset-2" : "border-gray-200"}`}
    >
      {/* Image row */}
      {item.images.length > 0 && (
        <div className="flex gap-0.5 bg-gray-100">
          {item.images.slice(0, 3).map((img, i) => (
            <div key={i} className="relative flex-1 aspect-[4/5]">
              <Image
                src={img.url}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 768px) 33vw, 150px"
                unoptimized
              />
            </div>
          ))}
        </div>
      )}

      <div className="p-4">
        {/* Type badge + workspace + time */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
            <Icon className="h-3 w-3" />
            {config.label}
          </span>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            {item.workspace.name}
          </span>
          <span className="text-xs text-gray-400 ml-auto">{timeAgo}</span>
        </div>

        {/* Name */}
        <h3 className="font-semibold text-gray-900 text-base mb-1">
          {item.concept_number && (
            <span className="text-gray-400 font-normal">#{item.concept_number} </span>
          )}
          {item.name}
        </h3>

        {/* CASH DNA metadata */}
        {item.cash_dna && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {item.cash_dna.angle && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                {item.cash_dna.angle}
              </span>
            )}
            {item.cash_dna.awareness_level && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                {item.cash_dna.awareness_level.replace(/_/g, " ")}
              </span>
            )}
          </div>
        )}

        {/* Ad copy preview */}
        {item.ad_copy && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-100 w-full text-left"
          >
            {item.ad_copy.headline && (
              <p className="text-sm font-medium text-gray-900 mb-0.5">
                {item.ad_copy.headline}
              </p>
            )}
            {item.ad_copy.primary && (
              <p className={`text-sm text-gray-600 ${expanded ? "" : "line-clamp-3"}`}>
                {item.ad_copy.primary}
              </p>
            )}
            {!expanded && item.ad_copy.primary && item.ad_copy.primary.length > 120 && (
              <span className="text-xs text-blue-600 mt-1 inline-block">Tap to read more</span>
            )}
          </button>
        )}

        {/* Product badge */}
        {item.product && (
          <div className="mb-3">
            <span className="text-xs text-gray-500">
              Product: <span className="font-medium text-gray-700">{item.product}</span>
            </span>
          </div>
        )}

        {/* Action buttons — big touch targets */}
        <div className="flex gap-3">
          <button
            onClick={() => handleAction("approve")}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 active:bg-green-800 disabled:opacity-50 min-h-[48px] transition-colors"
          >
            <CheckCircle2 className="h-5 w-5" />
            Approve
          </button>
          <button
            onClick={() => handleAction("reject")}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 active:bg-red-800 disabled:opacity-50 min-h-[48px] transition-colors"
          >
            <XCircle className="h-5 w-5" />
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

function getTimeAgo(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
