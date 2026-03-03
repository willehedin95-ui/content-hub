"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Image,
  Megaphone,
  Plug,
  X,
  Globe,
  BarChart3,
} from "lucide-react";
import { MetaCampaignMapping, MetaPageConfig, MarketProductUrl } from "@/types";
import UsagePage from "@/app/usage/page";
import { Settings } from "./components";
import PagesTab from "./tabs/PagesTab";
import StaticAdsTab from "./tabs/StaticAdsTab";
import MarketsTab from "./tabs/MarketsTab";
import MetaAdsTab from "./tabs/MetaAdsTab";
import IntegrationsTab from "./tabs/IntegrationsTab";

const TABS = [
  { id: "pages", label: "Landing Pages", icon: FileText, group: "SETTINGS" },
  { id: "static-ads", label: "Static Ads", icon: Image, group: "SETTINGS" },
  { id: "markets", label: "Markets", icon: Globe, group: "SETTINGS" },
  { id: "meta-ads", label: "Meta Ads", icon: Megaphone, group: "CONNECTIONS" },
  { id: "integrations", label: "Integrations", icon: Plug, group: "CONNECTIONS" },
  { id: "usage", label: "Usage & Costs", icon: BarChart3, group: "ANALYTICS" },
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
    ga4_property_ids: {},
    clarity_project_id: "",
    clarity_project_ids: {},
    clarity_api_token: "",
    shopify_domains: "",
    meta_pixel_id: "",
    excluded_ips: [],
  });
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
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

  // Google Ads connection state
  const [googleAds, setGoogleAds] = useState<{
    status: { customerId: string; descriptiveName: string } | null;
    loading: boolean;
    error: string | null;
  }>({ status: null, loading: false, error: null });

  // Meta CAPI state
  const [capi, setCapi] = useState<{
    stats: { total: number; sent: number; failed: number; pending: number } | null;
    syncing: boolean;
    syncResult: { sent: number; skipped: number; errors: number } | null;
    error: string | null;
  }>({ stats: null, syncing: false, syncResult: null, error: null });

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
    }).catch(() => {
      setLoadError("Failed to load some settings data");
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
    setSaveError(null);
    try {
      // Save to DB (source of truth) and localStorage (cache)
      localStorage.setItem("content-hub-settings", JSON.stringify(settings));
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveError("Failed to save settings");
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = setTimeout(() => setSaveError(null), 5000);
    }
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

  async function testGoogleAdsConnection() {
    setGoogleAds(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch("/api/google-ads/verify");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Connection failed");
      setGoogleAds(prev => ({ ...prev, status: data, loading: false }));
    } catch (err) {
      setGoogleAds({
        status: null,
        loading: false,
        error: err instanceof Error ? err.message : "Connection failed",
      });
    }
  }

  async function syncCapi() {
    setCapi(prev => ({ ...prev, syncing: true, error: null, syncResult: null }));
    try {
      const res = await fetch("/api/capi/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 30 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setCapi(prev => ({ ...prev, syncing: false, syncResult: data }));
      // Refresh stats after sync
      fetchCapiStats();
    } catch (err) {
      setCapi(prev => ({
        ...prev,
        syncing: false,
        error: err instanceof Error ? err.message : "Sync failed",
      }));
    }
  }

  async function fetchCapiStats() {
    try {
      const res = await fetch("/api/capi/stats");
      if (res.ok) {
        const data = await res.json();
        setCapi(prev => ({ ...prev, stats: data }));
      }
    } catch { /* ignore */ }
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
          {(loadError || saveError) && (
            <div className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg mb-4 ${
              saveError ? "bg-red-50 text-red-600 border border-red-200" : "bg-amber-50 text-amber-600 border border-amber-200"
            }`}>
              {saveError || loadError}
            </div>
          )}
          {activeTab === "pages" && (
            <PagesTab settings={settings} setSettings={setSettings} saved={saved} handleSave={handleSave} />
          )}

          {activeTab === "static-ads" && (
            <StaticAdsTab settings={settings} setSettings={setSettings} saved={saved} handleSave={handleSave} />
          )}

          {activeTab === "markets" && (
            <MarketsTab
              mappings={mappings}
              marketUrls={marketUrls}
              pageConfigs={pageConfigs}
              adSets={adSets}
              metaPages={metaPages}
              setMarketUrls={setMarketUrls}
              handleMarketUrlSave={handleMarketUrlSave}
              fetchMetaPages={fetchMetaPages}
              handlePageConfigChange={handlePageConfigChange}
              handleMappingChange={handleMappingChange}
              fetchAdSetsForCampaign={fetchAdSetsForCampaign}
              handleTemplateAdSetChange={handleTemplateAdSetChange}
            />
          )}

          {activeTab === "meta-ads" && (
            <MetaAdsTab
              settings={settings}
              setSettings={setSettings}
              saved={saved}
              handleSave={handleSave}
              meta={meta}
              testMetaConnection={testMetaConnection}
            />
          )}

          {activeTab === "usage" && (
            <UsagePage />
          )}

          {activeTab === "integrations" && (
            <IntegrationsTab
              settings={settings}
              setSettings={setSettings}
              saved={saved}
              handleSave={handleSave}
              kie={kie}
              shopify={shopify}
              googleAds={googleAds}
              capi={capi}
              fetchKieCredits={fetchKieCredits}
              testShopifyConnection={testShopifyConnection}
              testGoogleAdsConnection={testGoogleAdsConnection}
              syncCapi={syncCapi}
              fetchCapiStats={fetchCapiStats}
            />
          )}
        </div>
      </div>
    </div>
  );
}
