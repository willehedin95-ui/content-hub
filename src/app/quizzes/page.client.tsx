"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Globe, Copy, Archive } from "lucide-react";
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
