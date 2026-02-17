"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Save, Eye, EyeOff, CheckCircle2, RefreshCw, Loader2 } from "lucide-react";
import { Language, LANGUAGES } from "@/types";

interface Settings {
  openai_api_key: string;
  netlify_token: string;
  netlify_site_id_sv: string;
  netlify_site_id_dk: string;
  netlify_site_id_no: string;
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
    const stored = localStorage.getItem("content-hub-settings");
    if (stored) setSettings(JSON.parse(stored));
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
            label="🇳🇴 Norwegian Site ID (blog.halsobladet.com/no)"
            value={settings.netlify_site_id_no}
            onChange={(v) => setSettings((s) => ({ ...s, netlify_site_id_no: v }))}
            placeholder="Same as Swedish site ID for now"
          />
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
