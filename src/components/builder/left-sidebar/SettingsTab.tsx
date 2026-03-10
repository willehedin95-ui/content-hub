"use client";

import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  Loader2,
  Monitor,
  Smartphone,
  MoveHorizontal,
  MoveVertical,
  MousePointerClick,
} from "lucide-react";
import { useBuilder } from "../BuilderContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function charCountBadge(
  count: number,
  green: number,
  yellow: number
): string {
  if (count === 0) return "bg-gray-100 text-gray-400";
  if (count <= green) return "bg-green-100 text-green-700";
  if (count <= yellow) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

const inputClass =
  "w-full bg-white border border-gray-200 text-gray-900 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20";

const numInputClass =
  "w-full bg-white border border-gray-300 text-gray-900 rounded px-1.5 py-1 text-xs text-center focus:outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

// ---------------------------------------------------------------------------
// CollapsibleSection
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-1"
      >
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          {title}
        </p>
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${
            open ? "" : "-rotate-90"
          }`}
        />
      </button>
      {open && <div className="mt-2 space-y-2.5">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsTab
// ---------------------------------------------------------------------------

export default function SettingsTab() {
  const {
    // SEO
    seoTitle,
    setSeoTitle,
    seoDesc,
    setSeoDesc,
    slug,
    setSlug,
    // Link / URLs
    linkUrl,
    handleLinkUrlChange,
    filteredUrls,
    urlMode,
    setUrlMode,
    // Retranslate
    isSource,
    retranslating,
    requestRetranslate,
    // Padding
    viewMode,
    setViewMode,
    padDH,
    padDV,
    padMH,
    padMV,
    handlePaddingChange,
    excludeMode,
    setExcludeMode,
    excludeCount,
  } = useBuilder();

  return (
    <div className="px-3 py-3 space-y-3">
      {/* SEO Section — default open */}
      <CollapsibleSection title="SEO" defaultOpen>
        {/* SEO Title */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-medium text-gray-600">
              Title
            </label>
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${charCountBadge(seoTitle.length, 50, 60)}`}
            >
              {seoTitle.length}
            </span>
          </div>
          <input
            type="text"
            value={seoTitle}
            onChange={(e) => setSeoTitle(e.target.value)}
            placeholder="SEO title..."
            className={inputClass}
          />
        </div>

        {/* Meta Description */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-medium text-gray-600">
              Description
            </label>
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${charCountBadge(seoDesc.length, 130, 160)}`}
            >
              {seoDesc.length}
            </span>
          </div>
          <textarea
            value={seoDesc}
            onChange={(e) => setSeoDesc(e.target.value)}
            placeholder="Meta description..."
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* Slug */}
        <div>
          <label className="text-[11px] font-medium text-gray-600 mb-1 block">
            Slug
          </label>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="page-slug"
            className={inputClass}
          />
        </div>
      </CollapsibleSection>

      {/* Destination URL — default open */}
      <CollapsibleSection title="Destination URL" defaultOpen>
        {filteredUrls.length > 0 ? (
          <>
            {urlMode === "saved" ? (
              <>
                <select
                  value={linkUrl}
                  onChange={(e) => handleLinkUrlChange(e.target.value)}
                  className={inputClass}
                >
                  {filteredUrls.map((u) => (
                    <option key={u.id} value={u.url}>
                      {u.url}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setUrlMode("custom")}
                  className="text-[11px] text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  Use custom URL
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  value={linkUrl}
                  onChange={(e) => handleLinkUrlChange(e.target.value)}
                  placeholder="https://..."
                  className={inputClass}
                />
                <button
                  onClick={() => setUrlMode("saved")}
                  className="text-[11px] text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  Use saved URL
                </button>
              </>
            )}
          </>
        ) : (
          <input
            type="text"
            value={linkUrl}
            onChange={(e) => handleLinkUrlChange(e.target.value)}
            placeholder="https://..."
            className={inputClass}
          />
        )}
      </CollapsibleSection>

      {/* Translation — default closed */}
      {!isSource && (
        <CollapsibleSection title="Translation" defaultOpen={false}>
          <button
            onClick={requestRetranslate}
            disabled={retranslating}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {retranslating && (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            )}
            Re-translate
          </button>
        </CollapsibleSection>
      )}

      {/* Padding — default closed */}
      <CollapsibleSection title="Padding" defaultOpen={false}>
        {/* Desktop / Mobile toggle */}
        <div className="flex items-center bg-gray-100 rounded-md border border-gray-200 p-0.5 w-fit">
          <button
            onClick={() => setViewMode("desktop")}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors ${
              viewMode === "desktop"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-400 hover:text-gray-700"
            }`}
          >
            <Monitor className="w-3 h-3" />
          </button>
          <button
            onClick={() => setViewMode("mobile")}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors ${
              viewMode === "mobile"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-400 hover:text-gray-700"
            }`}
          >
            <Smartphone className="w-3 h-3" />
          </button>
        </div>

        {/* H / V inputs */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1">
            <MoveHorizontal className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input
              type="number"
              min="0"
              value={viewMode === "desktop" ? padDH : padMH}
              onChange={(e) => handlePaddingChange("h", e.target.value)}
              placeholder="--"
              className={numInputClass}
            />
          </div>
          <div className="flex items-center gap-1.5 flex-1">
            <MoveVertical className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input
              type="number"
              min="0"
              value={viewMode === "desktop" ? padDV : padMV}
              onChange={(e) => handlePaddingChange("v", e.target.value)}
              placeholder="--"
              className={numInputClass}
            />
          </div>
        </div>

        {/* Exclude toggle */}
        <button
          onClick={() => setExcludeMode(!excludeMode)}
          className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md border transition-colors ${
            excludeMode
              ? "bg-amber-50 border-amber-300 text-amber-700"
              : "bg-white border-gray-200 text-gray-400 hover:text-gray-700"
          }`}
        >
          <MousePointerClick className="w-3 h-3" />
          Exclude{excludeCount > 0 ? ` (${excludeCount})` : ""}
        </button>
      </CollapsibleSection>
    </div>
  );
}
