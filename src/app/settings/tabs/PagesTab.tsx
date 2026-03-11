"use client";

import {
  SettingsCard,
  Row,
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
      </SettingsCard>
      <SaveButton saved={saved} onSave={handleSave} />
    </>
  );
}
