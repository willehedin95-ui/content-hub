"use client";

import { useState, useEffect } from "react";
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

interface BoardInfo {
  id: number;
  name: string;
  ad_count: number;
}

export default function AutopilotTab({ settings, setSettings, saved, handleSave }: SettingsProps) {
  const [gethookdTest, setGethookdTest] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [gethookdError, setGethookdError] = useState("");
  const [gethookdInfo, setGethookdInfo] = useState("");
  const [newQuery, setNewQuery] = useState("");
  const [availableBoards, setAvailableBoards] = useState<BoardInfo[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(false);

  // Fetch available boards when competitor_swipe mode is active
  useEffect(() => {
    if (settings.autopilot_mode !== "competitor_swipe") return;
    setBoardsLoading(true);
    fetch("/api/ad-spy/board")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.boards) setAvailableBoards(data.boards);
      })
      .catch(() => {})
      .finally(() => setBoardsLoading(false));
  }, [settings.autopilot_mode]);

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
            <div className="py-2">
              <div className="min-w-0 mr-4">
                <p className="text-sm font-medium text-gray-800">Boards</p>
                <p className="text-xs mt-0.5 text-gray-400">
                  Ads saved to these boards will be swiped first (checked in order)
                </p>
              </div>
              {settings.gethookd_board_ids.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {settings.gethookd_board_ids.map((id) => {
                    const board = availableBoards.find((b) => String(b.id) === id);
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md"
                      >
                        {board ? `${board.name} (${board.ad_count})` : `#${id}`}
                        <button
                          onClick={() =>
                            setSettings((s) => ({
                              ...s,
                              gethookd_board_ids: s.gethookd_board_ids.filter((b) => b !== id),
                            }))
                          }
                          className="text-indigo-400 hover:text-red-500 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              {availableBoards.length > 0 && (
                <div className="mt-2">
                  <select
                    value=""
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val && !settings.gethookd_board_ids.includes(val)) {
                        setSettings((s) => ({
                          ...s,
                          gethookd_board_ids: [...s.gethookd_board_ids, val],
                        }));
                      }
                    }}
                    className="bg-white border border-gray-200 text-gray-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Add board...</option>
                    {availableBoards
                      .filter((b) => !settings.gethookd_board_ids.includes(String(b.id)))
                      .map((b) => (
                        <option key={b.id} value={String(b.id)}>
                          {b.name} ({b.ad_count} ads)
                        </option>
                      ))}
                  </select>
                </div>
              )}
              {boardsLoading && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading boards...
                </div>
              )}
            </div>
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
        <RowDivider />
        <Row
          label="Auto-iterate fatiguing concepts"
          description="When a winning concept shows fatigue (high frequency or CTR drop), auto-generate fresh images and send for approval"
          action={
            <ToggleSwitch
              checked={settings.autopilot_auto_iterate}
              onChange={(v) => setSettings((s) => ({ ...s, autopilot_auto_iterate: v }))}
            />
          }
        />
      </SettingsCard>

      <SaveButton saved={saved} onSave={handleSave} />
    </>
  );
}
