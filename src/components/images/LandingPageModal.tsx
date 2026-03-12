"use client";

import { useState, useMemo } from "react";
import { X, FileText } from "lucide-react";
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
    return groups;
  }, [landingPages]);

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
          <h2 className="text-base font-semibold text-gray-900">Select Landing Page</h2>
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
            {(grouped[activeTab] ?? []).map((page) => (
              <button
                key={page.id}
                onClick={() => handleSelect(page.id)}
                className={`text-left rounded-lg border-2 overflow-hidden transition-colors ${
                  selectedValue === page.id
                    ? "border-indigo-500 bg-indigo-50"
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
                  {page.page_type === "advertorial" && (
                    <span className="absolute top-1.5 right-1.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                      Advertorial
                    </span>
                  )}
                </div>
                {/* Name */}
                <div className="p-2">
                  <div className="text-xs font-medium text-gray-900 truncate">{page.name}</div>
                  <div className="text-[10px] text-gray-400 truncate">/{page.slug}</div>
                </div>
              </button>
            ))}
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
