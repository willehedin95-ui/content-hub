"use client";

import { useState } from "react";
import { SavedAd, SpyAd } from "@/types";
import {
  X,
  Bookmark,
  ExternalLink,
  Sparkles,
  Loader2,
  MessageSquare,
  FileText,
  Wand2,
  Globe,
} from "lucide-react";
import ConceptGeneratorModal from "@/components/spy/ConceptGeneratorModal";

const platformLabels: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  unknown: "Unknown",
};

interface Props {
  ad: SavedAd;
  onClose: () => void;
  onBookmark: (id: string, bookmarked: boolean) => void;
  onNotesChange: (id: string, notes: string) => void;
  onAnalyzed: (ad: SavedAd) => void;
}

export default function SavedAdDetail({
  ad,
  onClose,
  onBookmark,
  onNotesChange,
  onAnalyzed,
}: Props) {
  const [analyzing, setAnalyzing] = useState(false);
  const [notes, setNotes] = useState(ad.user_notes ?? "");
  const [notesTimeout, setNotesTimeout] = useState<NodeJS.Timeout | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);

  const mediaSrc = ad.media_url || ad.thumbnail_url;
  const analysis = ad.cash_analysis;

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/saved-ads/${ad.id}/analyze`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Analysis failed");
      }
      const { cash_analysis } = await res.json();
      onAnalyzed({
        ...ad,
        cash_analysis,
        analyzed_at: new Date().toISOString(),
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  function handleNotesChange(value: string) {
    setNotes(value);
    if (notesTimeout) clearTimeout(notesTimeout);
    const timeout = setTimeout(() => {
      onNotesChange(ad.id, value);
    }, 800);
    setNotesTimeout(timeout);
  }

  // Adapt SavedAd to SpyAd shape for ConceptGeneratorModal
  const adForModal = {
    id: ad.id,
    brand_id: "",
    meta_ad_id: "",
    headline: ad.headline,
    body: ad.body,
    description: null,
    link_url: ad.destination_url,
    cta_type: null,
    media_type: ad.media_type,
    media_url: ad.media_url,
    thumbnail_url: ad.thumbnail_url,
    ad_snapshot_url: null,
    ad_delivery_start_time: null,
    is_active: true,
    publisher_platforms: null,
    impressions_rank: null,
    impressions_label: null,
    raw_data: null,
    cash_analysis: ad.cash_analysis,
    analyzed_at: ad.analyzed_at,
    is_bookmarked: ad.is_bookmarked,
    user_notes: ad.user_notes,
    first_seen_at: ad.created_at,
    last_seen_at: ad.created_at,
    created_at: ad.created_at,
    updated_at: ad.updated_at,
  } as SpyAd;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              Saved Ad
            </h2>
            {ad.brand_name && (
              <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                {ad.brand_name}
              </span>
            )}
            <span className="text-xs text-gray-400">
              {platformLabels[ad.source_platform]}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onBookmark(ad.id, !ad.is_bookmarked)}
              className={`p-2 rounded-lg transition-colors ${
                ad.is_bookmarked
                  ? "bg-amber-50 text-amber-600"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              }`}
              title={ad.is_bookmarked ? "Remove bookmark" : "Bookmark"}
            >
              <Bookmark
                className={`w-4 h-4 ${ad.is_bookmarked ? "fill-amber-500" : ""}`}
              />
            </button>
            {ad.source_url && (
              <a
                href={ad.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                title="View original post"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Media */}
        <div className="relative bg-gray-100">
          {mediaSrc ? (
            ad.media_type === "video" && ad.media_url ? (
              <video
                src={ad.media_url}
                poster={ad.thumbnail_url ?? undefined}
                controls
                className="w-full max-h-[500px] object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaSrc}
                alt={ad.headline ?? "Saved ad"}
                className="w-full max-h-[500px] object-contain"
              />
            )
          ) : (
            <div className="w-full h-64 flex items-center justify-center text-gray-400">
              No media available
            </div>
          )}
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Ad copy */}
          <div className="space-y-3">
            {ad.headline && (
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  <FileText className="w-3 h-3" /> Headline
                </label>
                <p className="text-sm font-medium text-gray-900">
                  {ad.headline}
                </p>
              </div>
            )}
            {ad.body && (
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  <MessageSquare className="w-3 h-3" /> Body
                </label>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {ad.body}
                </p>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3">
            {ad.destination_url && (
              <div className="col-span-2 flex items-center gap-2 text-sm">
                <ExternalLink className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="text-gray-500 shrink-0">URL:</span>
                <a
                  href={ad.destination_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:text-indigo-800 truncate"
                >
                  {ad.destination_url}
                </a>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Globe className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-500">Platform:</span>
              <span className="text-gray-800">
                {platformLabels[ad.source_platform]}
              </span>
            </div>
          </div>

          {/* CASH Analysis */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-600" />
                <span className="text-sm font-semibold text-gray-800">
                  CASH Analysis
                </span>
              </div>
              {!analysis && ad.media_type === "image" && (
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3" />
                      Analyze
                    </>
                  )}
                </button>
              )}
            </div>

            {analysis ? (
              <div className="px-4 py-4 space-y-3">
                {analysis.concept_description && (
                  <p className="text-sm text-gray-700 italic">
                    &ldquo;{analysis.concept_description}&rdquo;
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  {analysis.concept_type && (
                    <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                      {analysis.concept_type}
                    </span>
                  )}
                  {analysis.angle && (
                    <span className="text-xs font-medium text-violet-700 bg-violet-50 px-2 py-1 rounded-lg border border-violet-200">
                      {analysis.angle}
                    </span>
                  )}
                  {analysis.style && (
                    <span className="text-xs font-medium text-fuchsia-700 bg-fuchsia-50 px-2 py-1 rounded-lg border border-fuchsia-200">
                      {analysis.style}
                    </span>
                  )}
                  {analysis.awareness_level && (
                    <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200">
                      {analysis.awareness_level}
                    </span>
                  )}
                  {analysis.offer_type && (
                    <span className="text-xs font-medium text-orange-700 bg-orange-50 px-2 py-1 rounded-lg border border-orange-200">
                      {analysis.offer_type}
                    </span>
                  )}
                  {analysis.estimated_production && (
                    <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-lg border border-gray-200">
                      {analysis.estimated_production}
                    </span>
                  )}
                </div>

                {analysis.hooks && analysis.hooks.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5 block">
                      Hooks
                    </label>
                    <ul className="space-y-1">
                      {analysis.hooks.map((hook: string, i: number) => (
                        <li
                          key={i}
                          className="text-sm text-gray-700 flex items-start gap-1.5"
                        >
                          <span className="text-gray-400 shrink-0">&bull;</span>
                          {hook}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis.copy_blocks && analysis.copy_blocks.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5 block">
                      Copy Blocks
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.copy_blocks.map((block: string, i: number) => (
                        <span
                          key={i}
                          className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded"
                        >
                          {block}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                {analyzing
                  ? "Running AI analysis..."
                  : ad.media_type !== "image"
                    ? "AI analysis is only available for image ads."
                    : 'Not analyzed yet. Click "Analyze" to run CASH analysis.'}
              </div>
            )}
          </div>

          {/* Create Concept */}
          {analysis && (
            <button
              onClick={() => setShowGenerator(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors"
            >
              <Wand2 className="w-4 h-4" />
              Create Concept from This Ad
            </button>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Add your notes about this ad..."
              rows={3}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-indigo-400 transition-colors resize-none"
            />
          </div>
        </div>
      </div>

      <ConceptGeneratorModal
        open={showGenerator}
        onClose={() => setShowGenerator(false)}
        ad={adForModal}
        apiBasePath="/api/saved-ads"
        brandName={ad.brand_name ?? undefined}
      />
    </div>
  );
}
