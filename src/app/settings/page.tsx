"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Save, Eye, EyeOff, CheckCircle2, RefreshCw, Loader2 } from "lucide-react";
import { Language, LANGUAGES, PRODUCTS, COUNTRY_MAP, MetaCampaignMapping } from "@/types";
import Dropdown from "@/components/ui/Dropdown";

interface Settings {
  openai_api_key: string;
  netlify_token: string;
  netlify_site_id_sv: string;
  netlify_site_id_dk: string;
  netlify_site_id_no: string;
  pages_quality_enabled: boolean;
  pages_quality_threshold: number;
  static_ads_quality_enabled: boolean;
  static_ads_quality_threshold: number;
  static_ads_economy_mode: boolean;
  static_ads_default_languages: Language[];
  static_ads_notification_email: string;
  static_ads_email_enabled: boolean;
}

// Settings are stored in localStorage for simplicity (API keys stay client-side)
// In production, these should be env vars set in Vercel dashboard
export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    openai_api_key: "",
    netlify_token: "",
    netlify_site_id_sv: "",
    netlify_site_id_dk: "",
    netlify_site_id_no: "",
    pages_quality_enabled: true,
    pages_quality_threshold: 85,
    static_ads_quality_enabled: true,
    static_ads_quality_threshold: 80,
    static_ads_economy_mode: false,
    static_ads_default_languages: ["sv", "da", "no", "de"],
    static_ads_notification_email: "",
    static_ads_email_enabled: false,
  });
  const [showKeys, setShowKeys] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [kieBalance, setKieBalance] = useState<number | null>(null);
  const [kieLoading, setKieLoading] = useState(false);
  const [kieError, setKieError] = useState<string | null>(null);
  const [metaStatus, setMetaStatus] = useState<{ name: string; id: string } | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [campaignMappings, setCampaignMappings] = useState<MetaCampaignMapping[]>([]);
  const [metaCampaigns, setMetaCampaigns] = useState<{ id: string; name: string; status: string; objective: string }[]>([]);
  const [mappingsLoading, setMappingsLoading] = useState(true);
  const [mappingSaving, setMappingSaving] = useState<string | null>(null);
  const [adSetsByCampaign, setAdSetsByCampaign] = useState<Record<string, { id: string; name: string; status: string }[]>>({});
  const [adSetsLoading, setAdSetsLoading] = useState<string | null>(null);

  const fetchKieCredits = useCallback(async () => {
    setKieLoading(true);
    setKieError(null);
    try {
      const res = await fetch("/api/kie-credits");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to fetch");
      }
      const data = await res.json();
      setKieBalance(data.balance);
    } catch (err) {
      setKieError(err instanceof Error ? err.message : "Failed to fetch credits");
    } finally {
      setKieLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("content-hub-settings");
      if (stored) setSettings(JSON.parse(stored));
    } catch {}

    // Fetch campaign mappings + Meta campaigns
    Promise.all([
      fetch("/api/meta/campaign-mappings").then((r) => r.ok ? r.json() : []),
      fetch("/api/meta/campaigns/list").then((r) => r.ok ? r.json() : []),
    ]).then(([mappings, campaigns]) => {
      setCampaignMappings(mappings);
      setMetaCampaigns(campaigns);
    }).finally(() => setMappingsLoading(false));

    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  function handleSave() {
    localStorage.setItem("content-hub-settings", JSON.stringify(settings));
    setSaved(true);
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    savedTimeoutRef.current = setTimeout(() => setSaved(false), 2500);
  }

  async function fetchAdSetsForCampaign(metaCampaignId: string) {
    if (adSetsByCampaign[metaCampaignId]) return;
    setAdSetsLoading(metaCampaignId);
    try {
      const res = await fetch(`/api/meta/adsets?campaign_id=${metaCampaignId}`);
      if (res.ok) {
        const data = await res.json();
        setAdSetsByCampaign((prev) => ({ ...prev, [metaCampaignId]: data }));
      }
    } finally {
      setAdSetsLoading(null);
    }
  }

  async function handleTemplateAdSetChange(product: string, country: string, adSetId: string) {
    const cellKey = `${product}-${country}`;
    setMappingSaving(cellKey);
    try {
      const mapping = campaignMappings.find((m) => m.product === product && m.country === country);
      if (!mapping) return;
      const allAdSets = Object.values(adSetsByCampaign).flat();
      const adSet = allAdSets.find((a) => a.id === adSetId);
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
        setCampaignMappings((prev) => {
          const without = prev.filter((m) => !(m.product === product && m.country === country));
          return [...without, updated];
        });
      }
    } finally {
      setMappingSaving(null);
    }
  }

  async function handleMappingChange(product: string, country: string, metaCampaignId: string) {
    const cellKey = `${product}-${country}`;
    setMappingSaving(cellKey);
    try {
      if (!metaCampaignId) {
        // Remove mapping
        const existing = campaignMappings.find((m) => m.product === product && m.country === country);
        if (existing) {
          await fetch(`/api/meta/campaign-mappings?id=${existing.id}`, { method: "DELETE" });
          setCampaignMappings((prev) => prev.filter((m) => m.id !== existing.id));
        }
      } else {
        const campaign = metaCampaigns.find((c) => c.id === metaCampaignId);
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
          setCampaignMappings((prev) => {
            const without = prev.filter((m) => !(m.product === product && m.country === country));
            return [...without, mapping];
          });
        }
      }
    } finally {
      setMappingSaving(null);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">
          Configure API keys and Netlify site IDs
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
        <p className="text-amber-700 text-sm font-medium">Recommended: Use environment variables</p>
        <p className="text-amber-500 text-xs mt-0.5">
          For security, set these as environment variables in your Vercel project settings instead of storing them here. See <code className="bg-amber-50 px-1 rounded">.env.local.example</code> for the variable names.
        </p>
      </div>

      <div className="space-y-6">
        {/* OpenAI */}
        <Section title="OpenAI">
          <Field
            label="API Key"
            value={settings.openai_api_key}
            onChange={(v) => setSettings((s) => ({ ...s, openai_api_key: v }))}
            secret
            showSecrets={showKeys}
            placeholder="sk-..."
          />
        </Section>

        {/* Netlify */}
        <Section title="Netlify">
          <Field
            label="API Token"
            value={settings.netlify_token}
            onChange={(v) => setSettings((s) => ({ ...s, netlify_token: v }))}
            secret
            showSecrets={showKeys}
            placeholder="nfp_..."
          />
          <Field
            label="🇸🇪 Swedish Site ID (blog.halsobladet.com)"
            value={settings.netlify_site_id_sv}
            onChange={(v) => setSettings((s) => ({ ...s, netlify_site_id_sv: v }))}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
          <Field
            label="🇩🇰 Danish Site ID (smarthelse.dk)"
            value={settings.netlify_site_id_dk}
            onChange={(v) => setSettings((s) => ({ ...s, netlify_site_id_dk: v }))}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
          <Field
            label="🇳🇴 Norwegian Site ID (helseguiden.com)"
            value={settings.netlify_site_id_no}
            onChange={(v) => setSettings((s) => ({ ...s, netlify_site_id_no: v }))}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </Section>

        {/* Pages */}
        <Section title="Pages">
          <Toggle
            label="Quality analysis"
            description="Run automatic quality checks on translated pages"
            checked={settings.pages_quality_enabled}
            onChange={(v) => setSettings((s) => ({ ...s, pages_quality_enabled: v }))}
          />

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">
              Auto-regenerate threshold
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={settings.pages_quality_threshold}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    pages_quality_threshold: Number(e.target.value),
                  }))
                }
                className="flex-1 accent-indigo-600"
              />
              <span className="text-sm font-medium text-gray-700 w-8 text-right">
                {settings.pages_quality_threshold}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Pages scoring below this threshold will auto-regenerate up to 3 times
            </p>
          </div>
        </Section>

        {/* Static Ads */}
        <Section title="Static Ads">
          <Toggle
            label="Quality analysis"
            description="Run automatic quality checks on generated images"
            checked={settings.static_ads_quality_enabled}
            onChange={(v) => setSettings((s) => ({ ...s, static_ads_quality_enabled: v }))}
          />

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">
              Auto-regenerate threshold
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={settings.static_ads_quality_threshold}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    static_ads_quality_threshold: Number(e.target.value),
                  }))
                }
                className="flex-1 accent-indigo-600"
              />
              <span className="text-sm font-medium text-gray-700 w-8 text-right">
                {settings.static_ads_quality_threshold}
              </span>
            </div>
          </div>

          <Toggle
            label="Economy mode"
            description="Use faster, lower-cost generation settings"
            checked={settings.static_ads_economy_mode}
            onChange={(v) => setSettings((s) => ({ ...s, static_ads_economy_mode: v }))}
          />

          <div>
            <label className="block text-xs text-gray-500 mb-2">
              Default target languages
            </label>
            <div className="grid grid-cols-2 gap-2">
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
                    className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                      selected
                        ? "bg-indigo-50 border-indigo-300 text-indigo-600"
                        : "bg-white border-gray-200 text-gray-400 hover:text-gray-700"
                    }`}
                  >
                    <span className="text-base">{lang.flag}</span>
                    {lang.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Field
            label="Notification email"
            value={settings.static_ads_notification_email}
            onChange={(v) => setSettings((s) => ({ ...s, static_ads_notification_email: v }))}
            placeholder="email@example.com"
          />

          <Toggle
            label="Email notifications"
            description="Send email when batch jobs complete"
            checked={settings.static_ads_email_enabled}
            onChange={(v) => setSettings((s) => ({ ...s, static_ads_email_enabled: v }))}
          />
        </Section>

        {/* Meta Ads */}
        <Section title="Meta Ads">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Connection Status</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Set META_SYSTEM_USER_TOKEN, META_AD_ACCOUNT_ID, META_PAGE_ID in env vars
              </p>
            </div>
            <div className="flex items-center gap-2">
              {metaStatus && (
                <span className="text-sm font-medium text-emerald-600">
                  {metaStatus.name}
                </span>
              )}
              {metaError && (
                <span className="text-xs text-red-500 max-w-[200px] truncate">{metaError}</span>
              )}
              <button
                onClick={async () => {
                  setMetaLoading(true);
                  setMetaError(null);
                  try {
                    const res = await fetch("/api/meta/verify");
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error ?? "Connection failed");
                    setMetaStatus(data);
                  } catch (err) {
                    setMetaError(err instanceof Error ? err.message : "Connection failed");
                    setMetaStatus(null);
                  } finally {
                    setMetaLoading(false);
                  }
                }}
                disabled={metaLoading}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
              >
                {metaLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : metaStatus ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                {metaStatus ? "Connected" : metaLoading ? "Testing..." : "Test Connection"}
              </button>
            </div>
          </div>
        </Section>

        {/* Meta Campaign Mapping */}
        <Section title="Meta Campaign Mapping">
          <p className="text-xs text-gray-400 -mt-2">
            Map each product + country to a Meta campaign and template ad set. New ad sets will be duplicated from the template.
          </p>
          {mappingsLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading mappings...
            </div>
          ) : metaCampaigns.length === 0 ? (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-4 py-3">
              No active campaigns found in Meta. Create campaigns in Meta Ads Manager first.
            </p>
          ) : (
            <div className="space-y-4">
              {PRODUCTS.map((prod) => (
                <div key={prod.value}>
                  <p className="text-xs font-semibold text-gray-600 mb-2">{prod.label}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {LANGUAGES.map((lang) => {
                      const country = COUNTRY_MAP[lang.value];
                      const mapping = campaignMappings.find(
                        (m) => m.product === prod.value && m.country === country
                      );
                      const cellKey = `${prod.value}-${country}`;
                      const isSaving = mappingSaving === cellKey;
                      const campaignAdSets = mapping?.meta_campaign_id
                        ? adSetsByCampaign[mapping.meta_campaign_id] ?? []
                        : [];
                      const isLoadingAdSets = adSetsLoading === mapping?.meta_campaign_id;

                      return (
                        <div key={lang.value} className="relative">
                          <label className="block text-xs text-gray-400 mb-1">
                            {lang.flag} {country}
                          </label>
                          <div className="flex items-center gap-1">
                            <Dropdown
                              value={mapping?.meta_campaign_id ?? ""}
                              onChange={(v) => handleMappingChange(prod.value, country, v)}
                              options={[
                                { value: "", label: "Not mapped" },
                                ...metaCampaigns.map((c) => ({
                                  value: c.id,
                                  label: c.name,
                                })),
                              ]}
                              placeholder="Not mapped"
                              className="flex-1"
                            />
                            {isSaving && (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 shrink-0" />
                            )}
                            {!isSaving && mapping && mapping.template_adset_id && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            )}
                            {!isSaving && mapping && !mapping.template_adset_id && (
                              <span className="w-3.5 h-3.5 text-amber-500 shrink-0 text-xs">!</span>
                            )}
                          </div>
                          {mapping?.meta_campaign_id && (
                            <div className="mt-1">
                              {campaignAdSets.length === 0 && !isLoadingAdSets ? (
                                <button
                                  onClick={() => fetchAdSetsForCampaign(mapping.meta_campaign_id)}
                                  className="text-xs text-indigo-600 hover:text-indigo-800"
                                >
                                  Load ad sets for template
                                </button>
                              ) : isLoadingAdSets ? (
                                <div className="flex items-center gap-1 text-xs text-gray-400">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Loading ad sets...
                                </div>
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
                                  placeholder="Select template ad set"
                                  className="flex-1"
                                />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Kie AI */}
        <Section title="Kie AI">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Credit Balance</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Credits used for image translation (nano-banana-pro)
              </p>
            </div>
            <div className="flex items-center gap-2">
              {kieBalance !== null && (
                <span className="text-lg font-semibold text-gray-800">
                  {kieBalance.toLocaleString()}
                </span>
              )}
              {kieError && (
                <span className="text-xs text-red-500">{kieError}</span>
              )}
              <button
                onClick={fetchKieCredits}
                disabled={kieLoading}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
              >
                {kieLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                {kieBalance === null && !kieLoading ? "Check" : "Refresh"}
              </button>
            </div>
          </div>
        </Section>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            {saved ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saved ? "Saved!" : "Save Settings"}
          </button>

          <button
            onClick={() => setShowKeys((s) => !s)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 border border-gray-200 px-4 py-2.5 rounded-lg transition-colors"
          >
            {showKeys ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
            {showKeys ? "Hide" : "Show"} secrets
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  secret,
  showSecrets,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secret?: boolean;
  showSecrets?: boolean;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-gray-500 mb-1.5">{label}</label>
      <input
        id={id}
        type={secret && !showSecrets ? "password" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white border border-gray-300 text-gray-800 placeholder-gray-400 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
      />
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {description && (
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-indigo-600" : "bg-gray-200"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
