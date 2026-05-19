"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SETTINGS,
  loadCustomPresets,
  PRESETS,
  saveCustomPresets,
  settingsMatch,
  type Preset,
  type Settings,
} from "@/lib/post-production";

interface Props {
  settings: Settings;
  /** Receives the new settings to apply. Called with DEFAULT_SETTINGS when
   *  the user clicks an already-active preset (toggle-off). */
  onApply: (next: Settings) => void;
}

/** Renders the row of degradation presets (built-in + user-saved) plus a
 *  "+ Save current as preset" button. Custom presets persist in
 *  localStorage and can be deleted via trash icon. */
export default function DegradationPresetPicker({ settings, onApply }: Props) {
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [draftName, setDraftName] = useState("");

  useEffect(() => {
    setCustomPresets(loadCustomPresets());
  }, []);

  const handleSave = useCallback(() => {
    const name = draftName.trim();
    if (!name) return;
    const key = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const next = [
      ...customPresets,
      {
        key,
        label: name,
        description: "Custom",
        settings: { ...settings },
      },
    ];
    setCustomPresets(next);
    saveCustomPresets(next);
    setDraftName("");
    setShowSaveForm(false);
  }, [draftName, customPresets, settings]);

  const handleDelete = useCallback(
    (key: string) => {
      const next = customPresets.filter((p) => p.key !== key);
      setCustomPresets(next);
      saveCustomPresets(next);
    },
    [customPresets],
  );

  const all = [...PRESETS, ...customPresets];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {all.map((p) => {
          const isActive = settingsMatch(settings, p.settings);
          const isCustom = p.key.startsWith("custom-");
          return (
            <div key={p.key} className="relative">
              <button
                type="button"
                onClick={() =>
                  isActive
                    ? onApply(DEFAULT_SETTINGS)
                    : onApply(p.settings)
                }
                title={
                  isActive
                    ? `${p.label} (active - click to turn off)`
                    : p.description
                }
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
                  onClick={() => handleDelete(p.key)}
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
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") {
                setShowSaveForm(false);
                setDraftName("");
              }
            }}
            placeholder="Preset name (e.g. 'Heavy compression')"
            className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!draftName.trim()}
            className="px-3 py-1 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSaveForm(false);
              setDraftName("");
            }}
            className="px-3 py-1 rounded-md border border-gray-200 bg-white text-gray-700 text-xs hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
