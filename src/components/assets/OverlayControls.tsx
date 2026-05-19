"use client";

import { useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  OVERLAY_PRESETS,
  overlaySettingsMatch,
  type LabelPosition,
  type OverlayPreset,
  type OverlaySettings,
} from "@/lib/post-production";

interface Props {
  overlay: OverlaySettings;
  onChange: (next: OverlaySettings) => void;
}

const POSITIONS: { value: LabelPosition; label: string }[] = [
  { value: "top-left", label: "↖" },
  { value: "top-right", label: "↗" },
  { value: "bottom-left", label: "↙" },
  { value: "bottom-right", label: "↘" },
];

export default function OverlayControls({ overlay, onChange }: Props) {
  const update = useCallback(
    (patch: Partial<OverlaySettings>) => onChange({ ...overlay, ...patch }),
    [overlay, onChange],
  );

  const applyPreset = useCallback(
    (p: OverlayPreset) => onChange(p.settings),
    [onChange],
  );

  return (
    <div className="space-y-3">
      {/* Preset row */}
      {OVERLAY_PRESETS.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 font-medium">
            Overlay presets
          </p>
          <div className="flex flex-wrap gap-2">
            {OVERLAY_PRESETS.map((p) => {
              const isActive = overlaySettingsMatch(overlay, p.settings);
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyPreset(p)}
                  title={p.description}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive
                      ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Day labels block */}
      <div className="rounded-lg border border-gray-200 p-3">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-xs font-medium text-gray-700">Day labels (dag 0 / dag X)</span>
          <input
            type="checkbox"
            checked={overlay.dayLabelEnabled}
            onChange={(e) => update({ dayLabelEnabled: e.target.checked })}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
        </label>

        {overlay.dayLabelEnabled && (
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">BEFORE text</label>
                <input
                  type="text"
                  value={overlay.beforeText}
                  onChange={(e) => update({ beforeText: e.target.value })}
                  className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">AFTER text</label>
                <input
                  type="text"
                  value={overlay.afterText}
                  onChange={(e) => update({ afterText: e.target.value })}
                  className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Background color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={overlay.labelBgColor}
                    onChange={(e) => update({ labelBgColor: e.target.value })}
                    className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={overlay.labelBgColor}
                    onChange={(e) => update({ labelBgColor: e.target.value })}
                    className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Text color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={overlay.labelTextColor}
                    onChange={(e) => update({ labelTextColor: e.target.value })}
                    className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={overlay.labelTextColor}
                    onChange={(e) => update({ labelTextColor: e.target.value })}
                    className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Position</label>
                <div className="grid grid-cols-4 gap-1">
                  {POSITIONS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => update({ labelPosition: p.value })}
                      className={cn(
                        "h-7 rounded text-sm border",
                        overlay.labelPosition === p.value
                          ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                          : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50",
                      )}
                      title={p.value}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">
                  Size <span className="text-gray-400 font-mono ml-1">({overlay.labelSize}%)</span>
                </label>
                <input
                  type="range"
                  min={2}
                  max={10}
                  step={0.5}
                  value={overlay.labelSize}
                  onChange={(e) => update({ labelSize: Number(e.target.value) })}
                  className="w-full accent-indigo-600 mt-1"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Arrow block */}
      <div className="rounded-lg border border-gray-200 p-3">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-xs font-medium text-gray-700">Arrow between halves</span>
          <input
            type="checkbox"
            checked={overlay.arrowEnabled}
            onChange={(e) => update({ arrowEnabled: e.target.checked })}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
        </label>

        {overlay.arrowEnabled && (
          <div className="mt-3">
            <label className="block text-[10px] text-gray-500 mb-1">Arrow color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={overlay.arrowColor}
                onChange={(e) => update({ arrowColor: e.target.value })}
                className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
              />
              <input
                type="text"
                value={overlay.arrowColor}
                onChange={(e) => update({ arrowColor: e.target.value })}
                className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* Divider block */}
      <div className="rounded-lg border border-gray-200 p-3">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-xs font-medium text-gray-700">Vertical divider line</span>
          <input
            type="checkbox"
            checked={overlay.dividerEnabled}
            onChange={(e) => update({ dividerEnabled: e.target.checked })}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
        </label>

        {overlay.dividerEnabled && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Divider color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={overlay.dividerColor}
                  onChange={(e) => update({ dividerColor: e.target.value })}
                  className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
                />
                <input
                  type="text"
                  value={overlay.dividerColor}
                  onChange={(e) => update({ dividerColor: e.target.value })}
                  className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">
                Width <span className="text-gray-400 font-mono ml-1">({overlay.dividerWidth}px)</span>
              </label>
              <input
                type="range"
                min={1}
                max={12}
                step={1}
                value={overlay.dividerWidth}
                onChange={(e) => update({ dividerWidth: Number(e.target.value) })}
                className="w-full accent-indigo-600 mt-2"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
