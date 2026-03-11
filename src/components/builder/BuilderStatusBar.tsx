"use client";

import { ZoomIn, ZoomOut, Keyboard } from "lucide-react";
import { useBuilder } from "./BuilderContext";
import { gradeConfig } from "@/lib/quality-grades";

export default function BuilderStatusBar() {
  const {
    qualityGrade,
    autoSaveStatus,
    isDirty,
    zoom,
    setZoom,
    viewMode,
    setShowShortcutsModal,
  } = useBuilder();

  const gc = qualityGrade ? gradeConfig(qualityGrade) : null;

  const autosaveText =
    autoSaveStatus === "saving"
      ? "Saving..."
      : autoSaveStatus === "saved"
        ? "Saved"
        : isDirty
          ? "Unsaved changes"
          : "";

  function handleZoomOut() {
    setZoom(Math.max(50, zoom - 10));
  }

  function handleZoomIn() {
    setZoom(Math.min(200, zoom + 10));
  }

  return (
    <div className="h-8 px-4 border-t border-gray-200 bg-white flex items-center gap-4 text-xs text-gray-500 shrink-0">
      {/* Quality grade badge */}
      {gc && (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${gc.bg} ${gc.color}`}
        >
          {gc.label}
        </span>
      )}

      {/* Autosave status */}
      {autosaveText && (
        <span
          className={
            autoSaveStatus === "saving"
              ? "text-yellow-600"
              : autoSaveStatus === "saved"
                ? "text-green-600"
                : "text-orange-500"
          }
        >
          {autosaveText}
        </span>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Zoom controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleZoomOut}
          disabled={zoom <= 50}
          className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="w-10 text-center tabular-nums">{zoom}%</span>
        <button
          onClick={handleZoomIn}
          disabled={zoom >= 200}
          className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Keyboard shortcuts button */}
      <button
        onClick={() => setShowShortcutsModal(true)}
        className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        title="Keyboard shortcuts (?)"
      >
        <Keyboard className="w-3.5 h-3.5" />
      </button>

      {/* View mode indicator */}
      <span className="text-gray-400">
        {viewMode === "desktop" ? "Desktop" : "Mobile"}
      </span>
    </div>
  );
}
