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
  Link2,
  ExternalLink,
  X,
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
    switchToSavedUrl,
    pageLinkStats,
    // Custom code
    customHeadCode,
    setCustomHeadCode,
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
    // Blog
    isBlogPage,
    blogCategory,
    setBlogCategory,
    blogFeaturedImageUrl,
    setBlogFeaturedImageUrl,
  } = useBuilder();

  const [showLinkDetails, setShowLinkDetails] = useState(false);

  const totalLinks = pageLinkStats.reduce((s, l) => s + l.count, 0);
  const matchingEntry = pageLinkStats.find((s) => s.url === linkUrl);
  const matchingCount = matchingEntry?.count ?? 0;
  const otherLinks = pageLinkStats.filter((s) => s.url !== linkUrl);
  const otherCount = totalLinks - matchingCount;

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
            maxLength={70}
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
            maxLength={200}
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

      {/* Blog Section — only shown for seo_blog pages */}
      {isBlogPage && (
        <CollapsibleSection title="Blog" defaultOpen>
          <div>
            <label className="text-[11px] font-medium text-gray-600 mb-1 block">
              Category
            </label>
            <input
              type="text"
              value={blogCategory}
              onChange={(e) => setBlogCategory(e.target.value)}
              placeholder="e.g. Bäst i test"
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-gray-600 mb-1 block">
              Featured image URL
            </label>
            <input
              type="text"
              value={blogFeaturedImageUrl}
              onChange={(e) => setBlogFeaturedImageUrl(e.target.value)}
              placeholder="Auto-detected from content if empty"
              className={inputClass}
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Used for homepage card and og:image. Leave empty to auto-detect from first image.
            </p>
          </div>
        </CollapsibleSection>
      )}

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
                  onClick={switchToSavedUrl}
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

        {/* Link stats summary */}
        {totalLinks > 0 && (
          <button
            onClick={() => setShowLinkDetails(true)}
            className="flex items-center gap-1.5 w-full text-left mt-1"
          >
            <Link2 className="w-3 h-3 text-gray-400 shrink-0" />
            <span className="text-[11px] text-gray-500">
              Replaces{" "}
              <span className={matchingCount > 0 ? "font-semibold text-indigo-600" : "font-semibold text-gray-400"}>
                {matchingCount}
              </span>
              {" "}of {totalLinks} links
            </span>
            {otherCount > 0 && (
              <span className="text-[10px] text-gray-400 ml-auto">
                {otherCount} unchanged
              </span>
            )}
          </button>
        )}
      </CollapsibleSection>

      {/* Link details modal */}
      {showLinkDetails && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowLinkDetails(false)}
          />
          <div className="relative bg-white rounded-xl shadow-2xl w-[480px] max-h-[70vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Links on this page
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {totalLinks} total links - {pageLinkStats.length} unique URLs
                </p>
              </div>
              <button
                onClick={() => setShowLinkDetails(false)}
                className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto px-5 py-3 space-y-4">
              {/* Matching links */}
              {matchingCount > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-500" />
                    <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">
                      Will be replaced ({matchingCount})
                    </p>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                    <div className="flex items-start gap-2">
                      <ExternalLink className="w-3 h-3 text-indigo-500 mt-0.5 shrink-0" />
                      <p className="text-[11px] text-indigo-700 break-all leading-relaxed">
                        {linkUrl}
                      </p>
                      <span className="text-[10px] font-medium text-indigo-500 bg-indigo-100 px-1.5 py-0.5 rounded-full shrink-0">
                        {matchingCount}x
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Non-matching links */}
              {otherLinks.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-2 h-2 rounded-full bg-gray-300" />
                    <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">
                      Not affected ({otherCount})
                    </p>
                  </div>
                  <div className="space-y-1">
                    {otherLinks.map((entry) => (
                      <div
                        key={entry.url}
                        className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2"
                      >
                        <div className="flex items-start gap-2">
                          <ExternalLink className="w-3 h-3 text-gray-400 mt-0.5 shrink-0" />
                          <p className="text-[11px] text-gray-600 break-all leading-relaxed">
                            {entry.url}
                          </p>
                          <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0">
                            {entry.count}x
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No matching links warning */}
              {matchingCount === 0 && totalLinks > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    The current destination URL doesn&apos;t match any links on this page.
                    Changing it won&apos;t affect existing links.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-100">
              <p className="text-[10px] text-gray-400 leading-relaxed">
                Only links matching the current destination URL are replaced when you change it.
                All other links remain untouched.
              </p>
            </div>
          </div>
        </div>
      )}

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

      {/* Custom Code — default closed */}
      <CollapsibleSection title="Custom Code" defaultOpen={false}>
        <div>
          <textarea
            value={customHeadCode}
            onChange={(e) => setCustomHeadCode(e.target.value)}
            placeholder={'<script>\n  // Your code here\n</script>'}
            rows={6}
            className={`${inputClass} resize-y font-mono text-[11px] leading-relaxed`}
          />
          <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
            Injected before &lt;/body&gt; on published pages. Use for countdown timers, custom styles, or tracking scripts. Not visible in builder preview.
          </p>
        </div>
      </CollapsibleSection>

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
