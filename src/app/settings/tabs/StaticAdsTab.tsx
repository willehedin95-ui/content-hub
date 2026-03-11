"use client";

import { LANGUAGES, ASPECT_RATIOS } from "@/types";
import {
  SettingsCard,
  SectionHeader,
  Row,
  RowDivider,
  SaveButton,
  ToggleSwitch,
} from "../components";
import type { SettingsProps } from "../components";

export default function StaticAdsTab({ settings, setSettings, saved, handleSave }: SettingsProps) {
  return (
    <>
      <h2 className="text-lg font-semibold text-gray-900 mb-5">Static Ads</h2>
      <SettingsCard>
        <Row
          label="Quality analysis"
          description="Run automatic quality checks on generated images"
          action={
            <ToggleSwitch
              checked={settings.static_ads_quality_enabled}
              onChange={(v) => setSettings((s) => ({ ...s, static_ads_quality_enabled: v }))}
            />
          }
        />
        <RowDivider />
        <Row
          label="Economy mode"
          description="Skip quality analysis to save costs"
          action={
            <ToggleSwitch
              checked={settings.static_ads_economy_mode}
              onChange={(v) => setSettings((s) => ({ ...s, static_ads_economy_mode: v }))}
            />
          }
        />
        <RowDivider />
        <Row
          label="Default languages"
          description="Pre-selected when creating new concepts"
          action={
            <div className="flex gap-1.5">
              {LANGUAGES.map((lang) => {
                const selected = settings.static_ads_default_languages.includes(lang.value);
                return (
                  <button
                    key={lang.value}
                    type="button"
                    onClick={() =>
                      setSettings((s) => ({
                        ...s,
                        static_ads_default_languages: selected
                          ? s.static_ads_default_languages.filter((l) => l !== lang.value)
                          : [...s.static_ads_default_languages, lang.value],
                      }))
                    }
                    className={`w-8 h-8 rounded-lg border text-sm flex items-center justify-center transition-colors ${
                      selected
                        ? "bg-indigo-50 border-indigo-300"
                        : "bg-white border-gray-200 opacity-40 hover:opacity-70"
                    }`}
                    title={lang.label}
                  >
                    <span role="img" aria-label={lang.label}>{lang.flag}</span>
                  </button>
                );
              })}
            </div>
          }
        />
        <RowDivider />
        <Row
          label="Default aspect ratios"
          description="Pre-selected when creating new concepts"
          action={
            <div className="flex gap-1.5">
              {ASPECT_RATIOS.map((ratio) => {
                const selected = settings.static_ads_default_ratios.includes(ratio.value);
                return (
                  <button
                    key={ratio.value}
                    type="button"
                    onClick={() =>
                      setSettings((s) => ({
                        ...s,
                        static_ads_default_ratios: selected
                          ? s.static_ads_default_ratios.filter((r) => r !== ratio.value)
                          : [...s.static_ads_default_ratios, ratio.value],
                      }))
                    }
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      selected
                        ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                        : "bg-white border-gray-200 text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    {ratio.label}
                  </button>
                );
              })}
            </div>
          }
        />
        <RowDivider />
        <Row
          label="Max auto-retries"
          description="Times to regenerate a low-quality image"
          action={
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={10}
                value={settings.static_ads_max_retries}
                onChange={(e) => setSettings((s) => ({ ...s, static_ads_max_retries: Number(e.target.value) }))}
                className="w-20 accent-indigo-600"
              />
              <span className="text-sm font-medium text-gray-700 w-7 text-right tabular-nums">
                {settings.static_ads_max_retries}
              </span>
            </div>
          }
        />
        <RowDivider />
        <Row
          label="Auto-export to Drive"
          description="Export translations when all images complete"
          action={
            <ToggleSwitch
              checked={settings.static_ads_auto_export}
              onChange={(v) => setSettings((s) => ({ ...s, static_ads_auto_export: v }))}
            />
          }
        />
      </SettingsCard>

      <SectionHeader>Notifications</SectionHeader>
      <SettingsCard>
        <Row
          label="Email on completion"
          description="Send email when batch jobs finish"
          action={
            <ToggleSwitch
              checked={settings.static_ads_email_enabled}
              onChange={(v) => setSettings((s) => ({ ...s, static_ads_email_enabled: v }))}
            />
          }
        />
        <RowDivider />
        <Row
          label="Email address"
          description={settings.static_ads_notification_email || "Not configured"}
          action={
            <input
              type="text"
              value={settings.static_ads_notification_email}
              onChange={(e) => setSettings((s) => ({ ...s, static_ads_notification_email: e.target.value }))}
              placeholder="email@example.com"
              className="w-44 bg-white border border-gray-200 text-gray-800 placeholder-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
            />
          }
        />
      </SettingsCard>
      <SaveButton saved={saved} onSave={handleSave} />
    </>
  );
}
