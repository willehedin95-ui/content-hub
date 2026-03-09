"use client";

import { Monitor, Smartphone, MoveHorizontal, MoveVertical, MousePointerClick } from "lucide-react";

interface Props {
  viewMode: "desktop" | "mobile";
  padDH: string;
  padDV: string;
  padMH: string;
  padMV: string;
  excludeMode: boolean;
  excludeCount: number;
  onViewModeChange: (mode: "desktop" | "mobile") => void;
  onPaddingChange: (axis: "h" | "v", value: string) => void;
  onToggleExclude: () => void;
}

const numInputClass =
  "w-full bg-white border border-gray-300 text-gray-900 rounded px-1.5 py-1 text-xs text-center focus:outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

export default function PaddingControls({
  viewMode,
  padDH,
  padDV,
  padMH,
  padMV,
  excludeMode,
  excludeCount,
  onViewModeChange,
  onPaddingChange,
  onToggleExclude,
}: Props) {
  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Padding
        </p>
        <div className="flex items-center bg-gray-100 rounded-md border border-gray-200 p-0.5">
          <button
            onClick={() => onViewModeChange("desktop")}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors ${
              viewMode === "desktop"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-400 hover:text-gray-700"
            }`}
          >
            <Monitor className="w-3 h-3" />
          </button>
          <button
            onClick={() => onViewModeChange("mobile")}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors ${
              viewMode === "mobile"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-400 hover:text-gray-700"
            }`}
          >
            <Smartphone className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1">
          <MoveHorizontal className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <input
            type="number"
            min="0"
            value={viewMode === "desktop" ? padDH : padMH}
            onChange={(e) => onPaddingChange("h", e.target.value)}
            placeholder="—"
            className={numInputClass}
          />
        </div>
        <div className="flex items-center gap-1.5 flex-1">
          <MoveVertical className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <input
            type="number"
            min="0"
            value={viewMode === "desktop" ? padDV : padMV}
            onChange={(e) => onPaddingChange("v", e.target.value)}
            placeholder="—"
            className={numInputClass}
          />
        </div>
      </div>
      <button
        onClick={onToggleExclude}
        className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md border transition-colors ${
          excludeMode
            ? "bg-amber-50 border-amber-300 text-amber-700"
            : "bg-white border-gray-200 text-gray-400 hover:text-gray-700"
        }`}
      >
        <MousePointerClick className="w-3 h-3" />
        Exclude{excludeCount > 0 ? ` (${excludeCount})` : ""}
      </button>
    </div>
  );
}
