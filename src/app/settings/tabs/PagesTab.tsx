"use client";

import {
  SettingsCard,
  Row,
  RowDivider,
  SaveButton,
  ToggleSwitch,
} from "../components";
import type { SettingsProps } from "../components";

export default function PagesTab({ settings, setSettings, saved, handleSave }: SettingsProps) {
  return (
    <>
      <h2 className="text-lg font-semibold text-gray-900 mb-5">Landing Pages</h2>
      <SettingsCard>
        <Row
          label="Quality analysis"
          description="Run automatic quality checks on translated pages"
          action={
            <ToggleSwitch
              checked={settings.pages_quality_enabled}
              onChange={(v) => setSettings((s) => ({ ...s, pages_quality_enabled: v }))}
            />
          }
        />
        <RowDivider />
        <Row
          label="Auto-regenerate threshold"
          description="Pages scoring below this will auto-regenerate (max 3 times)"
          action={
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={settings.pages_quality_threshold}
                onChange={(e) => setSettings((s) => ({ ...s, pages_quality_threshold: Number(e.target.value) }))}
                className="w-20 accent-indigo-600"
              />
              <span className="text-sm font-medium text-gray-700 w-7 text-right tabular-nums">
                {settings.pages_quality_threshold}
              </span>
            </div>
          }
        />
      </SettingsCard>
      <SaveButton saved={saved} onSave={handleSave} />
    </>
  );
}
