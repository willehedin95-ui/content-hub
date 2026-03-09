"use client";

import {
  ArrowLeft,
  Undo2,
  Redo2,
  Save,
  Upload,
  Loader2,
  ChevronDown,
  Check,
} from "lucide-react";
import { Menu } from "@headlessui/react";
import { useBuilder } from "./BuilderContext";

const VIEWPORT_PRESETS = [
  { label: "Desktop", device: "desktop" as const, width: null, height: null },
  { label: "iPhone 13", device: "iphone-13" as const, width: 390, height: 844 },
  { label: "iPad", device: "ipad" as const, width: 768, height: 1024 },
  { label: "Custom", device: "custom" as const, width: 375, height: 812 },
];

export default function BuilderTopBar() {
  const {
    pageId,
    pageName,
    language,
    variantLabel,
    isSource,
    router,
    viewportConfig,
    setViewportConfig,
    undoCount,
    redoCount,
    handleUndo,
    handleRedo,
    qualityScore,
    showQualityDetails,
    setShowQualityDetails,
    saving,
    publishing,
    retranslating,
    handleSave,
    setShowPublishModal,
  } = useBuilder();

  const qualityColor =
    qualityScore !== null
      ? qualityScore >= 85
        ? "bg-green-100 text-green-700"
        : qualityScore >= 60
          ? "bg-yellow-100 text-yellow-700"
          : "bg-red-100 text-red-700"
      : "";

  return (
    <div className="h-12 px-4 border-b border-gray-200 bg-white flex items-center shrink-0">
      {/* Left section */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={() => router.push(`/pages/${pageId}`)}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          title="Back to page"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
          {pageName}
        </span>

        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-indigo-100 text-indigo-700">
          {language.label}
        </span>

        {variantLabel && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700">
            {variantLabel}
          </span>
        )}
      </div>

      {/* Center section */}
      <div className="flex-1 flex items-center justify-center gap-1">
        <button
          onClick={handleUndo}
          disabled={undoCount === 0}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={handleRedo}
          disabled={redoCount === 0}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* Viewport selector */}
        <Menu as="div" className="relative">
          <Menu.Button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
            {VIEWPORT_PRESETS.find((p) => p.device === viewportConfig.device)?.label || "Desktop"}
            <ChevronDown className="w-3.5 h-3.5" />
          </Menu.Button>

          <Menu.Items className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg py-1 z-10 focus:outline-none">
            {VIEWPORT_PRESETS.map((preset) => (
              <Menu.Item key={preset.device}>
                {({ active }) => (
                  <button
                    onClick={() => setViewportConfig(preset)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm ${
                      active ? "bg-gray-100" : ""
                    }`}
                  >
                    <span className={viewportConfig.device === preset.device ? "font-medium text-gray-900" : "text-gray-700"}>
                      {preset.label}
                    </span>
                    {viewportConfig.device === preset.device && (
                      <Check className="w-4 h-4 text-indigo-600" />
                    )}
                  </button>
                )}
              </Menu.Item>
            ))}
          </Menu.Items>
        </Menu>

        {/* Quality badge */}
        {qualityScore !== null && (
          <button
            onClick={() => setShowQualityDetails(!showQualityDetails)}
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${qualityColor} transition-colors`}
            title="Quality score"
          >
            {qualityScore}
          </button>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving || publishing || retranslating}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save
        </button>

        {/* Publish button — only for translations, not source */}
        {!isSource && (
          <button
            onClick={() => setShowPublishModal(true)}
            disabled={saving || publishing || retranslating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Upload className="w-4 h-4" />
            Publish
          </button>
        )}
      </div>
    </div>
  );
}
