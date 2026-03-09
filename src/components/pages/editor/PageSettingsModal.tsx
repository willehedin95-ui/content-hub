"use client";

import { X, Link2 } from "lucide-react";
import { PRODUCTS, MarketProductUrl } from "@/types";
import Dropdown from "@/components/ui/dropdown";

interface Props {
  open: boolean;
  onClose: () => void;
  linkUrl: string;
  onLinkUrlChange: (url: string) => void;
  slug: string;
  onSlugChange: (slug: string) => void;
  seoTitle: string;
  onSeoTitleChange: (title: string) => void;
  seoDesc: string;
  onSeoDescChange: (desc: string) => void;
  language: { domain: string };
  filteredUrls: MarketProductUrl[];
  urlMode: "saved" | "custom";
  onUrlModeChange: (mode: "saved" | "custom") => void;
  markDirty: () => void;
}

export default function PageSettingsModal({
  open,
  onClose,
  linkUrl,
  onLinkUrlChange,
  slug,
  onSlugChange,
  seoTitle,
  onSeoTitleChange,
  seoDesc,
  onSeoDescChange,
  language,
  filteredUrls,
  urlMode,
  onUrlModeChange,
  markDirty,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Page Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Destination URL */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Destination URL
            </p>
            {filteredUrls.length > 0 ? (
              <>
                <Dropdown
                  value={urlMode === "saved" ? linkUrl : "__custom__"}
                  onChange={(v) => {
                    if (v === "__custom__") {
                      onUrlModeChange("custom");
                    } else {
                      onUrlModeChange("saved");
                      onLinkUrlChange(v);
                    }
                  }}
                  options={[
                    ...filteredUrls.map((u) => ({
                      value: u.url,
                      label: `${PRODUCTS.find((p) => p.value === u.product)?.label ?? u.product} — ${u.url}`,
                    })),
                    { value: "__custom__", label: "Custom URL..." },
                  ]}
                  placeholder="Select product URL"
                />
                {urlMode === "custom" && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Link2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <input
                      type="url"
                      value={linkUrl}
                      onChange={(e) => onLinkUrlChange(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-white border border-gray-300 text-gray-900 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500 truncate"
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => onLinkUrlChange(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-white border border-gray-300 text-gray-900 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500 truncate"
                />
              </div>
            )}
            <p className="text-xs text-gray-400">
              Applied to all links on the page.
            </p>
          </div>

          <div className="border-t border-gray-200" />

          {/* Slug */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Slug
            </p>
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                onSlugChange(e.target.value);
                markDirty();
              }}
              placeholder="page-slug"
              className="w-full bg-white border border-gray-300 text-gray-900 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
            />
            <p className="text-xs text-gray-400 truncate">
              {language.domain}/{slug}
            </p>
          </div>

          <div className="border-t border-gray-200" />

          {/* SEO fields */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              SEO
            </p>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400 uppercase tracking-wider">
                Page Title
              </label>
              <input
                value={seoTitle}
                onChange={(e) => {
                  onSeoTitleChange(e.target.value);
                  markDirty();
                }}
                placeholder="Page title..."
                className="w-full bg-white border border-gray-300 text-gray-900 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
              />
              <p className={`text-xs text-right ${seoTitle.length > 60 ? "text-red-500" : seoTitle.length >= 50 ? "text-yellow-500" : "text-gray-400"}`}>
                {seoTitle.length}/60
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400 uppercase tracking-wider">
                Meta Description
              </label>
              <textarea
                value={seoDesc}
                onChange={(e) => {
                  onSeoDescChange(e.target.value);
                  markDirty();
                }}
                placeholder="Meta description..."
                rows={4}
                className="w-full bg-white border border-gray-300 text-gray-900 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 resize-none"
              />
              <p className={`text-xs text-right ${seoDesc.length > 160 ? "text-red-500" : seoDesc.length >= 140 ? "text-yellow-500" : "text-gray-400"}`}>
                {seoDesc.length}/160
              </p>
            </div>
          </div>
        </div>
        <div className="flex justify-end px-5 py-4 border-t border-gray-200 shrink-0">
          <button
            onClick={onClose}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
