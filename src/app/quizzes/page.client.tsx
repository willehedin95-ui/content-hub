"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Globe, Copy, Archive, BarChart3 } from "lucide-react";
import type { QuizRow } from "@/types/quiz";

const MARKET_LABELS: Record<string, string> = {
  se: "SE",
  dk: "DK",
  no: "NO",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  published: "bg-green-100 text-green-700",
  archived: "bg-orange-100 text-orange-700",
};

const KPI_RANGES = [
  { value: "today", label: "Today" },
  { value: "last_7d", label: "Last 7 days" },
  { value: "last_30d", label: "Last 30 days" },
  { value: "last_90d", label: "Last 90 days" },
] as const;

type KpiRange = (typeof KPI_RANGES)[number]["value"];

type QuizKpi = {
  quiz_id: string;
  starts: number;
  completions: number;
  completion_rate: number;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function KpiRow({ kpi }: { kpi: QuizKpi | undefined }) {
  if (!kpi) {
    return (
      <div className="text-xs text-gray-400 py-1">
        No data yet
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 text-xs text-gray-500 py-1">
      <span>
        <span className="font-medium text-gray-700">{kpi.starts.toLocaleString()}</span>
        {" "}starts
      </span>
      <span className="text-gray-300">|</span>
      <span>
        <span className="font-medium text-gray-700">{kpi.completions.toLocaleString()}</span>
        {" "}done
      </span>
      <span className="text-gray-300">|</span>
      <span>
        <span className="font-medium text-indigo-600">{kpi.completion_rate}%</span>
      </span>
    </div>
  );
}

export function QuizzesClient({
  initialRows,
  workspaceId,
}: {
  initialRows: QuizRow[];
  workspaceId: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<QuizRow[]>(initialRows);
  const [creating, setCreating] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [kpiRange, setKpiRange] = useState<KpiRange>("last_30d");
  const [kpis, setKpis] = useState<QuizKpi[]>([]);
  const [kpisLoading, setKpisLoading] = useState(false);

  // Fetch KPIs when range changes or rows change
  useEffect(() => {
    if (rows.length === 0) return;
    setKpisLoading(true);
    fetch(`/api/quizzes/kpis?range=${kpiRange}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: QuizKpi[]) => setKpis(data))
      .catch(() => setKpis([]))
      .finally(() => setKpisLoading(false));
  }, [kpiRange, rows]);

  function kpiFor(quizId: string): QuizKpi | undefined {
    return kpis.find((k) => k.quiz_id === quizId);
  }

  async function createQuiz(market: "se" | "dk" | "no") {
    setCreating(market);
    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          market,
          name: `New Quiz ${market.toUpperCase()}`,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Failed to create quiz: ${err.error}`);
        return;
      }
      const created = (await res.json()) as QuizRow;
      router.push(`/quizzes/${created.id}/edit`);
    } finally {
      setCreating(null);
    }
  }

  async function duplicateQuiz(id: string) {
    setActionLoading(`dup-${id}`);
    try {
      const res = await fetch(`/api/quiz/${id}/duplicate`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        alert(`Failed to duplicate: ${err.error}`);
        return;
      }
      const copy = (await res.json()) as QuizRow;
      setRows((prev) => [copy, ...prev]);
    } finally {
      setActionLoading(null);
    }
  }

  async function archiveQuiz(id: string) {
    if (!confirm("Archive this quiz?")) return;
    setActionLoading(`arc-${id}`);
    try {
      const res = await fetch(`/api/quiz/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        alert(`Failed to archive: ${err.error}`);
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Quiz Funnels</h1>
          <p className="text-sm text-gray-500 mt-1">
            Build and manage quiz funnels for each market.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["se", "dk", "no"] as const).map((market) => (
            <button
              key={market}
              onClick={() => createQuiz(market)}
              disabled={creating !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {creating === market ? "Creating..." : market.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* KPI range selector */}
      {rows.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-gray-500">Show KPIs for:</span>
          <select
            value={kpiRange}
            onChange={(e) => setKpiRange(e.target.value as KpiRange)}
            className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {KPI_RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          {kpisLoading && (
            <span className="text-xs text-gray-400">Loading...</span>
          )}
        </div>
      )}

      {/* Grid */}
      {rows.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Globe className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No quizzes yet. Create one above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {rows.map((row) => (
            <div
              key={row.id}
              className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3 hover:border-indigo-300 transition-colors group"
            >
              {/* Market badge + status */}
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 uppercase tracking-wide">
                  {MARKET_LABELS[row.market] ?? row.market}
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[row.status] ?? "bg-gray-100 text-gray-600"}`}
                >
                  {row.status}
                </span>
              </div>

              {/* Name */}
              <button
                className="text-left font-medium text-gray-900 text-sm leading-snug hover:text-indigo-700 transition-colors line-clamp-2"
                onClick={() => router.push(`/quizzes/${row.id}/edit`)}
              >
                {row.name}
              </button>

              {/* KPI row */}
              <KpiRow kpi={kpiFor(row.id)} />

              {/* Updated date */}
              <p className="text-xs text-gray-400 mt-auto">
                Updated {formatDate(row.updated_at)}
              </p>

              {/* Actions */}
              <div className="flex items-center gap-1 pt-1 border-t border-gray-100">
                <button
                  onClick={() => router.push(`/quizzes/${row.id}/edit`)}
                  className="flex-1 text-xs text-gray-500 hover:text-indigo-700 py-1 rounded hover:bg-indigo-50 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => router.push(`/quizzes/${row.id}/analytics`)}
                  title="Analytics"
                  className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => duplicateQuiz(row.id)}
                  disabled={actionLoading === `dup-${row.id}`}
                  title="Duplicate"
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => archiveQuiz(row.id)}
                  disabled={actionLoading === `arc-${row.id}`}
                  title="Archive"
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                >
                  <Archive className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
