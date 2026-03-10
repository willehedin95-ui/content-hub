"use client";

import {
  ArrowLeft,
  Undo2,
  Redo2,
  Save,
  Upload,
  Loader2,
  Check,
  Monitor,
  Smartphone,
} from "lucide-react";
import { useBuilder } from "./BuilderContext";

const VIEWPORT_PRESETS = [
  { label: "Desktop", device: "desktop" as const, width: null, height: null, icon: Monitor },
  { label: "Mobile", device: "iphone-13" as const, width: 390, height: 844, icon: Smartphone },
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
    saved,
    saveError,
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
        {/* Viewport toggle */}
        <div className="flex items-center bg-gray-100 rounded-md p-0.5">
          {VIEWPORT_PRESETS.map((preset) => {
            const isActive = viewportConfig.device === preset.device;
            return (
              <button
                key={preset.device}
                onClick={() => setViewportConfig(preset)}
                className={`p-1.5 rounded transition-colors ${
                  isActive
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                title={preset.label}
              >
                <preset.icon className={`${preset.device === "desktop" ? "w-5 h-5" : "w-4 h-4"}`} />
              </button>
            );
          })}
        </div>

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
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
            saved
              ? "bg-green-50 text-green-700 border border-green-300"
              : saveError
                ? "bg-red-50 text-red-700 border border-red-300"
                : "text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
          }`}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <Check className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? "Saving..." : saved ? "Saved!" : saveError ? "Error" : "Save"}
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
