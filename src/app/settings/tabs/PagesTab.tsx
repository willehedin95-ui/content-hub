"use client";

import { useState, useEffect } from "react";
import {
  SettingsCard,
  Row,
  SectionHeader,
  SaveButton,
  ToggleSwitch,
} from "../components";
import type { SettingsProps } from "../components";

interface PageOption {
  id: string;
  name: string;
  slug: string;
  product: string;
}

export default function PagesTab({ settings, setSettings, saved, handleSave }: SettingsProps) {
  const [pages, setPages] = useState<PageOption[]>([]);

  useEffect(() => {
    fetch("/api/pages?fields=id,name,slug,product")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        if (Array.isArray(data)) setPages(data);
        else if (data?.pages) setPages(data.pages);
      })
      .catch(() => {});
  }, []);

  const selectedPage = pages.find((p) => p.id === settings.default_page_b_id);

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

      <SectionHeader>A/B Testing</SectionHeader>
      <SettingsCard>
        <Row
          label="Default Page B"
          description="Automatically A/B test every concept push against this page. Leave empty to disable."
          action={
            <select
              value={settings.default_page_b_id || ""}
              onChange={(e) => setSettings((s) => ({ ...s, default_page_b_id: e.target.value }))}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white min-w-[200px]"
            >
              <option value="">None</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          }
        />
        {selectedPage && (
          <p className="text-xs text-gray-400 mt-1 px-1">
            Every new concept pushed via &quot;Finish &amp; Queue&quot; will auto-test against <strong>{selectedPage.name}</strong>
          </p>
        )}
      </SettingsCard>

      <SaveButton saved={saved} onSave={handleSave} />
    </>
  );
}
