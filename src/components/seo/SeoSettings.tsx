"use client";

import { useState } from "react";
import { CheckCircle, XCircle, RefreshCw, Loader2, Plus, Trash2, Info, ChevronDown, ChevronUp } from "lucide-react";
import type { GscProperty, Language } from "@/types";

const LANG_OPTIONS: { value: Language; label: string; defaultProperty: string; defaultLabel: string }[] = [
  { value: "sv", label: "Swedish", defaultProperty: "https://halsobladet.com/", defaultLabel: "Halsobladet (SV)" },
  { value: "da", label: "Danish", defaultProperty: "https://smarthelse.dk/", defaultLabel: "SmartHelse (DA)" },
  { value: "no", label: "Norwegian", defaultProperty: "https://helseguiden.com/", defaultLabel: "Helseguiden (NO)" },
];

export default function SeoSettings({ initialProperties }: { initialProperties: GscProperty[] }) {
  const [properties, setProperties] = useState<GscProperty[]>(initialProperties);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; error?: string }>>({});
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Collapse setup guide if properties are already configured
  const [showGuide, setShowGuide] = useState(initialProperties.length === 0);

  const addProperty = () => {
    const used = new Set(properties.map((p) => p.language));
    const next = LANG_OPTIONS.find((l) => !used.has(l.value));
    if (!next) return;
    setProperties([
      ...properties,
      { property: next.defaultProperty, language: next.value, label: next.defaultLabel },
    ]);
  };

  const removeProperty = (idx: number) => {
    setProperties(properties.filter((_, i) => i !== idx));
  };

  const updateProperty = (idx: number, field: keyof GscProperty, value: string) => {
    setProperties(properties.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  };

  const saveProperties = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const wsRes = await fetch("/api/workspace");
      const wsData = await wsRes.json();
      const currentSettings = (wsData.settings as Record<string, unknown>) ?? {};
      const mergedSettings = { ...currentSettings, gsc_properties: properties };

      const res = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: mergedSettings }),
      });
      if (res.ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (property: string) => {
    setTesting(property);
    try {
      const res = await fetch("/api/seo/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property }),
      });
      const result = await res.json();
      setTestResults((prev) => ({ ...prev, [property]: result }));
    } catch {
      setTestResults((prev) => ({ ...prev, [property]: { ok: false, error: "Request failed" } }));
    } finally {
      setTesting(null);
    }
  };

  const triggerSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/seo/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        const total = data.results?.reduce((s: number, r: { rows: number }) => s + r.rows, 0) ?? 0;
        setSyncResult(`Synced ${total.toLocaleString()} rows across ${data.results?.length ?? 0} properties`);
      } else {
        setSyncResult(data.error || "Sync failed");
      }
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Setup guide — collapsible */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg">
        <button
          onClick={() => setShowGuide(!showGuide)}
          className="flex items-center justify-between w-full p-4 text-left"
        >
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-500 shrink-0" />
            <span className="text-sm font-medium text-blue-800">Setup Guide</span>
            {properties.length > 0 && !showGuide && (
              <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                {properties.length} properties configured
              </span>
            )}
          </div>
          {showGuide ? <ChevronUp className="w-4 h-4 text-blue-500" /> : <ChevronDown className="w-4 h-4 text-blue-500" />}
        </button>
        {showGuide && (
          <div className="px-4 pb-4 pt-0">
            <ol className="list-decimal list-inside space-y-1 text-sm text-blue-700 ml-7">
              <li>Make sure the Google Search Console API is enabled in your Google Cloud project</li>
              <li>The service account email (<code className="text-xs bg-blue-100 px-1 rounded">GDRIVE_SERVICE_ACCOUNT_EMAIL</code>) needs access to each GSC property</li>
              <li>Go to <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="underline">Search Console</a> &rarr; each property &rarr; Settings &rarr; Users &rarr; Add the service account email as a user</li>
              <li>Add your blog domains below and click &quot;Test Connection&quot;</li>
            </ol>
          </div>
        )}
      </div>

      {/* Properties config */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-4">Google Search Console Properties</h3>
        <div className="space-y-4">
          {properties.map((prop, idx) => (
            <div key={idx} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-start gap-4">
                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Property URL</label>
                      <input
                        type="text"
                        value={prop.property}
                        onChange={(e) => updateProperty(idx, "property", e.target.value)}
                        placeholder="https://halsobladet.com/"
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Label</label>
                      <input
                        type="text"
                        value={prop.label}
                        onChange={(e) => updateProperty(idx, "label", e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Language</label>
                      <select
                        value={prop.language}
                        onChange={(e) => updateProperty(idx, "language", e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        {LANG_OPTIONS.map((l) => (
                          <option key={l.value} value={l.value}>{l.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Test result */}
                  {testResults[prop.property] && (
                    <div className={`flex items-center gap-2 text-xs ${testResults[prop.property].ok ? "text-green-600" : "text-red-600"}`}>
                      {testResults[prop.property].ok ? (
                        <><CheckCircle className="w-4 h-4" /> Connected successfully</>
                      ) : (
                        <><XCircle className="w-4 h-4" /> {testResults[prop.property].error}</>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-5">
                  <button
                    onClick={() => testConnection(prop.property)}
                    disabled={testing === prop.property}
                    className="px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-50"
                  >
                    {testing === prop.property ? <Loader2 className="w-3 h-3 animate-spin" /> : "Test"}
                  </button>
                  <button onClick={() => removeProperty(idx)} className="p-1.5 text-gray-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {properties.length < LANG_OPTIONS.length && (
            <button
              onClick={addProperty}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-dashed border-gray-300 rounded-lg hover:bg-gray-50 w-full justify-center"
            >
              <Plus className="w-4 h-4" /> Add Property
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={saveProperties}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Properties"}
          </button>
          {saved && <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Saved</span>}
        </div>
      </div>

      {/* Sync section */}
      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-sm font-medium text-gray-900 mb-2">Data Sync</h3>
        <p className="text-sm text-gray-500 mb-4">
          Syncs keyword data from Google Search Console. First sync pulls 90 days of history; subsequent syncs pull the last 7 days.
          Data is automatically synced weekly on Mondays.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={triggerSync}
            disabled={syncing || properties.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
          {syncResult && <span className="text-sm text-gray-600">{syncResult}</span>}
        </div>
      </div>
    </div>
  );
}
