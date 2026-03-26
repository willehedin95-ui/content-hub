"use client";

import { useState, useEffect, useCallback } from "react";
import { TrendingUp, TrendingDown, Minus, MessageSquareQuote, Sparkles, Loader2 } from "lucide-react";

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

const STRENGTH_CONFIG: Record<string, { label: string; color: string; icon: typeof TrendingUp }> = {
  dominant: { label: "Dominant", color: "bg-indigo-100 text-indigo-800", icon: TrendingUp },
  established: { label: "Established", color: "bg-green-100 text-green-800", icon: TrendingUp },
  growing: { label: "Growing", color: "bg-blue-100 text-blue-800", icon: TrendingUp },
  emerging: { label: "Emerging", color: "bg-amber-100 text-amber-800", icon: Minus },
  fading: { label: "Fading", color: "bg-gray-100 text-gray-500", icon: TrendingDown },
};

const TYPE_COLORS: Record<string, string> = {
  pain_point: "text-red-600",
  desire: "text-green-600",
  objection: "text-amber-600",
  competitor_weakness: "text-purple-600",
  trend: "text-blue-600",
  language_pattern: "text-indigo-600",
  pattern: "text-gray-600",
};

export default function ResearchThemes() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState<{ ok: boolean; msg: string } | null>(null);

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

  if (loading) {
    return <div className="text-center text-gray-400 py-12">Loading...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          AI-detected patterns from your research nuggets. Updated weekly or on demand.
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
        <div className="text-center text-gray-400 py-12">
          No patterns detected yet. Click &ldquo;Detect Patterns&rdquo; to analyze your nuggets.
        </div>
      ) : (
        <div className="space-y-3">
          {themes.map((t) => {
            const strengthCfg = STRENGTH_CONFIG[t.strength] ?? STRENGTH_CONFIG.emerging;
            const StrengthIcon = strengthCfg.icon;
            const isExpanded = expanded === t.id;

            return (
              <div
                key={t.id}
                className="bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:border-gray-300 transition-colors"
                onClick={() => setExpanded(isExpanded ? null : t.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-gray-900">{t.name}</h3>
                      <span
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${strengthCfg.color}`}
                      >
                        <StrengthIcon className="w-3 h-3" />
                        {strengthCfg.label}
                      </span>
                      <span
                        className={`text-xs font-medium ${TYPE_COLORS[t.theme_type] ?? "text-gray-500"}`}
                      >
                        {t.theme_type.replace(/_/g, " ")}
                      </span>
                    </div>
                    {t.description && (
                      <p className="text-sm text-gray-600 mb-2">{t.description}</p>
                    )}
                  </div>
                  <span className="text-sm font-mono text-gray-500 ml-4">
                    {t.evidence_count} mentions
                  </span>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
