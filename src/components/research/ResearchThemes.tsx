"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  MessageSquareQuote,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronRight,
  Download,
  ArrowUpDown,
  Database,
} from "lucide-react";

interface Theme {
  id: string;
  name: string;
  description: string | null;
  theme_type: string;
  strength: string;
  evidence_count: number;
  tags: string[];
  example_phrases: string[];
  copy_implications: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  pain_point: { label: "Pain Point", color: "text-red-600" },
  desire: { label: "Desire", color: "text-green-600" },
  objection: { label: "Objection", color: "text-amber-600" },
  competitor_weakness: { label: "Competitor Weakness", color: "text-purple-600" },
  trend: { label: "Trend", color: "text-blue-600" },
  language_pattern: { label: "Language Pattern", color: "text-indigo-600" },
  pattern: { label: "Pattern", color: "text-gray-600" },
};

type SortKey = "evidence" | "recent";
type TypeFilter = string; // "" means all

export default function ResearchThemes() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("evidence");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("");
  const [exporting, setExporting] = useState(false);

  const fetchThemes = useCallback(() => {
    fetch("/api/research/themes")
      .then((r) => r.json())
      .then((data) => setThemes(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchThemes();
  }, [fetchThemes]);

  const handleDetect = async () => {
    setDetecting(true);
    setDetectResult(null);
    try {
      const res = await fetch("/api/research/themes/detect", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setDetectResult({ ok: false, msg: data.error ?? "Detection failed" });
      } else {
        setDetectResult({
          ok: true,
          msg: `${data.themesCreated} new, ${data.themesUpdated} updated`,
        });
        fetchThemes();
      }
    } catch {
      setDetectResult({ ok: false, msg: "Network error" });
    } finally {
      setDetecting(false);
      setTimeout(() => setDetectResult(null), 8000);
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Sort & filter
  const sortedThemes = [...themes]
    .filter((t) => (typeFilter ? t.theme_type === typeFilter : true))
    .sort((a, b) => {
      switch (sortBy) {
        case "evidence":
          return b.evidence_count - a.evidence_count;
        case "recent":
          return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
        default:
          return 0;
      }
    });

  // Unique types for filter
  const availableTypes = [...new Set(themes.map((t) => t.theme_type))];

  const exportCsv = () => {
    setExporting(true);
    try {
      const header = "Name,Type,Mentions,Description,Copy Implications,Example Phrases\n";
      const rows = sortedThemes.map((t) =>
        [
          `"${t.name.replace(/"/g, '""')}"`,
          TYPE_CONFIG[t.theme_type]?.label ?? t.theme_type,
          t.evidence_count,
          `"${(t.description ?? "").replace(/"/g, '""')}"`,
          `"${(t.copy_implications ?? "").replace(/"/g, '""')}"`,
          `"${t.example_phrases.join("; ").replace(/"/g, '""')}"`,
        ].join(",")
      );
      const blob = new Blob([header + rows.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `research-patterns-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-5 bg-gray-200 rounded w-40" />
              <div className="h-5 bg-gray-200 rounded w-20" />
              <div className="h-5 bg-gray-200 rounded w-16" />
            </div>
            <div className="h-4 bg-gray-200 rounded w-full mb-1" />
            <div className="h-4 bg-gray-200 rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          Recurring themes across your research — pain points, desires, competitor weaknesses, and language patterns that inform your ad copy.
        </p>
        <div className="flex items-center gap-2">
          {detectResult && (
            <span className={`text-xs ${detectResult.ok ? "text-green-600" : "text-red-600"}`}>
              {detectResult.msg}
            </span>
          )}
          <button
            onClick={handleDetect}
            disabled={detecting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-50"
          >
            {detecting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {detecting ? "Detecting..." : "Detect Patterns"}
          </button>
        </div>
      </div>

      {themes.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-lg">
          <Database className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-1">No patterns detected yet.</p>
          <p className="text-sm text-gray-400 mb-4">
            Patterns are recurring themes like pain points, desires, and language patterns extracted from your research nuggets. Click &ldquo;Detect Patterns&rdquo; to analyze them.
          </p>
          <button
            onClick={handleDetect}
            disabled={detecting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {detecting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {detecting ? "Analyzing..." : "Detect Patterns Now"}
          </button>
        </div>
      ) : (
        <>
          {/* Sort & filter bar */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="flex items-center gap-1 text-sm text-gray-500">
              <ArrowUpDown className="w-3.5 h-3.5" />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
            >
              <option value="evidence">Most mentions</option>
              <option value="recent">Most recent</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={`border rounded px-2 py-1 text-sm bg-white ${typeFilter ? "border-indigo-400 bg-indigo-50" : "border-gray-300"}`}
            >
              <option value="">All types</option>
              {availableTypes.map((t) => (
                <option key={t} value={t}>
                  {TYPE_CONFIG[t]?.label ?? t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={exportCsv}
                disabled={exporting}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
                title="Export patterns as CSV"
              >
                <Download className="w-3 h-3" />
                {exporting ? "..." : "CSV"}
              </button>
              <span className="text-sm text-gray-500">
                {sortedThemes.length} pattern{sortedThemes.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {sortedThemes.map((t) => {
              const typeCfg = TYPE_CONFIG[t.theme_type];
              const isExpanded = expanded.has(t.id);

              return (
                <div
                  key={t.id}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                >
                  <button
                    className="w-full text-left"
                    onClick={() => toggleExpand(t.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          )}
                          <h3 className="font-medium text-gray-900">{t.name}</h3>
                          <span
                            className={`text-xs font-medium ${typeCfg?.color ?? "text-gray-500"}`}
                          >
                            {typeCfg?.label ?? t.theme_type.replace(/_/g, " ")}
                          </span>
                        </div>
                        {t.description && (
                          <p className="text-sm text-gray-600 mb-0 ml-6">{t.description}</p>
                        )}
                      </div>
                      <span className="text-sm font-mono text-gray-500 ml-4 flex-shrink-0">
                        {t.evidence_count} mentions
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-3 ml-6">
                      {t.copy_implications && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                            Copy Implications
                          </h4>
                          <p className="text-sm text-gray-700">{t.copy_implications}</p>
                        </div>
                      )}

                      {t.example_phrases.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                            Example Phrases
                          </h4>
                          <div className="space-y-1">
                            {t.example_phrases.map((p, i) => (
                              <div
                                key={i}
                                className="flex items-start gap-1.5 text-sm text-gray-600"
                              >
                                <MessageSquareQuote className="w-3.5 h-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                                <span className="italic">&ldquo;{p}&rdquo;</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <Link
                          href={`/brainstorm?insight=${encodeURIComponent(t.copy_implications ?? t.name)}`}
                          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          <Sparkles className="w-3 h-3" />
                          Use in Brainstorm
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
