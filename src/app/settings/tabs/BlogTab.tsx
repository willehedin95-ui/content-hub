"use client";

import {
  SettingsCard,
  Row,
  SectionHeader,
  SaveButton,
} from "../components";
import type { SettingsProps } from "../components";
import type { BlogConfig, BlogLanguageConfig } from "@/lib/blog-shell";

const LANGUAGES = [
  { code: "sv", label: "Swedish", flag: "🇸🇪" },
  { code: "da", label: "Danish", flag: "🇩🇰" },
  { code: "no", label: "Norwegian", flag: "🇳🇴" },
] as const;

function getDefaultLangConfig(): BlogLanguageConfig {
  return {
    blog_name: "",
    blog_tagline: "",
    about_text: "",
    affiliate_disclosure: "",
    nav_home_label: "Home",
    copyright_text: "",
  };
}

export default function BlogTab({ settings, setSettings, saved, handleSave }: SettingsProps) {
  const blogConfig: BlogConfig = settings.blog_config ?? {
    primary_color: "#1a365d",
    languages: {},
  };

  function updateConfig(patch: Partial<BlogConfig>) {
    setSettings((s) => ({
      ...s,
      blog_config: { ...blogConfig, ...patch },
    }));
  }

  function updateLang(code: string, patch: Partial<BlogLanguageConfig>) {
    const current = blogConfig.languages[code] ?? getDefaultLangConfig();
    updateConfig({
      languages: {
        ...blogConfig.languages,
        [code]: { ...current, ...patch },
      },
    });
  }

  return (
    <>
      <h2 className="text-lg font-semibold text-gray-900 mb-5">Blog Settings</h2>

      <SettingsCard>
        <Row
          label="Primary color"
          description="Accent color for header, links, and buttons on the blog"
          action={
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={blogConfig.primary_color || "#1a365d"}
                onChange={(e) => updateConfig({ primary_color: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer border border-gray-200"
              />
              <input
                type="text"
                value={blogConfig.primary_color || "#1a365d"}
                onChange={(e) => updateConfig({ primary_color: e.target.value })}
                className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 w-24 font-mono"
              />
            </div>
          }
        />
        <Row
          label="Logo URL"
          description="Optional logo image URL shown in the blog header"
          action={
            <input
              type="text"
              value={blogConfig.logo_url || ""}
              onChange={(e) => updateConfig({ logo_url: e.target.value || undefined })}
              placeholder="https://..."
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 w-64"
            />
          }
        />
      </SettingsCard>

      {LANGUAGES.map((lang) => {
        const cfg = blogConfig.languages[lang.code] ?? getDefaultLangConfig();
        return (
          <div key={lang.code}>
            <SectionHeader>{lang.flag} {lang.label}</SectionHeader>
            <SettingsCard>
              <Row
                label="Blog name"
                description="Shown in header and footer"
                action={
                  <input
                    type="text"
                    value={cfg.blog_name}
                    onChange={(e) => updateLang(lang.code, { blog_name: e.target.value })}
                    placeholder="e.g. Hälsobladet"
                    className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 w-52"
                  />
                }
              />
              <Row
                label="Tagline"
                description="Subtitle below the blog name"
                action={
                  <input
                    type="text"
                    value={cfg.blog_tagline}
                    onChange={(e) => updateLang(lang.code, { blog_tagline: e.target.value })}
                    placeholder="e.g. Oberoende hälsorådgivning"
                    className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 w-64"
                  />
                }
              />
              <div className="py-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">About text</label>
                <p className="text-xs text-gray-400 mb-1.5">Shown in the blog footer</p>
                <textarea
                  value={cfg.about_text}
                  onChange={(e) => updateLang(lang.code, { about_text: e.target.value })}
                  rows={3}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none"
                  placeholder="Describe the blog..."
                />
              </div>
              <div className="py-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Affiliate disclosure</label>
                <p className="text-xs text-gray-400 mb-1.5">Legal notice shown on every blog article</p>
                <textarea
                  value={cfg.affiliate_disclosure}
                  onChange={(e) => updateLang(lang.code, { affiliate_disclosure: e.target.value })}
                  rows={2}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none"
                  placeholder="This article contains affiliate links..."
                />
              </div>
            </SettingsCard>
          </div>
        );
      })}

      <SectionHeader>Autopilot</SectionHeader>
      <SettingsCard>
        <Row
          label="Blog autopilot"
          description="Automatically write and publish SEO articles daily using the content plan and keyword research"
          action={
            <button
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  blog_autopilot_enabled: !s.blog_autopilot_enabled,
                }))
              }
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                settings.blog_autopilot_enabled ? "bg-green-500" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                  settings.blog_autopilot_enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          }
        />
        <Row
          label="Articles per day"
          description="Maximum articles the autopilot can publish per day (default: 1)"
          action={
            <input
              type="number"
              min={1}
              max={3}
              value={settings.blog_articles_per_day ?? 1}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  blog_articles_per_day: Math.max(1, Math.min(3, parseInt(e.target.value) || 1)),
                }))
              }
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 w-16 text-center"
            />
          }
        />
      </SettingsCard>

      <SaveButton saved={saved} onSave={handleSave} />
    </>
  );
}
