"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  CheckCircle2,
  RefreshCw,
  Loader2,
  FileText,
  Image,
  Megaphone,
  Plug,
  X,
  Globe,
} from "lucide-react";
import { Language, LANGUAGES, PRODUCTS, COUNTRY_MAP, MetaCampaignMapping, MetaPageConfig, MarketProductUrl, ASPECT_RATIOS, AspectRatio, META_OBJECTIVES } from "@/types";
import Dropdown from "@/components/ui/dropdown";

interface Settings {
  pages_quality_enabled: boolean;
  pages_quality_threshold: number;
  static_ads_quality_enabled: boolean;
  static_ads_quality_threshold: number;
  static_ads_economy_mode: boolean;
  static_ads_default_languages: Language[];
  static_ads_default_ratios: AspectRatio[];
  static_ads_max_retries: number;
  static_ads_auto_export: boolean;
  static_ads_notification_email: string;
  static_ads_email_enabled: boolean;
  meta_default_daily_budget: number;
  meta_default_objective: string;
  meta_default_schedule_time: string;
  ga4_measurement_ids: Record<string, string>;
  clarity_project_id: string;
  shopify_domains: string;
}

const TABS = [
  { id: "pages", label: "Landing Pages", icon: FileText, group: "SETTINGS" },
  { id: "static-ads", label: "Static Ads", icon: Image, group: "SETTINGS" },
  { id: "markets", label: "Markets", icon: Globe, group: "SETTINGS" },
  { id: "meta-ads", label: "Meta Ads", icon: Megaphone, group: "CONNECTIONS" },
  { id: "integrations", label: "Integrations", icon: Plug, group: "CONNECTIONS" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("pages");
  const [settings, setSettings] = useState<Settings>({
    pages_quality_enabled: true,
    pages_quality_threshold: 85,
    static_ads_quality_enabled: true,
    static_ads_quality_threshold: 80,
    static_ads_economy_mode: false,
    static_ads_default_languages: ["sv", "da", "no", "de"],
    static_ads_default_ratios: ["1:1"],
    static_ads_max_retries: 5,
    static_ads_auto_export: false,
    static_ads_notification_email: "",
    static_ads_email_enabled: false,
    meta_default_daily_budget: 50,
    meta_default_objective: "OUTCOME_TRAFFIC",
    meta_default_schedule_time: "06:00",
    ga4_measurement_ids: {},
    clarity_project_id: "",
    shopify_domains: "",
  });
  const [saved, setSaved] = useState(false);
  const savedTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // KIE AI integration state
  const [kie, setKie] = useState<{
    balance: number | null;
    loading: boolean;
    error: string | null;
  }>({ balance: null, loading: false, error: null });

  // Shopify connection state
  const [shopify, setShopify] = useState<{
    status: { shop: string } | null;
    loading: boolean;
    error: string | null;
  }>({ status: null, loading: false, error: null });

  // Meta connection state
  const [meta, setMeta] = useState<{
    status: { name: string; id: string } | null;
    loading: boolean;
    error: string | null;
  }>({ status: null, loading: false, error: null });

  // Campaign mappings state
  const [mappings, setMappings] = useState<{
    campaignMappings: MetaCampaignMapping[];
    metaCampaigns: { id: string; name: string; status: string; objective: string }[];
    loading: boolean;
    saving: string | null;
  }>({ campaignMappings: [], metaCampaigns: [], loading: true, saving: null });

  // Ad sets state
  const [adSets, setAdSets] = useState<{
    byCampaign: Record<string, { id: string; name: string; status: string }[]>;
    loading: string | null;
  }>({ byCampaign: {}, loading: null });

  // Meta pages state
  const [metaPages, setMetaPages] = useState<{
    pages: { id: string; name: string }[];
    loading: boolean;
  }>({ pages: [], loading: false });

  // Page configs state
  const [pageConfigs, setPageConfigs] = useState<{
    configs: MetaPageConfig[];
    saving: string | null;
  }>({ configs: [], saving: null });

  // Market URLs state
  const [marketUrls, setMarketUrls] = useState<{
    urls: MarketProductUrl[];
    saving: string | null;
    drafts: Record<string, string>;
  }>({ urls: [], saving: null, drafts: {} });

  const fetchKieCredits = useCallback(async () => {
    setKie(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch("/api/kie-credits");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to fetch");
      }
      const data = await res.json();
      setKie(prev => ({ ...prev, balance: data.balance, loading: false }));
    } catch (err) {
      setKie(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to fetch credits",
        loading: false,
      }));
    }
  }, []);

  useEffect(() => {
    // Load settings from DB (source of truth), fall back to localStorage cache
    fetch("/api/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((dbSettings) => {
        if (dbSettings && Object.keys(dbSettings).length > 0) {
          setSettings((s) => ({ ...s, ...dbSettings }));
          localStorage.setItem("content-hub-settings", JSON.stringify(dbSettings));
        } else {
          // Fall back to localStorage if DB is empty (first migration)
          try {
            const stored = localStorage.getItem("content-hub-settings");
            if (stored) {
              const parsed = JSON.parse(stored);
              setSettings((s) => ({ ...s, ...parsed }));
            }
          } catch {}
        }
      });

    Promise.all([
      fetch("/api/meta/campaign-mappings").then((r) => r.ok ? r.json() : []),
      fetch("/api/meta/campaigns/list").then((r) => r.ok ? r.json() : []),
      fetch("/api/meta/page-config").then((r) => r.ok ? r.json() : []),
      fetch("/api/market-urls").then((r) => r.ok ? r.json() : []),
    ]).then(([campaignMappings, metaCampaigns, configs, urls]) => {
      setMappings(prev => ({ ...prev, campaignMappings, metaCampaigns }));
      setPageConfigs(prev => ({ ...prev, configs }));
      setMarketUrls(prev => ({ ...prev, urls }));
    }).finally(() => setMappings(prev => ({ ...prev, loading: false })));

    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") router.back();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  async function handleSave() {
    // Save to DB (source of truth) and localStorage (cache)
    localStorage.setItem("content-hub-settings", JSON.stringify(settings));
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaved(true);
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    savedTimeoutRef.current = setTimeout(() => setSaved(false), 2500);
  }

  async function fetchAdSetsForCampaign(metaCampaignId: string) {
    if (adSets.byCampaign[metaCampaignId]) return;
    setAdSets(prev => ({ ...prev, loading: metaCampaignId }));
    try {
      const res = await fetch(`/api/meta/adsets?campaign_id=${metaCampaignId}`);
      if (res.ok) {
        const data = await res.json();
        setAdSets(prev => ({ ...prev, byCampaign: { ...prev.byCampaign, [metaCampaignId]: data } }));
      }
    } finally {
      setAdSets(prev => ({ ...prev, loading: null }));
    }
  }

  async function handleTemplateAdSetChange(product: string, country: string, adSetId: string) {
    const cellKey = `${product}-${country}`;
    setMappings(prev => ({ ...prev, saving: cellKey }));
    try {
      const mapping = mappings.campaignMappings.find((m) => m.product === product && m.country === country);
      if (!mapping) return;
      const allAdSetsList = Object.values(adSets.byCampaign).flat();
      const adSet = allAdSetsList.find((a) => a.id === adSetId);
      const res = await fetch("/api/meta/campaign-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product,
          country,
          meta_campaign_id: mapping.meta_campaign_id,
          meta_campaign_name: mapping.meta_campaign_name,
          template_adset_id: adSetId || null,
          template_adset_name: adSet?.name ?? null,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMappings(prev => ({
          ...prev,
          campaignMappings: [
            ...prev.campaignMappings.filter((m) => !(m.product === product && m.country === country)),
            updated,
          ],
        }));
      }
    } finally {
      setMappings(prev => ({ ...prev, saving: null }));
    }
  }

  async function handleMappingChange(product: string, country: string, metaCampaignId: string) {
    const cellKey = `${product}-${country}`;
    setMappings(prev => ({ ...prev, saving: cellKey }));
    try {
      if (!metaCampaignId) {
        const existing = mappings.campaignMappings.find((m) => m.product === product && m.country === country);
        if (existing) {
          await fetch(`/api/meta/campaign-mappings?id=${existing.id}`, { method: "DELETE" });
          setMappings(prev => ({
            ...prev,
            campaignMappings: prev.campaignMappings.filter((m) => m.id !== existing.id),
          }));
        }
      } else {
        const campaign = mappings.metaCampaigns.find((c) => c.id === metaCampaignId);
        const res = await fetch("/api/meta/campaign-mappings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product,
            country,
            meta_campaign_id: metaCampaignId,
            meta_campaign_name: campaign?.name ?? null,
          }),
        });
        if (res.ok) {
          const mapping = await res.json();
          setMappings(prev => ({
            ...prev,
            campaignMappings: [
              ...prev.campaignMappings.filter((m) => !(m.product === product && m.country === country)),
              mapping,
            ],
          }));
        }
      }
    } finally {
      setMappings(prev => ({ ...prev, saving: null }));
    }
  }

  async function testMetaConnection() {
    setMeta(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch("/api/meta/verify");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Connection failed");
      setMeta(prev => ({ ...prev, status: data, loading: false }));
    } catch (err) {
      setMeta({
        status: null,
        loading: false,
        error: err instanceof Error ? err.message : "Connection failed",
      });
    }
  }

  async function testShopifyConnection() {
    setShopify(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch("/api/shopify/verify");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Connection failed");
      setShopify(prev => ({ ...prev, status: data, loading: false }));
    } catch (err) {
      setShopify({
        status: null,
        loading: false,
        error: err instanceof Error ? err.message : "Connection failed",
      });
    }
  }

  async function fetchMetaPages() {
    if (metaPages.pages.length > 0) return;
    setMetaPages(prev => ({ ...prev, loading: true }));
    try {
      const res = await fetch("/api/meta/pages");
      if (res.ok) {
        const data = await res.json();
        setMetaPages(prev => ({ ...prev, pages: data }));
      }
    } finally {
      setMetaPages(prev => ({ ...prev, loading: false }));
    }
  }

  async function handlePageConfigChange(country: string, metaPageId: string) {
    setPageConfigs(prev => ({ ...prev, saving: country }));
    try {
      if (!metaPageId) return;
      const page = metaPages.pages.find((p) => p.id === metaPageId);
      const res = await fetch("/api/meta/page-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country,
          meta_page_id: metaPageId,
          meta_page_name: page?.name ?? null,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setPageConfigs(prev => ({
          ...prev,
          configs: [...prev.configs.filter((c) => c.country !== country), updated],
        }));
      }
    } finally {
      setPageConfigs(prev => ({ ...prev, saving: null }));
    }
  }

  async function handleMarketUrlSave(product: string, country: string, url: string) {
    const cellKey = `${product}-${country}`;
    setMarketUrls(prev => ({ ...prev, saving: cellKey }));
    try {
      const res = await fetch("/api/market-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, country, url }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMarketUrls(prev => ({
          ...prev,
          urls: [...prev.urls.filter((u) => !(u.product === product && u.country === country)), updated],
        }));
      }
    } finally {
      setMarketUrls(prev => ({ ...prev, saving: null }));
    }
  }

  const groups = Array.from(new Set(TABS.map((t) => t.group)));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) router.back(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-[740px] h-[85vh] flex overflow-hidden relative">
        {/* Close button — top right */}
        <button
          onClick={() => router.back()}
          className="absolute top-3 right-3 z-10 text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Sidebar */}
        <nav className="w-48 shrink-0 border-r border-gray-100 bg-gray-50/50 px-3 pt-5 pb-4 flex flex-col">
          <div className="flex items-center justify-between px-2 mb-4">
            <h1 className="text-base font-semibold text-gray-900">Settings</h1>
          </div>
          {groups.map((group) => (
            <div key={group} className="mb-4">
              <p className="text-[10px] font-semibold text-gray-400 tracking-wider uppercase px-2 mb-1.5">
                {group}
              </p>
              <div className="space-y-0.5">
                {TABS.filter((t) => t.group === group).map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors ${
                        isActive
                          ? "bg-white text-gray-900 font-medium shadow-sm border border-gray-200/80"
                          : "text-gray-500 hover:text-gray-700 hover:bg-white/60"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-7 py-6">
          {activeTab === "pages" && (
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
          )}

          {activeTab === "static-ads" && (
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
                  label="Auto-regenerate threshold"
                  description="Images scoring below this will auto-regenerate (max 5 times)"
                  action={
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={settings.static_ads_quality_threshold}
                        onChange={(e) => setSettings((s) => ({ ...s, static_ads_quality_threshold: Number(e.target.value) }))}
                        className="w-20 accent-indigo-600"
                      />
                      <span className="text-sm font-medium text-gray-700 w-7 text-right tabular-nums">
                        {settings.static_ads_quality_threshold}
                      </span>
                    </div>
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
          )}

          {activeTab === "markets" && (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-5">Markets</h2>
              {mappings.loading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </div>
              ) : (
                <div className="space-y-6">
                  {LANGUAGES.filter((l) => l.domain).map((lang) => {
                    const country = COUNTRY_MAP[lang.value];
                    return (
                      <div key={lang.value}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-lg" role="img" aria-label={lang.label}>{lang.flag}</span>
                          <h3 className="text-sm font-semibold text-gray-900">{country} — {lang.label}</h3>
                        </div>

                        {/* Product URLs */}
                        <SectionHeader>Product URLs</SectionHeader>
                        <SettingsCard>
                          {PRODUCTS.map((prod, i) => {
                            const cellKey = `${prod.value}-${country}`;
                            const existing = marketUrls.urls.find((u) => u.product === prod.value && u.country === country);
                            const draft = marketUrls.drafts[cellKey];
                            const value = draft !== undefined ? draft : existing?.url ?? "";
                            const isSaving = marketUrls.saving === cellKey;
                            return (
                              <div key={prod.value}>
                                {i > 0 && <RowDivider />}
                                <div className="flex items-center justify-between py-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm font-medium text-gray-700">{prod.label}</span>
                                    {isSaving && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                                    {!isSaving && existing?.url && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                                  </div>
                                  <input
                                    type="url"
                                    value={value}
                                    onChange={(e) => setMarketUrls(prev => ({ ...prev, drafts: { ...prev.drafts, [cellKey]: e.target.value } }))}
                                    onBlur={() => {
                                      if (draft !== undefined && draft !== (existing?.url ?? "")) {
                                        handleMarketUrlSave(prod.value, country, draft);
                                      }
                                      setMarketUrls(prev => {
                                        const nextDrafts = { ...prev.drafts };
                                        delete nextDrafts[cellKey];
                                        return { ...prev, drafts: nextDrafts };
                                      });
                                    }}
                                    placeholder="https://..."
                                    className="w-64 bg-white border border-gray-200 text-gray-800 placeholder-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500 truncate"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </SettingsCard>

                        {/* Facebook Page */}
                        <SectionHeader>Facebook Page</SectionHeader>
                        <SettingsCard>
                          {(() => {
                            const config = pageConfigs.configs.find((c) => c.country === country);
                            const isSaving = pageConfigs.saving === country;
                            return (
                              <div className="flex items-center justify-between py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-sm font-medium text-gray-700">Page</span>
                                  {isSaving && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                                  {!isSaving && config?.meta_page_id && (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                  )}
                                </div>
                                {metaPages.pages.length === 0 && !metaPages.loading ? (
                                  <button
                                    onClick={fetchMetaPages}
                                    className="text-xs text-indigo-600 hover:text-indigo-800"
                                  >
                                    Load pages
                                  </button>
                                ) : metaPages.loading ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                                ) : (
                                  <Dropdown
                                    value={config?.meta_page_id ?? ""}
                                    onChange={(v) => handlePageConfigChange(country, v)}
                                    options={[
                                      { value: "", label: "Not assigned" },
                                      ...metaPages.pages.map((p) => ({
                                        value: p.id,
                                        label: p.name,
                                      })),
                                    ]}
                                    placeholder="Not assigned"
                                    className="w-52"
                                  />
                                )}
                              </div>
                            );
                          })()}
                        </SettingsCard>

                        {/* Campaign Mappings */}
                        <SectionHeader>Campaign Mappings</SectionHeader>
                        {mappings.metaCampaigns.length === 0 ? (
                          <SettingsCard>
                            <div className="py-2 text-sm text-gray-400">
                              No active campaigns found in Meta.
                            </div>
                          </SettingsCard>
                        ) : (
                          <SettingsCard>
                            {PRODUCTS.map((prod, i) => {
                              const mapping = mappings.campaignMappings.find(
                                (m) => m.product === prod.value && m.country === country
                              );
                              const cellKey = `${prod.value}-${country}`;
                              const isSaving = mappings.saving === cellKey;
                              const campaignAdSets = mapping?.meta_campaign_id
                                ? adSets.byCampaign[mapping.meta_campaign_id] ?? []
                                : [];
                              const isLoadingAdSets = adSets.loading === mapping?.meta_campaign_id;
                              return (
                                <div key={prod.value}>
                                  {i > 0 && <RowDivider />}
                                  <div className="py-1">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-sm font-medium text-gray-700">{prod.label}</span>
                                        {isSaving && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                                        {!isSaving && mapping?.template_adset_id && (
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                        )}
                                      </div>
                                      <Dropdown
                                        value={mapping?.meta_campaign_id ?? ""}
                                        onChange={(v) => handleMappingChange(prod.value, country, v)}
                                        options={[
                                          { value: "", label: "Not mapped" },
                                          ...mappings.metaCampaigns.map((c) => ({
                                            value: c.id,
                                            label: c.name,
                                          })),
                                        ]}
                                        placeholder="Not mapped"
                                        className="w-52"
                                      />
                                    </div>
                                    {mapping?.meta_campaign_id && (
                                      <div className="mt-1.5 flex items-center justify-between">
                                        <span className="text-xs text-gray-400 pl-4">Template ad set</span>
                                        {campaignAdSets.length === 0 && !isLoadingAdSets ? (
                                          <button
                                            onClick={() => fetchAdSetsForCampaign(mapping.meta_campaign_id)}
                                            className="text-xs text-indigo-600 hover:text-indigo-800"
                                          >
                                            Load ad sets
                                          </button>
                                        ) : isLoadingAdSets ? (
                                          <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                                        ) : (
                                          <Dropdown
                                            value={mapping?.template_adset_id ?? ""}
                                            onChange={(v) => handleTemplateAdSetChange(prod.value, country, v)}
                                            options={[
                                              { value: "", label: "No template" },
                                              ...campaignAdSets.map((a) => ({
                                                value: a.id,
                                                label: a.name,
                                              })),
                                            ]}
                                            placeholder="Select template"
                                            className="w-52"
                                          />
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </SettingsCard>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {activeTab === "meta-ads" && (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-5">Meta Ads</h2>
              <SettingsCard>
                <Row
                  label="Meta Business"
                  description={
                    meta.status
                      ? meta.status.name
                      : meta.error
                      ? meta.error
                      : "Configured via environment variables"
                  }
                  descriptionColor={meta.status ? "text-emerald-600" : meta.error ? "text-red-500" : undefined}
                  action={
                    <ActionButton onClick={testMetaConnection} disabled={meta.loading}>
                      {meta.loading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : meta.status ? (
                        "Connected"
                      ) : (
                        "Test"
                      )}
                    </ActionButton>
                  }
                />
              </SettingsCard>

              <SectionHeader>Defaults</SectionHeader>
              <SettingsCard>
                <Row
                  label="Daily budget"
                  description="Default budget for new campaigns"
                  action={
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-gray-400">kr</span>
                      <input
                        type="number"
                        min={0}
                        step={10}
                        value={settings.meta_default_daily_budget}
                        onChange={(e) => setSettings((s) => ({ ...s, meta_default_daily_budget: Number(e.target.value) }))}
                        className="w-20 bg-white border border-gray-200 text-gray-800 rounded-lg px-2.5 py-1.5 text-sm text-right focus:outline-none focus:border-indigo-500 tabular-nums"
                      />
                    </div>
                  }
                />
                <RowDivider />
                <Row
                  label="Default objective"
                  description="Pre-selected for new campaigns"
                  action={
                    <Dropdown
                      value={settings.meta_default_objective}
                      onChange={(v) => setSettings((s) => ({ ...s, meta_default_objective: v }))}
                      options={META_OBJECTIVES.map((o) => ({ value: o.value, label: o.label }))}
                      className="w-36"
                    />
                  }
                />
                <RowDivider />
                <Row
                  label="Default schedule time"
                  description="Start time for new campaigns"
                  action={
                    <input
                      type="time"
                      value={settings.meta_default_schedule_time}
                      onChange={(e) => setSettings((s) => ({ ...s, meta_default_schedule_time: e.target.value }))}
                      className="bg-white border border-gray-200 text-gray-800 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-indigo-500 tabular-nums"
                    />
                  }
                />
              </SettingsCard>
              <SaveButton saved={saved} onSave={handleSave} />
            </>
          )}

          {activeTab === "integrations" && (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-5">Integrations</h2>
              <SettingsCard>
                <Row
                  label="Kie AI Credits"
                  description="Image generation (nano-banana-pro)"
                  action={
                    <div className="flex items-center gap-2.5">
                      {kie.balance !== null && (
                        <span className="text-base font-semibold text-gray-800 tabular-nums">
                          {kie.balance.toLocaleString()}
                        </span>
                      )}
                      {kie.error && <span className="text-xs text-red-500">{kie.error}</span>}
                      <ActionButton onClick={fetchKieCredits} disabled={kie.loading}>
                        {kie.loading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : kie.balance === null ? (
                          "Check"
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                      </ActionButton>
                    </div>
                  }
                />
              </SettingsCard>

              <SectionHeader>Page Analytics</SectionHeader>
              <SettingsCard>
                <Row
                  label="Shopify"
                  description={
                    shopify.status
                      ? shopify.status.shop
                      : shopify.error
                      ? shopify.error
                      : "Configured via environment variables"
                  }
                  descriptionColor={shopify.status ? "text-emerald-600" : shopify.error ? "text-red-500" : undefined}
                  action={
                    <ActionButton onClick={testShopifyConnection} disabled={shopify.loading}>
                      {shopify.loading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : shopify.status ? (
                        "Connected"
                      ) : (
                        "Test"
                      )}
                    </ActionButton>
                  }
                />
                <RowDivider />
                {LANGUAGES.filter((l) => l.domain).map((lang, i) => {
                  const mid = settings.ga4_measurement_ids[lang.value] || "";
                  return (
                    <div key={lang.value}>
                      {i > 0 && <RowDivider />}
                      <Row
                        label={`GA4 — ${lang.label}`}
                        description={mid || "Not configured"}
                        descriptionColor={mid ? "text-emerald-600" : undefined}
                        action={
                          <input
                            type="text"
                            value={mid}
                            onChange={(e) => setSettings((s) => ({
                              ...s,
                              ga4_measurement_ids: { ...s.ga4_measurement_ids, [lang.value]: e.target.value },
                            }))}
                            placeholder="G-XXXXXXXXXX"
                            className="w-36 bg-white border border-gray-200 text-gray-800 placeholder-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                          />
                        }
                      />
                    </div>
                  );
                })}
                <RowDivider />
                <Row
                  label="Microsoft Clarity"
                  description={settings.clarity_project_id || "Not configured"}
                  descriptionColor={settings.clarity_project_id ? "text-emerald-600" : undefined}
                  action={
                    <input
                      type="text"
                      value={settings.clarity_project_id}
                      onChange={(e) => setSettings((s) => ({ ...s, clarity_project_id: e.target.value }))}
                      placeholder="Project ID"
                      className="w-36 bg-white border border-gray-200 text-gray-800 placeholder-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                    />
                  }
                />
                <RowDivider />
                <Row
                  label="Shopify store domains"
                  description="Outbound links to these domains get UTM tags"
                  action={
                    <input
                      type="text"
                      value={settings.shopify_domains}
                      onChange={(e) => setSettings((s) => ({ ...s, shopify_domains: e.target.value }))}
                      placeholder="store.myshopify.com"
                      className="w-44 bg-white border border-gray-200 text-gray-800 placeholder-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                    />
                  }
                />
              </SettingsCard>
              <SaveButton saved={saved} onSave={handleSave} />

              <SectionHeader>Services</SectionHeader>
              <p className="text-xs text-gray-400 mb-2.5">
                All API keys configured via environment variables in Vercel.
              </p>
              <SettingsCard>
                {[
                  { name: "OpenAI", env: "OPENAI_API_KEY", desc: "GPT-4o text translation & quality analysis" },
                  { name: "Cloudflare Pages", env: "CF_PAGES_*", desc: "Landing page hosting" },
                  { name: "Meta Marketing", env: "META_*", desc: "Ad campaign management" },
                  { name: "Shopify", env: "SHOPIFY_*", desc: "Order data for A/B test conversions" },
                  { name: "Kie AI", env: "KIE_AI_API_KEY", desc: "Image generation & translation" },
                  { name: "Resend", env: "RESEND_API_KEY", desc: "Email notifications" },
                  { name: "Google Drive", env: "GDRIVE_*", desc: "Image import & export" },
                ].map((svc, i) => (
                  <div key={svc.name}>
                    {i > 0 && <RowDivider />}
                    <Row
                      label={svc.name}
                      description={svc.desc}
                      action={
                        <code className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                          {svc.env}
                        </code>
                      }
                    />
                  </div>
                ))}
              </SettingsCard>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ────────────────────────────────── */

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
      {children}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-6 mb-2">
      {children}
    </h3>
  );
}

function Row({
  label,
  description,
  descriptionColor,
  action,
}: {
  label: string;
  description: string;
  descriptionColor?: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="min-w-0 mr-4">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className={`text-xs mt-0.5 ${descriptionColor ?? "text-gray-400"}`}>{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function RowDivider() {
  return <div className="border-t border-gray-100" />;
}

function ActionButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-sm text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3.5 py-1.5 transition-colors disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function SaveButton({ saved, onSave }: { saved: boolean; onSave: () => void }) {
  return (
    <div className="mt-4">
      <button
        onClick={onSave}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 transition-colors font-medium"
      >
        {saved ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Save className="w-3.5 h-3.5" />}
        {saved ? "Saved!" : "Save"}
      </button>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-indigo-600" : "bg-gray-200"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}
