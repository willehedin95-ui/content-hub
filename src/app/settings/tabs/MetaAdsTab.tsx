"use client";

import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { META_OBJECTIVES } from "@/types";
import type { WorkspaceMetaConfig } from "@/types";
import Dropdown from "@/components/ui/dropdown";
import {
  SettingsCard,
  SectionHeader,
  Row,
  RowDivider,
  ActionButton,
  SaveButton,
} from "../components";
import type { SettingsProps } from "../components";

interface MetaAdsTabProps extends SettingsProps {
  meta: {
    status: { name: string; id: string } | null;
    loading: boolean;
    error: string | null;
  };
  testMetaConnection: () => void;
}

function SecretInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-56 bg-white border border-gray-200 text-gray-800 placeholder-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="text-gray-400 hover:text-gray-600 p-1"
      >
        {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

export default function MetaAdsTab({ settings, setSettings, saved, handleSave, meta, testMetaConnection }: MetaAdsTabProps) {
  const [metaConfig, setMetaConfig] = useState<WorkspaceMetaConfig>({});
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  useEffect(() => {
    fetch("/api/workspace")
      .then((r) => r.ok ? r.json() : null)
      .then((ws) => {
        if (ws?.meta_config) {
          setMetaConfig(ws.meta_config);
        }
      })
      .finally(() => setConfigLoading(false));
  }, []);

  async function handleSaveMetaConfig() {
    setConfigSaving(true);
    try {
      const res = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meta_config: metaConfig }),
      });
      if (!res.ok) throw new Error("Save failed");
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2500);
    } catch {
      // error handled silently
    } finally {
      setConfigSaving(false);
    }
  }

  const hasCustomConfig = !!(metaConfig.system_user_token || metaConfig.ad_account_id || metaConfig.page_id);

  return (
    <>
      <h2 className="text-lg font-semibold text-gray-900 mb-5">Meta Ads</h2>

      {/* Connection status */}
      <SettingsCard>
        <Row
          label="Meta Business"
          description={
            meta.status
              ? meta.status.name
              : meta.error
              ? meta.error
              : hasCustomConfig
              ? "Workspace credentials configured"
              : "Using environment variables"
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

      {/* Per-workspace Meta credentials */}
      <SectionHeader>Workspace Credentials</SectionHeader>
      <SettingsCard>
        {configLoading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-gray-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading...
          </div>
        ) : (
          <>
            <div className="py-2">
              <p className="text-xs text-gray-400 mb-3">
                Override environment variables with workspace-specific Meta credentials.
                Leave blank to use the default env vars.
              </p>
            </div>
            <Row
              label="System User Token"
              description={metaConfig.system_user_token ? "Custom token set" : "Using default"}
              descriptionColor={metaConfig.system_user_token ? "text-emerald-600" : undefined}
              action={
                <SecretInput
                  value={metaConfig.system_user_token ?? ""}
                  onChange={(v) => setMetaConfig((c) => ({ ...c, system_user_token: v || undefined }))}
                  placeholder="EAAx..."
                />
              }
            />
            <RowDivider />
            <Row
              label="Ad Account ID"
              description={metaConfig.ad_account_id ? `act_${metaConfig.ad_account_id.replace("act_", "")}` : "Using default"}
              descriptionColor={metaConfig.ad_account_id ? "text-emerald-600" : undefined}
              action={
                <input
                  type="text"
                  value={metaConfig.ad_account_id ?? ""}
                  onChange={(e) => setMetaConfig((c) => ({ ...c, ad_account_id: e.target.value || undefined }))}
                  placeholder="act_123456789"
                  className="w-56 bg-white border border-gray-200 text-gray-800 placeholder-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                />
              }
            />
            <RowDivider />
            <Row
              label="Page ID"
              description={metaConfig.page_id ? `Page ${metaConfig.page_id}` : "Using default"}
              descriptionColor={metaConfig.page_id ? "text-emerald-600" : undefined}
              action={
                <input
                  type="text"
                  value={metaConfig.page_id ?? ""}
                  onChange={(e) => setMetaConfig((c) => ({ ...c, page_id: e.target.value || undefined }))}
                  placeholder="123456789"
                  className="w-56 bg-white border border-gray-200 text-gray-800 placeholder-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                />
              }
            />
          </>
        )}
      </SettingsCard>
      <div className="mt-4">
        <button
          onClick={handleSaveMetaConfig}
          disabled={configSaving || configLoading}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 transition-colors font-medium disabled:opacity-50"
        >
          {configSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : configSaved ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <>{/* Save icon handled by text */}</>
          )}
          {configSaved ? "Credentials Saved!" : "Save Credentials"}
        </button>
      </div>

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
  );
}
