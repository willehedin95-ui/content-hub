"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, X } from "lucide-react";
import {
  SettingsCard,
  SectionHeader,
  Row,
  RowDivider,
  SaveButton,
  ToggleSwitch,
} from "../components";
import type { SettingsProps } from "../components";

export default function AutopilotTab({ settings, setSettings, saved, handleSave }: SettingsProps) {
  const [gethookdTest, setGethookdTest] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [gethookdError, setGethookdError] = useState("");
  const [gethookdInfo, setGethookdInfo] = useState("");
  const [newQuery, setNewQuery] = useState("");

  async function testGethookd() {
    setGethookdTest("loading");
    try {
      const res = await fetch("/api/gethookd/test");
      const data = await res.json();
      if (data.ok) {
        setGethookdInfo(`Connected: ${data.workspace} (${data.credits_remaining} credits)`);
        setGethookdTest("ok");
      } else {
        setGethookdError(data.error || "Connection failed");
        setGethookdTest("error");
      }
    } catch {
      setGethookdError("Request failed");
      setGethookdTest("error");
    }
  }

  function addQuery() {
    const q = newQuery.trim();
    if (q && !settings.gethookd_explore_queries.includes(q)) {
      setSettings((s) => ({
        ...s,
        gethookd_explore_queries: [...s.gethookd_explore_queries, q],
      }));
      setNewQuery("");
    }
  }

  function removeQuery(query: string) {
    setSettings((s) => ({
      ...s,
      gethookd_explore_queries: s.gethookd_explore_queries.filter((q) => q !== query),
    }));
  }

  return (
    <>
      <h2 className="text-lg font-semibold text-gray-900 mb-5">Autopilot</h2>

      {/* Concept Generation Mode */}
      <SectionHeader>Concept Generation</SectionHeader>
      <SettingsCard>
        <Row
          label="Autopilot mode"
          description={
            settings.autopilot_mode === "disabled"
              ? "Autopilot is off — concepts are created manually"
              : settings.autopilot_mode === "from_scratch"
              ? "Generates original concepts using Claude"
              : "Finds winning competitor ads via GetHookd and swipes them"
          }
          action={
            <select
              value={settings.autopilot_mode}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  autopilot_mode: e.target.value as typeof settings.autopilot_mode,
                }))
              }
              className="bg-white border border-gray-200 text-gray-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="disabled">Disabled</option>
              <option value="from_scratch">From Scratch</option>
              <option value="competitor_swipe">Competitor Swipe</option>
            </select>
          }
        />
      </SettingsCard>

      {/* GetHookd Settings — only relevant for competitor_swipe mode */}
      {settings.autopilot_mode === "competitor_swipe" && (
        <>
          <SectionHeader>GetHookd (Ad Spy)</SectionHeader>
          <SettingsCard>
            <Row
              label="Connection"
              description={
                gethookdTest === "ok"
                  ? gethookdInfo
                  : gethookdTest === "error"
                  ? gethookdError
                  : "Test your GetHookd API connection"
              }
              descriptionColor={
                gethookdTest === "ok"
                  ? "text-emerald-600"
                  : gethookdTest === "error"
                  ? "text-red-500"
                  : undefined
              }
              action={
                <button
                  onClick={testGethookd}
                  disabled={gethookdTest === "loading"}
                  className={`text-sm px-3.5 py-1.5 rounded-lg border transition-colors ${
                    gethookdTest === "ok"
                      ? "border-emerald-200 text-emerald-600 bg-emerald-50"
                      : gethookdTest === "error"
                      ? "border-red-200 text-red-500 bg-red-50"
                      : "border-gray-200 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100"
                  }`}
                >
                  {gethookdTest === "loading" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : gethookdTest === "ok" ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    "Test"
                  )}
                </button>
              }
            />
            <RowDivider />
            <Row
              label="Board ID"
              description="Ads you save to this GetHookd board will be swiped first"
              action={
                <input
                  type="text"
                  value={settings.gethookd_board_id}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, gethookd_board_id: e.target.value }))
                  }
                  placeholder="e.g. 12345"
                  className="w-28 bg-white border border-gray-200 text-gray-800 placeholder-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                />
              }
            />
            <RowDivider />
            <div className="py-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0 mr-4">
                  <p className="text-sm font-medium text-gray-800">Explore queries</p>
                  <p className="text-xs mt-0.5 text-gray-400">
                    Search terms for discovering ads across all niches
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newQuery}
                    onChange={(e) => setNewQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addQuery()}
                    placeholder="Add query..."
                    className="w-28 bg-white border border-gray-200 text-gray-800 placeholder-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={addQuery}
                    disabled={!newQuery.trim()}
                    className="text-sm text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>
              {settings.gethookd_explore_queries.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {settings.gethookd_explore_queries.map((q) => (
                    <span
                      key={q}
                      className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-md"
                    >
                      {q}
                      <button
                        onClick={() => removeQuery(q)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </SettingsCard>
        </>
      )}

      {/* Auto-Execution */}
      <SectionHeader>Auto-Execution (Strategy Engine)</SectionHeader>
      <SettingsCard>
        <Row
          label="Auto-kill underperformers"
          description="Automatically pause zombie and deadweight ad sets based on strategy engine rules"
          action={
            <ToggleSwitch
              checked={settings.autopilot_auto_kill}
              onChange={(v) => setSettings((s) => ({ ...s, autopilot_auto_kill: v }))}
            />
          }
        />
        <RowDivider />
        <Row
          label="Auto-adjust budgets"
          description="Automatically increase budgets on profitable campaigns (max +20% per change)"
          action={
            <ToggleSwitch
              checked={settings.autopilot_auto_budget}
              onChange={(v) => setSettings((s) => ({ ...s, autopilot_auto_budget: v }))}
            />
          }
        />
      </SettingsCard>

      <SaveButton saved={saved} onSave={handleSave} />
    </>
  );
}
