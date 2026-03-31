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

function PageSelect({
  value,
  onChange,
  pages,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  pages: PageOption[];
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white hover:border-gray-300 transition-colors"
    >
      <option value="">{placeholder}</option>
      {pages.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

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
    neutral: "Neutral",
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
        <div className="space-y-4 py-1">
          {/* Default page */}
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">Default page</label>
            <p className="text-xs text-gray-400 mb-2">
              All concepts use this page unless a specific angle page is set below.
            </p>
            <PageSelect
              value={primaryPages._default || ""}
              onChange={(v) => updatePrimaryPage("_default", v)}
              pages={pages}
              placeholder="Not set (auto-select)"
            />
          </div>

          {/* Per-angle overrides */}
          {angles.length > 0 && (
            <>
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs text-gray-500 mb-3">
                  Override the default for specific ad angles. Concepts with matching keywords in the ad copy will use these pages instead.
                </p>
                <div className="space-y-3">
                  {angles.map((angle) => (
                    <div key={angle}>
                      <label className="block text-sm font-medium text-gray-800 mb-1">
                        {angleLabels[angle] || angle}
                      </label>
                      <PageSelect
                        value={primaryPages[angle] || ""}
                        onChange={(v) => updatePrimaryPage(angle, v)}
                        pages={pages.filter((p) => p.angle === angle || !p.angle)}
                        placeholder="Use default"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </SettingsCard>

      <SaveButton saved={saved} onSave={handleSave} />
    </>
  );
}
