"use client";

import { Loader2 } from "lucide-react";
import { META_OBJECTIVES } from "@/types";
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

export default function MetaAdsTab({ settings, setSettings, saved, handleSave, meta, testMetaConnection }: MetaAdsTabProps) {
  return (
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
  );
}
