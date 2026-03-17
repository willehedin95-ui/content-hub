"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, XCircle, ExternalLink, Bot } from "lucide-react";

interface AutopilotConcept {
  id: string;
  name: string;
  concept_number: number | null;
  product: string;
  status: string;
  ad_copy_primary?: string | null;
  ad_copy_headline?: string | null;
  cash_dna?: {
    angle?: string;
    awareness_level?: string;
    hooks?: string[];
  } | null;
  landing_page_id?: string | null;
  target_languages?: string[] | null;
  created_at: string;
  archived_at?: string | null;
  source_images?: Array<{ id: string; original_url: string; filename: string }>;
}

interface Props {
  concept: AutopilotConcept;
  status: "pending" | "approved" | "rejected";
  onAction?: () => void;
}

export default function AutopilotConceptCard({ concept, status, onAction }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/autopilot/concepts/${concept.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to approve");
        return;
      }
      onAction?.();
    } catch {
      alert("Failed to approve concept");
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/autopilot/concepts/${concept.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: false }),
      });
      if (!res.ok) throw new Error("Failed");
      onAction?.();
    } catch {
      alert("Failed to reject concept");
    } finally {
      setLoading(false);
    }
  }

  const images = concept.source_images ?? [];
  const angle = concept.cash_dna?.angle;
  const awareness = concept.cash_dna?.awareness_level;
  const hook = concept.cash_dna?.hooks?.[0];
  const COUNTRY_MAP: Record<string, string> = { sv: "SE", da: "DK", no: "NO" };
  const markets = (concept.target_languages ?? []).map((l) => COUNTRY_MAP[l] ?? l.toUpperCase());

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      {/* Image thumbnails */}
      {images.length > 0 && (
        <div className="flex gap-0.5 bg-gray-100">
          {images.slice(0, 3).map((img) => (
            <div key={img.id} className="relative flex-1 aspect-[4/5]">
              <Image
                src={img.original_url}
                alt={img.filename}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 33vw, 150px"
              />
            </div>
          ))}
        </div>
      )}

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Bot className="h-3.5 w-3.5 text-purple-500 flex-shrink-0" />
              <span className="text-xs text-purple-600 font-medium">Autopilot</span>
              {concept.concept_number && (
                <span className="text-xs text-gray-400">#{concept.concept_number}</span>
              )}
            </div>
            <h3 className="font-medium text-gray-900 text-sm truncate">{concept.name}</h3>
          </div>
          <div
            className={`ml-2 flex-shrink-0 px-2 py-0.5 rounded text-xs font-medium ${
              status === "pending"
                ? "bg-yellow-100 text-yellow-700"
                : status === "approved"
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
            }`}
          >
            {status === "pending" ? "pending" : status}
          </div>
        </div>

        {/* Metadata */}
        <div className="space-y-1 text-xs text-gray-600 mb-3">
          {angle && (
            <div><span className="font-medium">Angle:</span> {angle}</div>
          )}
          {awareness && (
            <div><span className="font-medium">Awareness:</span> {awareness.replace("_", " ")}</div>
          )}
          {hook && (
            <div className="line-clamp-2">
              <span className="font-medium">Hook:</span> &ldquo;{hook}&rdquo;
            </div>
          )}
          {markets.length > 0 && (
            <div><span className="font-medium">Markets:</span> {markets.join(", ")}</div>
          )}
          {!concept.landing_page_id && status === "pending" && (
            <div className="text-amber-600 font-medium">No landing page assigned</div>
          )}
        </div>

        {/* Ad copy preview */}
        {concept.ad_copy_headline && (
          <div className="mb-3 p-2.5 bg-gray-50 rounded border border-gray-200">
            <div className="text-xs font-medium text-gray-900 mb-0.5">
              {concept.ad_copy_headline}
            </div>
            {concept.ad_copy_primary && (
              <div className="text-xs text-gray-600 line-clamp-2">
                {concept.ad_copy_primary}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {status === "pending" && (
            <>
              <button
                onClick={handleApprove}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                Approve
              </button>
              <button
                onClick={handleReject}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </button>
            </>
          )}
          <Link
            href={`/images/${concept.id}`}
            className="flex items-center justify-center gap-1 px-3 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded hover:bg-gray-200"
          >
            <ExternalLink className="h-4 w-4" />
            View
          </Link>
        </div>

        <div className="mt-2 text-xs text-gray-400">
          {new Date(concept.created_at).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}
