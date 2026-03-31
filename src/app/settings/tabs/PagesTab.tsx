"use client";

import { useState, useEffect, useMemo } from "react";
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
  angle?: string | null;
}

type PrimaryLandingPages = Record<string, string>;

export default function PagesTab({ settings, setSettings, saved, handleSave }: SettingsProps) {
  const [pages, setPages] = useState<PageOption[]>([]);

  useEffect(() => {
    fetch("/api/pages?limit=200")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        if (Array.isArray(data)) setPages(data);
        else if (data?.pages) setPages(data.pages);
      })
      .catch(() => {});
  }, []);

  const primaryPages = (settings.primary_landing_pages ?? {}) as PrimaryLandingPages;

  // Find unique angles from pages that have an angle set
  const angles = useMemo(() => {
    const set = new Set<string>();
    for (const p of pages) {
      if (p.angle) set.add(p.angle);
    }
    return [...set].sort();
  }, [pages]);

  function updatePrimaryPage(key: string, pageId: string) {
    setSettings((s) => {
      const current = (s.primary_landing_pages ?? {}) as PrimaryLandingPages;
      const next = { ...current };
      if (pageId) {
        next[key] = pageId;
      } else {
        delete next[key];
      }
      return { ...s, primary_landing_pages: next };
    });
  }

  const angleLabels: Record<string, string> = {
    snoring: "Snoring",
    neck_pain: "Neck Pain",
  };

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

      <SectionHeader>Primary Landing Page</SectionHeader>
      <SettingsCard>
        <Row
          label="Default page"
          description="All concepts use this page unless a specific angle page is set below."
          action={
            <select
              value={primaryPages._default || ""}
              onChange={(e) => updatePrimaryPage("_default", e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white min-w-[200px]"
            >
              <option value="">Not set (auto-select)</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          }
        />
        {angles.length > 0 && (
          <>
            <div className="border-t border-gray-100 my-2" />
            <p className="text-xs text-gray-500 px-1 mb-2">
              Override the default for specific ad angles. Concepts with matching keywords in the ad copy will use these pages instead.
            </p>
            {angles.map((angle) => (
              <Row
                key={angle}
                label={angleLabels[angle] || angle}
                description={`Used when ad copy matches "${angle}" keywords`}
                action={
                  <select
                    value={primaryPages[angle] || ""}
                    onChange={(e) => updatePrimaryPage(angle, e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white min-w-[200px]"
                  >
                    <option value="">Use default</option>
                    {pages
                      .filter((p) => p.angle === angle || !p.angle)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                }
              />
            ))}
          </>
        )}
      </SettingsCard>

      <SaveButton saved={saved} onSave={handleSave} />
    </>
  );
}
