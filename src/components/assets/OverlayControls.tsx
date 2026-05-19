"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LABEL_FONT_OPTIONS,
  LABEL_FONT_WEIGHTS,
  loadCustomOverlayPresets,
  OVERLAY_PRESETS,
  overlaySettingsMatch,
  saveCustomOverlayPresets,
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
  const [customPresets, setCustomPresets] = useState<OverlayPreset[]>([]);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [presetNameDraft, setPresetNameDraft] = useState("");

  // Load custom presets from localStorage on mount
  useEffect(() => {
    setCustomPresets(loadCustomOverlayPresets());
  }, []);

  const update = useCallback(
    (patch: Partial<OverlaySettings>) => onChange({ ...overlay, ...patch }),
    [overlay, onChange],
  );

  const applyPreset = useCallback(
    (p: OverlayPreset) => onChange(p.settings),
    [onChange],
  );

  const handleSavePreset = useCallback(() => {
    const name = presetNameDraft.trim();
    if (!name) return;
    const key = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newPreset: OverlayPreset = {
      key,
      label: name,
      description: "Custom",
      settings: { ...overlay },
    };
    const next = [...customPresets, newPreset];
    setCustomPresets(next);
    saveCustomOverlayPresets(next);
    setPresetNameDraft("");
    setShowSaveForm(false);
  }, [presetNameDraft, customPresets, overlay]);

  const handleDeletePreset = useCallback(
    (key: string) => {
      const next = customPresets.filter((p) => p.key !== key);
      setCustomPresets(next);
      saveCustomOverlayPresets(next);
    },
    [customPresets],
  );

  const allPresets = [...OVERLAY_PRESETS, ...customPresets];

  return (
    <div className="space-y-3">
      {/* Preset row */}
      {allPresets.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 font-medium">
            Overlay presets
          </p>
          <div className="flex flex-wrap gap-2">
            {allPresets.map((p) => {
              const isActive = overlaySettingsMatch(overlay, p.settings);
              const isCustom = p.key.startsWith("custom-");
              return (
                <div key={p.key} className="relative">
                  <button
                    type="button"
                    onClick={() => applyPreset(p)}
                    title={p.description}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                      isActive
                        ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50",
                      isCustom && "pr-7",
                    )}
                  >
                    {p.label}
                  </button>
                  {isCustom && (
                    <button
                      type="button"
                      onClick={() => handleDeletePreset(p.key)}
                      aria-label={`Delete ${p.label}`}
                      className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
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

            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Font family</label>
              <select
                value={overlay.labelFontFamily}
                onChange={(e) => update({ labelFontFamily: e.target.value })}
                className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs bg-white"
                style={{ fontFamily: overlay.labelFontFamily }}
              >
                {LABEL_FONT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Weight</label>
                <div className="grid grid-cols-5 gap-1">
                  {LABEL_FONT_WEIGHTS.map((w) => (
                    <button
                      key={w.value}
                      type="button"
                      onClick={() => update({ labelFontWeight: w.value })}
                      className={cn(
                        "h-7 rounded text-[10px] border",
                        overlay.labelFontWeight === w.value
                          ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                      )}
                      title={`${w.label} (${w.value})`}
                      style={{ fontWeight: w.value }}
                    >
                      {w.value}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Style</label>
                <button
                  type="button"
                  onClick={() => update({ labelFontItalic: !overlay.labelFontItalic })}
                  className={cn(
                    "h-7 px-3 rounded text-xs border w-full",
                    overlay.labelFontItalic
                      ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                  )}
                  style={{ fontStyle: overlay.labelFontItalic ? "italic" : "normal" }}
                >
                  Italic {overlay.labelFontItalic ? "on" : "off"}
                </button>
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

      {/* Save preset row */}
      <div className="pt-2 border-t border-gray-100">
        {!showSaveForm ? (
          <button
            type="button"
            onClick={() => setShowSaveForm(true)}
            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
          >
            + Save current settings as preset
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              autoFocus
              value={presetNameDraft}
              onChange={(e) => setPresetNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSavePreset();
                if (e.key === "Escape") {
                  setShowSaveForm(false);
                  setPresetNameDraft("");
                }
              }}
              placeholder="Preset name (e.g. 'Hydro13 yellow')"
              className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={handleSavePreset}
              disabled={!presetNameDraft.trim()}
              className="px-3 py-1 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSaveForm(false);
                setPresetNameDraft("");
              }}
              className="px-3 py-1 rounded-md border border-gray-200 bg-white text-gray-700 text-xs hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
