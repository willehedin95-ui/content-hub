"use client";

import { useState, useEffect, useRef } from "react";
import { Save, Eye, EyeOff, CheckCircle2 } from "lucide-react";

interface Settings {
  openai_api_key: string;
  netlify_token: string;
  netlify_site_id_sv: string;
  netlify_site_id_dk: string;
  netlify_site_id_no: string;
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
  });
  const [showKeys, setShowKeys] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
