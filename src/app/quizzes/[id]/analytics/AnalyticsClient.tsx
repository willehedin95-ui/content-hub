"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  Download,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  AlertTriangle,
} from "lucide-react";
import type { QuizRow, QuizData, StepNode } from "@/types/quiz";
import { topoOrderSteps } from "@/lib/quiz-graph";

// ─── Types ────────────────────────────────────────────────────────────────────

type DateRange = "today" | "last_7d" | "last_30d" | "last_90d" | "custom";

type FunnelStep = {
  step_id: string;
  sessions: number;
  dropoff_pct: number;
  median_time_sec: number;
};

type OptionRow = {
  step_id: string;
  question_el_id: string;
  option_id: string;
  option_count: number;
  option_pct_of_step: number;
  // Server-enriched labels (added 2026-05-03 to replace raw IDs in UI):
  step_name?: string;
  question_label?: string;
  option_label?: string;
};

type VariantRow = {
  variant_group_id: string;
  step_id: string;
  sessions: number;
  completion_rate: number;
  through_rate: number;
};

type Summary = {
  starts: number;
  completions: number;
  completion_rate: number;
  email_captures: number;
  median_time_to_exit_sec: number;
};

type Purchases = {
  count: number;
  revenue: number;
  currency: string | null;
  rate: number; // 0..1, purchases / starts
  aov: number;
};

type CohortRow = {
  key: string;
  sessions: number;
  completions: number;
  completion_rate: number;
  purchases: number;
  purchase_rate: number;
  revenue: number;
  aov: number;
};

type Cohorts = {
  pain: CohortRow[];
  breed: CohortRow[];
  age: CohortRow[];
  time_per_day: CohortRow[];
  device: CohortRow[];
  utm_source: CohortRow[];
  utm_campaign: CohortRow[];
};

type CommitGate = {
  counts: { commit_redo_yes: number; commit_redo_no: number; commit_time_yes: number; commit_time_no: number };
  yes_rate_q1: number;
  yes_rate_q2: number;
  paths: { yes_yes: number; yes_no: number; no_yes: number; no_no: number };
  path_purchases: { yes_yes: number; yes_no: number; no_yes: number; no_no: number };
};

type TimePattern = {
  by_hour_utc: number[];
  by_dow: number[];
  time_series: Array<{ date: string; count: number }>;
  duration_buckets: Record<string, number>;
};

type AnalyticsData = {
  summary: Summary;
  purchases?: Purchases;
  funnel: FunnelStep[];
  options: OptionRow[];
  variants: VariantRow[];
  cohorts?: Cohorts;
  commit_gate?: CommitGate;
  time_pattern?: TimePattern;
  range: { since: string; until: string };
};

type SessionRow = {
  id: string;
  started_at: string;
  completed_at: string | null;
  exit_clicked: boolean;
  device_type: string | null;
  market: string | null;
  email: string | null;
  utm: Record<string, string> | null;
  answers: Record<string, string[]> | null;
  variant_assignments: Record<string, string> | null;
};

type SessionsPage = {
  sessions: SessionRow[];
  total: number;
  page: number;
  pageSize: number;
};

type QuizEvent = {
  id: number;
  event_type: string;
  step_id: string | null;
  option_id: string | null;
  created_at: string;
  meta: Record<string, unknown> | null;
};

