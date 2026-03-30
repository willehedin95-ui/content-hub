"use client";

import { useState, useMemo, useEffect } from "react";
import { X, FileText, TrendingUp, Star } from "lucide-react";
import type { PageAngle } from "@/types";

interface LandingPageItem {
  id: string;
  name: string;
  slug: string;
  product: string;
  tags?: string[];
  page_type?: string;
  angle?: string;
  thumbnail_url?: string | null;
  isPublished?: boolean;
}

interface PageRecommendation {
  page_id: string;
  spend: number;
  conversions: number;
  revenue: number;
  roas: number;
  cpa: number;
  concept_count: number;
  confidence: "high" | "medium" | "low" | "no_data";
}

interface LandingPageModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (value: string) => void;
  landingPages: LandingPageItem[];
  selectedValue: string;
  conceptTags?: string[];
  conceptAngle?: string;
}

const ANGLE_TABS: { key: PageAngle; label: string }[] = [
  { key: "snoring", label: "Snoring" },
  { key: "neck_pain", label: "Neck Pain" },
  { key: "neutral", label: "Neutral" },
];

function detectConceptAngle(tags?: string[], angle?: string): PageAngle {
  if (angle === "snoring" || angle === "neck_pain") return angle;
  const joined = (tags ?? []).join(" ").toLowerCase();
  if (joined.includes("snoring") || joined.includes("snore")) return "snoring";
  if (joined.includes("neck") || joined.includes("pain")) return "neck_pain";
  return "neutral";
}

const CONFIDENCE_STYLES = {
  high: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-gray-100 text-gray-500",
  no_data: "",
} as const;

export default function LandingPageModal({
  open,
  onClose,
  onSelect,
  landingPages,
  selectedValue,
  conceptTags,
  conceptAngle,
}: LandingPageModalProps) {
  const autoAngle = useMemo(
    () => detectConceptAngle(conceptTags, conceptAngle),
    [conceptTags, conceptAngle]
  );

  const [activeTab, setActiveTab] = useState<PageAngle>(autoAngle);
  const [recommendations, setRecommendations] = useState<
    Map<string, PageRecommendation>
  >(new Map());

  // Fetch page performance recommendations when modal opens
  const product = landingPages[0]?.product;
  useEffect(() => {
    if (!open || !product) return;
    fetch(`/api/pages/recommendations?product=${product}`)
      .then((res) => res.json())
      .then((data) => {
        const map = new Map<string, PageRecommendation>();
        for (const rec of data.recommendations ?? []) {
          map.set(rec.page_id, rec);
        }
        setRecommendations(map);
      })
      .catch(() => {});
  }, [open, product]);

  const grouped = useMemo(() => {
    const groups: Record<PageAngle, LandingPageItem[]> = {
      snoring: [],
      neck_pain: [],
      neutral: [],
    };
    for (const page of landingPages) {
      const angle = (page.angle as PageAngle) || "neutral";
      groups[angle].push(page);
    }
    // Sort each group: pages with performance data first, by ROAS desc
    for (const angle of Object.keys(groups) as PageAngle[]) {
      groups[angle].sort((a, b) => {
        const recA = recommendations.get(a.id);
        const recB = recommendations.get(b.id);
        const hasA = recA && recA.confidence !== "no_data";
        const hasB = recB && recB.confidence !== "no_data";
        if (hasA && !hasB) return -1;
        if (!hasA && hasB) return 1;
        if (hasA && hasB) return (recB?.roas ?? 0) - (recA?.roas ?? 0);
        return 0;
      });
    }
    return groups;
  }, [landingPages, recommendations]);

  // Find the best page across all angles for the "top pick" badge
  const topPageId = useMemo(() => {
    let best: { id: string; roas: number } | null = null;
    for (const [pageId, rec] of recommendations) {
      if (
        (rec.confidence === "high" || rec.confidence === "medium") &&
        rec.roas > 0 &&
        (!best || rec.roas > best.roas)
      ) {
        best = { id: pageId, roas: rec.roas };
      }
    }
    return best?.id ?? null;
  }, [recommendations]);

  if (!open) return null;

  const handleSelect = (value: string) => {
    onSelect(value);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Select Landing Page</h2>
            {recommendations.size > 0 && (
              <p className="text-[11px] text-gray-400 mt-0.5">
                Sorted by 30-day ROAS performance
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 pb-2 border-b border-gray-100">
          {ANGLE_TABS.map((tab) => {
            const count = grouped[tab.key]?.length ?? 0;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  activeTab === tab.key
                    ? "bg-indigo-50 text-indigo-700 font-medium"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                {tab.label}
                <span className="ml-1.5 text-xs opacity-60">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(grouped[activeTab] ?? []).map((page) => {
              const rec = recommendations.get(page.id);
              const hasData = rec && rec.confidence !== "no_data";
              const isTopPick = page.id === topPageId;

              return (
                <button
                  key={page.id}
                  onClick={() => handleSelect(page.id)}
                  className={`text-left rounded-lg border-2 overflow-hidden transition-colors ${
                    selectedValue === page.id
                      ? "border-indigo-500 bg-indigo-50"
                      : isTopPick
                        ? "border-green-400 hover:border-green-500"
                        : "border-gray-200 hover:border-indigo-300"
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="aspect-[3/4] bg-gray-100 relative">
                    {page.thumbnail_url ? (
                      <img
                        src={page.thumbnail_url}
                        alt={page.name}
                        className="w-full h-full object-cover object-top"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FileText className="w-8 h-8 text-gray-300" />
                      </div>
                    )}
                    {/* Badges row */}
                    <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 items-end">
                      {page.isPublished === false && (
                        <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium">
                          Not published
                        </span>
                      )}
                      {page.page_type === "advertorial" && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                          Advertorial
                        </span>
                      )}
                      {isTopPick && (
                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5" />
                          Top pick
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Name + metrics */}
                  <div className="p-2">
                    <div className="text-xs font-medium text-gray-900 truncate">{page.name}</div>
                    <div className="text-[10px] text-gray-400 truncate">/{page.slug}</div>
                    {hasData && rec && (
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5 ${CONFIDENCE_STYLES[rec.confidence]}`}
                        >
                          <TrendingUp className="w-2.5 h-2.5" />
                          {rec.roas.toFixed(1)}x
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {rec.conversions} sale{rec.conversions !== 1 ? "s" : ""}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {rec.concept_count} concept{rec.concept_count !== 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
            {(grouped[activeTab] ?? []).length === 0 && (
              <p className="col-span-full text-sm text-gray-400 text-center py-8">
                No pages in this category
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