type SessionDetail = {
  session: SessionRow;
  events: QuizEvent[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "last_7d", label: "Last 7 days" },
  { value: "last_30d", label: "Last 30 days" },
  { value: "last_90d", label: "Last 90 days" },
  { value: "custom", label: "Custom" },
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

function sessionDuration(s: SessionRow): number | null {
  if (!s.completed_at) return null;
  return (new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 1000;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col gap-1">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-3xl font-bold text-gray-900">{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

// ─── Cohort table (pain / breed / device / utm-source) ─────────────────────────

function CohortTable({
  title,
  rows,
  currency,
  compact = false,
}: {
  title: string;
  rows: CohortRow[];
  currency: string;
  compact?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h3>
        <p className="text-xs text-gray-400 mt-3">No data in selected range.</p>
      </div>
    );
  }
  const totalSessions = rows.reduce((s, r) => s + r.sessions, 0);
  const maxSessions = Math.max(...rows.map((r) => r.sessions));
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
              <th className="text-left font-medium py-2 pr-3">Segment</th>
              <th className="text-right font-medium py-2 px-2">Sessions</th>
              <th className="text-right font-medium py-2 px-2">Compl.</th>
              <th className="text-right font-medium py-2 px-2">Compl. %</th>
              {!compact && <th className="text-right font-medium py-2 px-2">Purchases</th>}
              <th className="text-right font-medium py-2 px-2">Buy %</th>
              {!compact && <th className="text-right font-medium py-2 px-2">Revenue</th>}
              {!compact && <th className="text-right font-medium py-2 pl-2">AOV</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-gray-50 last:border-0">
                <td className="py-2 pr-3 text-gray-800">
                  <div className="flex items-center gap-2">
                    <span className="truncate max-w-[180px]">{r.key}</span>
                    <span className="text-xs text-gray-400">
                      {totalSessions ? `${Math.round((r.sessions / totalSessions) * 100)}%` : "0%"}
                    </span>
                  </div>
                  <div className="h-1 bg-gray-100 rounded-full mt-1.5 max-w-[200px]">
                    <div
                      className="h-1 bg-indigo-500 rounded-full"
                      style={{ width: `${maxSessions ? (r.sessions / maxSessions) * 100 : 0}%` }}
                    />
                  </div>
                </td>
                <td className="text-right py-2 px-2 text-gray-700 tabular-nums">{r.sessions}</td>
                <td className="text-right py-2 px-2 text-gray-700 tabular-nums">{r.completions}</td>
                <td className="text-right py-2 px-2 tabular-nums">
                  <span className={r.completion_rate >= 30 ? "text-emerald-600 font-semibold" : "text-gray-600"}>
                    {r.completion_rate.toFixed(1)}%
                  </span>
                </td>
                {!compact && (
                  <td className="text-right py-2 px-2 text-gray-700 tabular-nums">{r.purchases}</td>
                )}
                <td className="text-right py-2 px-2 tabular-nums">
                  <span className={r.purchase_rate >= 5 ? "text-emerald-600 font-semibold" : "text-gray-600"}>
                    {r.purchase_rate.toFixed(2)}%
                  </span>
                </td>
                {!compact && (
                  <td className="text-right py-2 px-2 text-gray-800 tabular-nums">
                    {r.revenue > 0 ? `${Math.round(r.revenue).toLocaleString()} ${currency}` : "-"}
                  </td>
                )}
                {!compact && (
                  <td className="text-right py-2 pl-2 text-gray-600 tabular-nums">
                    {r.aov > 0 ? Math.round(r.aov).toLocaleString() : "-"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Commit-gate panel ────────────────────────────────────────────────────────

function CommitGatePanel({ data }: { data: CommitGate }) {
  const q1Total = data.counts.commit_redo_yes + data.counts.commit_redo_no;
  const q2Total = data.counts.commit_time_yes + data.counts.commit_time_no;
  const pathRows: Array<{ path: string; sessions: number; purchases: number; rate: number; label: string }> = [
    { path: "yes_yes", label: "Yes -> Yes (high commitment)", sessions: data.paths.yes_yes, purchases: data.path_purchases.yes_yes, rate: 0 },
    { path: "yes_no", label: "Yes -> No (cooled at time)", sessions: data.paths.yes_no, purchases: data.path_purchases.yes_no, rate: 0 },
    { path: "no_yes", label: "No -> Yes (warmed up)", sessions: data.paths.no_yes, purchases: data.path_purchases.no_yes, rate: 0 },
    { path: "no_no", label: "No -> No (low commitment)", sessions: data.paths.no_no, purchases: data.path_purchases.no_no, rate: 0 },
  ].map((r) => ({ ...r, rate: r.sessions ? (r.purchases / r.sessions) * 100 : 0 }));
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Commit-gate flow</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="border border-gray-100 rounded-lg p-4">
          <div className="text-xs uppercase tracking-wide text-gray-400">Modal 1 - "Är du redo?"</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{data.yes_rate_q1.toFixed(1)}% yes</div>
          <div className="text-xs text-gray-500 mt-1">
            {data.counts.commit_redo_yes} Ja  /  {data.counts.commit_redo_no} Behöver tänka  ({q1Total} total)
          </div>
        </div>
        <div className="border border-gray-100 rounded-lg p-4">
          <div className="text-xs uppercase tracking-wide text-gray-400">Modal 2 - "Kan du investera tiden?"</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{data.yes_rate_q2.toFixed(1)}% yes</div>
          <div className="text-xs text-gray-500 mt-1">
            {data.counts.commit_time_yes} Ja  /  {data.counts.commit_time_no} Behöver tänka  ({q2Total} total)
          </div>
        </div>
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">Path purchase rate</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-100">
              <th className="text-left font-medium py-2">Path</th>
              <th className="text-right font-medium py-2 px-2">Sessions</th>
              <th className="text-right font-medium py-2 px-2">Purchases</th>
              <th className="text-right font-medium py-2 pl-2">Buy %</th>
            </tr>
          </thead>
          <tbody>
            {pathRows.map((r) => (
              <tr key={r.path} className="border-b border-gray-50 last:border-0">
                <td className="py-2 text-gray-700">{r.label}</td>
                <td className="text-right py-2 px-2 tabular-nums">{r.sessions}</td>
                <td className="text-right py-2 px-2 tabular-nums">{r.purchases}</td>
                <td className="text-right py-2 pl-2 tabular-nums">
                  <span className={r.rate >= 5 ? "text-emerald-600 font-semibold" : "text-gray-600"}>
                    {r.rate.toFixed(2)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Time pattern panel ───────────────────────────────────────────────────────

function TimePatternPanel({ data }: { data: TimePattern }) {
  const dowNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const maxHour = Math.max(1, ...data.by_hour_utc);
  const maxDow = Math.max(1, ...data.by_dow);
  const maxDay = Math.max(1, ...data.time_series.map((d) => d.count));
  const durLabels: Record<string, string> = {
    lt30: "< 30s",
    "30-60": "30-60s",
    "60-120": "1-2 min",
    "120-300": "2-5 min",
    "300-600": "5-10 min",
    gt600: "> 10 min",
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Time patterns</h3>

      {data.time_series.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">Sessions per day</div>
          <div className="flex items-end gap-1 h-24">
            {data.time_series.map((d) => (
              <div
                key={d.date}
                className="flex-1 flex flex-col items-center justify-end gap-1"
                title={`${d.date}: ${d.count}`}
              >
                <div
                  className="w-full bg-indigo-500 rounded-t"
                  style={{ height: `${(d.count / maxDay) * 100}%`, minHeight: d.count ? 2 : 0 }}
                />
                <span className="text-[10px] text-gray-400">{d.date.slice(8)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">By hour of day (UTC)</div>
          <div className="flex items-end gap-0.5 h-20">
            {data.by_hour_utc.map((c, h) => (
              <div key={h} className="flex-1 flex flex-col items-center" title={`${h}h: ${c}`}>
                <div
                  className="w-full bg-emerald-500 rounded-t"
                  style={{ height: `${(c / maxHour) * 100}%`, minHeight: c ? 2 : 0 }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">By day of week</div>
          <div className="flex items-end gap-2 h-20">
            {data.by_dow.map((c, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${dowNames[i]}: ${c}`}>
                <div
                  className="w-full bg-amber-500 rounded-t"
                  style={{ height: `${(c / maxDow) * 100}%`, minHeight: c ? 2 : 0 }}
                />
                <span className="text-[10px] text-gray-500">{dowNames[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">Completion duration distribution</div>
        <div className="grid grid-cols-6 gap-2">
          {Object.entries(data.duration_buckets).map(([k, v]) => {
            const max = Math.max(1, ...Object.values(data.duration_buckets));
            return (
              <div key={k} className="flex flex-col items-center gap-1">
                <div className="text-xs font-bold text-gray-800">{v}</div>
                <div className="w-full h-12 bg-gray-100 rounded relative overflow-hidden">
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-purple-500"
                    style={{ height: `${(v / max) * 100}%` }}
                  />
                </div>
                <div className="text-[10px] text-gray-500">{durLabels[k] ?? k}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Funnel Drop-off Chart ────────────────────────────────────────────────────

function FunnelChart({
  funnel,
  data,
}: {
  funnel: FunnelStep[];
  data: QuizData;
}) {
  const ordered = topoOrderSteps(data);
  // Map step_id -> funnel row
  const byId = new Map(funnel.map((f) => [f.step_id, f]));
  // Filter only steps that have data, in topo order
  const steps = ordered.filter((s) => byId.has(s.id));

  if (steps.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm">
        No funnel data yet. Publish and share your quiz to see dropoff.
      </div>
    );
  }

  const maxSessions = Math.max(...steps.map((s) => byId.get(s.id)!.sessions), 1);

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-3 min-w-max pb-4">
        {steps.map((step, idx) => {
          const row = byId.get(step.id)!;
          const heightPct = (row.sessions / maxSessions) * 100;
          const nextRow = idx < steps.length - 1 ? byId.get(steps[idx + 1].id) : null;
          const dropPct =
            nextRow && row.sessions > 0
              ? Math.round(((row.sessions - nextRow.sessions) / row.sessions) * 100)
              : null;

          return (
            <div key={step.id} className="flex flex-col items-center gap-1" style={{ width: 100 }}>
              {/* Bar */}
              <div className="relative flex flex-col justify-end" style={{ height: 180 }}>
                <div
                  className="w-16 bg-indigo-500 rounded-t-md transition-all"
                  style={{ height: `${Math.max(heightPct, 2)}%` }}
                />
                {/* Session count label */}
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-semibold text-gray-700 whitespace-nowrap">
                  {row.sessions.toLocaleString()}
                </span>
              </div>

              {/* Drop arrow between bars */}
              {dropPct !== null && (
                <div className="absolute ml-24 -translate-y-12 flex flex-col items-center">
                  <span className="text-xs font-medium text-red-500">-{dropPct}%</span>
                </div>
              )}

              {/* Step name */}
              <span className="text-xs text-gray-600 text-center line-clamp-2 max-w-[96px]">
                {step.name}
              </span>
              {/* Median time */}
              {row.median_time_sec > 0 && (
                <span className="text-xs text-gray-400">
                  {fmtDuration(row.median_time_sec)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Drop % annotations between bars */}
      {steps.length > 1 && (
        <div className="flex gap-3 min-w-max mt-1">
          {steps.map((step, idx) => {
            if (idx === steps.length - 1) return <div key={step.id} style={{ width: 100 }} />;
            const row = byId.get(step.id)!;
            const nextRow = byId.get(steps[idx + 1].id);
            const dropPct =
              nextRow && row.sessions > 0
                ? Math.round(((row.sessions - nextRow.sessions) / row.sessions) * 100)
                : null;
            return (
              <div key={step.id} className="flex items-center justify-end" style={{ width: 100 }}>
                {dropPct !== null && dropPct > 0 && (
                  <span className="text-xs font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                    -{dropPct}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Option Distribution ──────────────────────────────────────────────────────

function OptionDistribution({
  options,
  data,
}: {
  options: OptionRow[];
  data: QuizData;
}) {
  if (options.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No answer data yet.
      </div>
    );
  }

  // Group by step_id + question_el_id
  type GroupKey = `${string}::${string}`;
  const groups = new Map<GroupKey, OptionRow[]>();
  for (const opt of options) {
    const key: GroupKey = `${opt.step_id}::${opt.question_el_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(opt);
  }

  // Prefer server-enriched labels (resolved against current quiz_data on
  // the API side, where legacy events are also filtered). Fall back to
  // local quiz.data lookup for older API responses.
  function stepName(stepId: string, fallback?: string): string {
    if (fallback) return fallback;
    const node = data.nodes[stepId];
    return node && node.kind === "step" ? node.name : stepId;
  }

  function optionLabel(stepId: string, optionId: string, fallback?: string): string {
    if (fallback) return fallback;
    const node = data.nodes[stepId];
    if (!node || node.kind !== "step") return optionId;
    for (const el of node.subEls) {
      if (el.kind === "question") {
        const opt = el.options.find((o) => o.id === optionId);
        if (opt) return opt.label;
      }
    }
    return optionId;
  }

  const COLORS = [
    "bg-indigo-500",
    "bg-violet-500",
    "bg-blue-500",
    "bg-sky-500",
    "bg-teal-500",
    "bg-emerald-500",
    "bg-amber-500",
  ];

  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([key, rows]) => {
        const [stepId] = key.split("::");
        const total = rows.reduce((s, r) => s + r.option_count, 0);
        const enrichedStep = rows[0]?.step_name;
        // Sort options by count desc so most-picked is on top
        const sorted = [...rows].sort((a, b) => b.option_count - a.option_count);
        return (
          <div key={key} className="space-y-2">
            <div className="text-sm font-medium text-gray-700">
              {stepName(stepId, enrichedStep)}
              <span className="text-xs font-normal text-gray-400 ml-2">
                ({total.toLocaleString()} answers)
              </span>
            </div>
            <div className="space-y-1.5">
              {sorted.map((r, i) => (
                <div key={r.option_id} className="flex items-center gap-2">
                  <span className="text-xs text-gray-700 w-44 truncate shrink-0" title={optionLabel(stepId, r.option_id, r.option_label)}>
                    {optionLabel(stepId, r.option_id, r.option_label)}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${COLORS[i % COLORS.length]}`}
                      style={{ width: `${r.option_pct_of_step}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-12 text-right shrink-0 tabular-nums">
                    {r.option_count}
                  </span>
                  <span className="text-xs font-semibold text-gray-700 w-12 text-right shrink-0 tabular-nums">
                    {r.option_pct_of_step.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Variant Comparison ───────────────────────────────────────────────────────

function VariantComparison({
  variants,
  data,
}: {
  variants: VariantRow[];
  data: QuizData;
}) {
  if (variants.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No A/B variant data yet.
      </div>
    );
  }

  // Group by variant_group_id
  const groups = new Map<string, VariantRow[]>();
  for (const v of variants) {
    if (!groups.has(v.variant_group_id)) groups.set(v.variant_group_id, []);
    groups.get(v.variant_group_id)!.push(v);
  }

  const LETTERS = ["A", "B", "C", "D", "E"];

  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([groupId, rows]) => {
        const leader = [...rows].sort((a, b) => b.completion_rate - a.completion_rate)[0];
        return (
          <div key={groupId} className="space-y-2">
            <div className="text-sm font-medium text-gray-600">Variant Group</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {rows.map((row, i) => {
                const node = data.nodes[row.step_id];
                const name = node && node.kind === "step" ? node.name : row.step_id;
                const isLeader = row.step_id === leader.step_id;
                return (
                  <div
                    key={row.step_id}
                    className={`border rounded-xl p-4 flex flex-col gap-2 ${
                      isLeader ? "border-green-300 bg-green-50" : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-800">
                        {LETTERS[i] ?? String(i + 1)}
                      </span>
                      {isLeader && <Check className="w-4 h-4 text-green-600" />}
                    </div>
                    <span className="text-xs text-gray-500 truncate">{name}</span>
                    <div className="space-y-1 mt-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Sessions</span>
                        <span className="font-semibold text-gray-800">
                          {row.sessions.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Completion</span>
                        <span className="font-semibold text-gray-800">
                          {row.completion_rate}%
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Through</span>
                        <span className="font-semibold text-gray-800">
                          {row.through_rate}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Session Detail Drawer ────────────────────────────────────────────────────

function SessionDrawer({
  quizId,
  sessionId,
  data: quizData,
  onClose,
}: {
  quizId: string;
  sessionId: string;
  data: QuizData;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/quiz/${quizId}/sessions/${sessionId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: SessionDetail) => setDetail(d))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [quizId, sessionId]);

  function stepName(stepId: string | null): string {
    if (!stepId) return "(unknown)";
    const node = quizData.nodes[stepId];
    return node && node.kind === "step" ? node.name : stepId;
  }

  function optionLabel(stepId: string | null, optId: string | null): string {
    if (!stepId || !optId) return optId ?? "";
    const node = quizData.nodes[stepId];
    if (!node || node.kind !== "step") return optId;
    for (const el of node.subEls) {
      if (el.kind === "question") {
        const opt = el.options.find((o) => o.id === optId);
        if (opt) return opt.label;
      }
    }
    return optId;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white shadow-2xl overflow-y-auto flex flex-col h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h3 className="font-semibold text-gray-900">Session Detail</h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {loading && <p className="text-sm text-gray-500">Loading...</p>}
          {error && <p className="text-sm text-red-600">Error: {error}</p>}
          {detail && (
            <>
              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-400 text-xs block">Status</span>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      detail.session.exit_clicked
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {detail.session.exit_clicked ? "Completed" : "Abandoned"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 text-xs block">Device</span>
                  <span className="text-gray-800 capitalize">
                    {detail.session.device_type ?? "Unknown"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 text-xs block">Started</span>
                  <span className="text-gray-800">
                    {fmtDate(detail.session.started_at)} {fmtTime(detail.session.started_at)}
                  </span>
                </div>
                {detail.session.completed_at && (
                  <div>
                    <span className="text-gray-400 text-xs block">Duration</span>
                    <span className="text-gray-800">
                      {fmtDuration(sessionDuration(detail.session) ?? 0)}
                    </span>
                  </div>
                )}
                {detail.session.email && (
                  <div className="col-span-2">
                    <span className="text-gray-400 text-xs block">Email</span>
                    <span className="text-gray-800">{detail.session.email}</span>
                  </div>
                )}
                {detail.session.market && (
                  <div>
                    <span className="text-gray-400 text-xs block">Market</span>
                    <span className="text-gray-800 uppercase">{detail.session.market}</span>
                  </div>
                )}
              </div>

              {/* UTM */}
              {detail.session.utm && Object.keys(detail.session.utm).length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    UTM
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                    {Object.entries(detail.session.utm).map(([k, v]) => (
                      <div key={k} className="flex gap-2 text-xs">
                        <span className="text-gray-400 w-24 shrink-0">{k}</span>
                        <span className="text-gray-800">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Answers */}
              {detail.session.answers && Object.keys(detail.session.answers).length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Answers
                  </div>
                  <div className="space-y-2">
                    {Object.entries(detail.session.answers).map(([qId, vals]) => (
                      <div key={qId} className="text-sm">
                        <span className="text-gray-500 text-xs block">{qId}</span>
                        <span className="text-gray-800">
                          {(Array.isArray(vals) ? vals : [vals])
                            .map((v) => optionLabel(null, v))
                            .join(", ")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Variant assignments */}
              {detail.session.variant_assignments &&
                Object.keys(detail.session.variant_assignments).length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Variant Assignments
                    </div>
                    <div className="space-y-1">
                      {Object.entries(detail.session.variant_assignments).map(([gId, sId]) => (
                        <div key={gId} className="flex gap-2 text-xs">
                          <span className="text-gray-400 flex-1 truncate">{gId}</span>
                          <span className="text-gray-800">{stepName(sId)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Event trail */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Event Trail
                </div>
                <div className="space-y-1.5">
                  {detail.events.map((evt) => (
                    <div
                      key={evt.id}
                      className="flex items-start gap-2 text-xs bg-gray-50 rounded px-3 py-2"
                    >
                      <span className="text-gray-400 shrink-0 mt-0.5">
                        {fmtTime(evt.created_at)}
                      </span>
                      <span className="text-indigo-600 font-medium shrink-0">
                        {evt.event_type}
                      </span>
                      {evt.step_id && (
                        <span className="text-gray-600 truncate">{stepName(evt.step_id)}</span>
                      )}
                      {evt.option_id && (
                        <span className="text-gray-500 italic truncate">
                          {optionLabel(evt.step_id, evt.option_id)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Reset Analytics Dialog ───────────────────────────────────────────────────

function ResetDialog({
  quizId,
  onDone,
  onCancel,
}: {
  quizId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [counts, setCounts] = useState<{ sessions: number; events: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Pre-fetch counts
  useEffect(() => {
    fetch(`/api/quiz/${quizId}/sessions?page=1&status=all`)
      .then((r) => r.json())
      .then((d: SessionsPage) => {
        setCounts({ sessions: d.total, events: 0 });
      })
      .catch(() => setCounts({ sessions: 0, events: 0 }));
  }, [quizId]);

  async function handleReset() {
    if (!confirmed) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/quiz/${quizId}/reset-analytics`, { method: "POST" });
      if (res.ok) {
        onDone();
      } else {
        const err = await res.json();
        alert(`Reset failed: ${err.error}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-red-500 shrink-0" />
          <h3 className="text-lg font-semibold text-gray-900">Reset Analytics Data</h3>
        </div>
        <p className="text-sm text-gray-700 mb-2">
          This will permanently delete{" "}
          <strong>
            {counts ? `${counts.sessions.toLocaleString()} sessions` : "all sessions"}
          </strong>{" "}
          and all associated events for this quiz.{" "}
          <span className="font-bold text-red-600">This cannot be undone.</span>
        </p>
        <p className="text-sm text-gray-600 mb-4">
          Use this when republishing after major copy changes so dropoff baselines reset cleanly.
        </p>
        <label className="flex items-center gap-2 text-sm text-gray-700 mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="rounded border-gray-300 text-red-600 focus:ring-red-500"
          />
          I understand this permanently deletes all analytics data
        </label>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleReset}
            disabled={!confirmed || loading}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Deleting..." : "Delete All Data"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sessions Table ───────────────────────────────────────────────────────────

function SessionsTable({
  quizId,
  data: quizData,
}: {
  quizId: string;
  data: QuizData;
}) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"all" | "completed" | "abandoned">("all");
  const [sessionsData, setSessionsData] = useState<SessionsPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [drawerSessionId, setDrawerSessionId] = useState<string | null>(null);

  const load = useCallback(
    (p: number, s: typeof status) => {
      setLoading(true);
      fetch(`/api/quiz/${quizId}/sessions?page=${p}&status=${s}`)
        .then((r) => r.json())
        .then((d: SessionsPage) => {
          setSessionsData(d);
          setPage(p);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    },
    [quizId],
  );

  useEffect(() => {
    load(1, status);
  }, [load, status]);

  const totalPages = sessionsData ? Math.ceil(sessionsData.total / sessionsData.pageSize) : 0;

  function stepCountForSession(session: SessionRow): number {
    const steps = Object.values(quizData.nodes).filter((n) => n.kind === "step").length;
    const answers = session.answers ? Object.keys(session.answers).length : 0;
    return answers;
  }

  function progressPct(session: SessionRow): number {
    const total = Object.values(quizData.nodes).filter((n) => n.kind === "step").length;
    if (total === 0) return 0;
    const done = stepCountForSession(session);
    return Math.min(100, Math.round((done / total) * 100));
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="text-xs border border-gray-200 rounded px-2 py-1.5 text-gray-700 bg-white"
        >
          <option value="all">All sessions</option>
          <option value="completed">Completed</option>
          <option value="abandoned">Abandoned</option>
        </select>
        <a
          href={`/api/quiz/${quizId}/sessions/export`}
          download
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download size={12} />
          Export CSV
        </a>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Timestamp
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Status
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Progress
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-gray-400 text-sm">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && (!sessionsData || sessionsData.sessions.length === 0) && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-gray-400 text-sm">
                  No sessions found.
                </td>
              </tr>
            )}
            {!loading &&
              sessionsData?.sessions.map((session) => {
                const pct = progressPct(session);
                const dur = sessionDuration(session);
                return (
                  <tr
                    key={session.id}
                    className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="text-xs text-gray-700">
                        {fmtDate(session.started_at)}
                      </div>
                      <div className="text-xs text-gray-400">
                        {fmtTime(session.started_at)}
                        {dur !== null && ` - ${fmtDuration(dur)}`}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          session.exit_clicked
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {session.exit_clicked ? "Completed" : "Abandoned"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-[80px] overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setDrawerSessionId(session.id)}
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            {sessionsData
              ? `${((page - 1) * (sessionsData.pageSize ?? 20) + 1).toLocaleString()} - ${Math.min(
                  page * (sessionsData.pageSize ?? 20),
                  sessionsData.total,
                ).toLocaleString()} of ${sessionsData.total.toLocaleString()}`
              : ""}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => load(page - 1, status)}
              disabled={page <= 1}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => load(page + 1, status)}
              disabled={page >= totalPages}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Session detail drawer */}
      {drawerSessionId && (
        <SessionDrawer
          quizId={quizId}
          sessionId={drawerSessionId}
          data={quizData}
          onClose={() => setDrawerSessionId(null)}
        />
      )}
    </div>
  );
}

// ─── Main Analytics Client ────────────────────────────────────────────────────

export function AnalyticsClient({ quiz }: { quiz: QuizRow }) {
  const [range, setRange] = useState<DateRange>("last_30d");
  const [device, setDevice] = useState("all");
  const [customSince, setCustomSince] = useState("");
  const [customUntil, setCustomUntil] = useState("");
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);

  // Variant groups from quiz data
  const variantGroups = Array.from(
    new Set(
      Object.values(quiz.data.nodes)
        .filter((n): n is StepNode => n.kind === "step" && !!n.variantGroupId)
        .map((n) => n.variantGroupId!),
    ),
  );

  const [variantFilter, setVariantFilter] = useState<string>("all");

  const fetchAnalytics = useCallback(() => {
    setLoading(true);
    setError(null);

    let url = `/api/quiz/${quiz.id}/analytics?range=${range}&device=${device}`;
    if (range === "custom" && customSince && customUntil) {
      url += `&since=${customSince}&until=${customUntil}`;
    }
    if (variantFilter !== "all") {
      url += `&variant_group=${variantFilter}`;
    }

    fetch(url)
      .then((r) =>
        r.ok ? r.json() : r.json().then((e: { error: string }) => Promise.reject(new Error(e.error))),
      )
      .then((d: AnalyticsData) => setAnalyticsData(d))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [quiz.id, range, device, customSince, customUntil, variantFilter]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const summary = analyticsData?.summary;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/quizzes"
              className="p-2 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 text-gray-500 transition-colors"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <BarChart3 size={20} className="text-indigo-500" />
                {quiz.name}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">Analytics</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/quizzes/${quiz.id}/edit`}
              className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-white transition-colors"
            >
              Open Editor
            </Link>
            <button
              onClick={() => setShowReset(true)}
              className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              Reset Analytics Data
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as DateRange)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {DATE_RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>

          {range === "custom" && (
            <>
              <input
                type="date"
                value={customSince}
                onChange={(e) => setCustomSince(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700"
              />
              <span className="text-gray-400 text-sm">to</span>
              <input
                type="date"
                value={customUntil}
                onChange={(e) => setCustomUntil(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700"
              />
            </>
          )}

          <select
            value={device}
            onChange={(e) => setDevice(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All devices</option>
            <option value="mobile">Mobile</option>
            <option value="tablet">Tablet</option>
            <option value="desktop">Desktop</option>
          </select>

          {variantGroups.length > 0 && (
            <select
              value={variantFilter}
              onChange={(e) => setVariantFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All variants</option>
              {variantGroups.map((gId) => (
                <option key={gId} value={gId}>
                  Group {gId.slice(-6)}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={fetchAnalytics}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-white transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>

          {analyticsData?.range && (
            <span className="text-xs text-gray-400">
              {fmtDate(analyticsData.range.since)} - {fmtDate(analyticsData.range.until)}
            </span>
          )}
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            Failed to load analytics: {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !analyticsData && (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-6 animate-pulse">
                <div className="h-3 w-20 bg-gray-200 rounded mb-3" />
                <div className="h-8 w-16 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* KPI row */}
        {summary !== undefined && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              label="Quiz Starts"
              value={summary.starts.toLocaleString()}
            />
            <KpiCard
              label="Quiz Completions"
              value={summary.completions.toLocaleString()}
            />
            <KpiCard
              label="Completion Rate"
              value={`${summary.completion_rate}%`}
              sub={`Median time: ${fmtDuration(summary.median_time_to_exit_sec)}`}
            />
          </div>
        )}

        {/* Purchase KPI row - only renders when the Shopify webhook has
            attributed at least one order back to a quiz session */}
        {analyticsData?.purchases && analyticsData.purchases.count > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              label="Purchases"
              value={analyticsData.purchases.count.toLocaleString()}
              sub={`From ${summary?.starts.toLocaleString() ?? 0} starts`}
            />
            <KpiCard
              label="Revenue"
              value={`${Math.round(analyticsData.purchases.revenue).toLocaleString()} ${analyticsData.purchases.currency ?? ""}`.trim()}
              sub={`AOV ${Math.round(analyticsData.purchases.aov).toLocaleString()} ${analyticsData.purchases.currency ?? ""}`}
            />
            <KpiCard
              label="Purchase Rate"
              value={`${(analyticsData.purchases.rate * 100).toFixed(2)}%`}
              sub={`${analyticsData.purchases.count} of ${summary?.starts ?? 0}`}
            />
          </div>
        )}

        {/* Funnel Drop-off Chart (moved to top - most-used metric) */}
        {analyticsData && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-5 uppercase tracking-wide">
              Funnel Drop-off
            </h2>
            <FunnelChart funnel={analyticsData.funnel} data={quiz.data} />
          </div>
        )}

        {/* Cohorts: by primary_pain / breed / device / utm_source / utm_campaign */}
        {analyticsData?.cohorts && (
          <div className="space-y-4">
            <CohortTable title="By primary pain" rows={analyticsData.cohorts.pain} currency={analyticsData.purchases?.currency ?? "SEK"} />
            <CohortTable title="By breed (top 12)" rows={analyticsData.cohorts.breed.slice(0, 12)} currency={analyticsData.purchases?.currency ?? "SEK"} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <CohortTable title="By time per day" rows={analyticsData.cohorts.time_per_day} currency={analyticsData.purchases?.currency ?? "SEK"} compact />
              <CohortTable title="By age" rows={analyticsData.cohorts.age} currency={analyticsData.purchases?.currency ?? "SEK"} compact />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <CohortTable title="By device" rows={analyticsData.cohorts.device} currency={analyticsData.purchases?.currency ?? "SEK"} compact />
              <CohortTable title="By traffic source" rows={analyticsData.cohorts.utm_source} currency={analyticsData.purchases?.currency ?? "SEK"} compact />
            </div>
            {analyticsData.cohorts.utm_campaign.length > 0 && (
              <CohortTable title="By campaign" rows={analyticsData.cohorts.utm_campaign} currency={analyticsData.purchases?.currency ?? "SEK"} />
            )}
          </div>
        )}

        {/* Commit-gate flow */}
        {analyticsData?.commit_gate && (analyticsData.commit_gate.counts.commit_redo_yes + analyticsData.commit_gate.counts.commit_redo_no) > 0 && (
          <CommitGatePanel data={analyticsData.commit_gate} />
        )}

        {/* Time-of-day + day-of-week + duration histograms */}
        {analyticsData?.time_pattern && (
          <TimePatternPanel data={analyticsData.time_pattern} />
        )}

        {/* Completion funnel: big 3 numbers */}
        {summary !== undefined && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-5 uppercase tracking-wide">
              Completion Funnel
            </h2>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="text-center px-6">
                <div className="text-3xl font-bold text-gray-900">
                  {summary.starts.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">Started</div>
              </div>
              <div className="flex flex-col items-center text-gray-400">
                <div className="text-sm font-semibold text-indigo-500">
                  {summary.starts > 0
                    ? `${Math.round((summary.email_captures / summary.starts) * 100)}%`
                    : "0%"}
                </div>
                <div className="w-8 h-px bg-gray-300 my-1" />
              </div>
              <div className="text-center px-6">
                <div className="text-3xl font-bold text-gray-900">
                  {summary.email_captures.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">Email Captured</div>
              </div>
              <div className="flex flex-col items-center text-gray-400">
                <div className="text-sm font-semibold text-indigo-500">
                  {summary.starts > 0
                    ? `${Math.round((summary.completions / summary.starts) * 100)}%`
                    : "0%"}
                </div>
                <div className="w-8 h-px bg-gray-300 my-1" />
              </div>
              <div className="text-center px-6">
                <div className="text-3xl font-bold text-gray-900">
                  {summary.completions.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">Exit Clicked</div>
              </div>
            </div>
          </div>
        )}

        {/* Option Distribution */}
        {analyticsData && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-5 uppercase tracking-wide">
              Option Distribution
            </h2>
            <OptionDistribution options={analyticsData.options} data={quiz.data} />
          </div>
        )}

        {/* Variant Comparison */}
        {analyticsData && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-5 uppercase tracking-wide">
              A/B Variant Comparison
            </h2>
            <VariantComparison variants={analyticsData.variants} data={quiz.data} />
          </div>
        )}

        {/* Customer Responses Table */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-5 uppercase tracking-wide">
            Customer Responses
          </h2>
          <SessionsTable quizId={quiz.id} data={quiz.data} />
        </div>
      </div>

      {/* Reset dialog */}
      {showReset && (
        <ResetDialog
          quizId={quiz.id}
          onDone={() => {
            setShowReset(false);
            fetchAnalytics();
          }}
          onCancel={() => setShowReset(false)}
        />
      )}
    </div>
  );
}
