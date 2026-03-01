"use client";

import { useEffect, useState } from "react";
import { Headphones, Sparkles, RefreshCw, Info } from "lucide-react";
import MetricCard from "./MetricCard";
import type { SupportData } from "@/app/api/pulse/support/route";
import type { SupportSummaryData } from "@/app/api/pulse/support/summary/route";

function formatResponseTime(hours: number | null): string {
  if (hours === null) return "N/A";
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  return `${hours.toFixed(1)}h`;
}

function trendLabel(trend: "up" | "down" | "stable" | null): string {
  switch (trend) {
    case "up": return "Långsammare";
    case "down": return "Snabbare";
    case "stable": return "Stabilt";
    default: return "";
  }
}

export default function SupportEngine() {
  const [data, setData] = useState<SupportData | null>(null);
  const [summary, setSummary] = useState<SupportSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const [supportRes, summaryRes] = await Promise.all([
          fetch("/api/pulse/support"),
          fetch("/api/pulse/support/summary"),
        ]);

        if (!supportRes.ok) throw new Error("Failed to fetch support data");
        const supportJson = await supportRes.json();
        if (supportJson.error) throw new Error(supportJson.error);
        setData(supportJson);

        if (summaryRes.ok) {
          const summaryJson = await summaryRes.json();
          if (summaryJson && summaryJson.summary) {
            setSummary(summaryJson);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  async function generateSummary() {
    setGeneratingSummary(true);
    try {
      const res = await fetch("/api/pulse/support/summary", { method: "POST" });
      if (!res.ok) throw new Error("Failed to generate summary");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSummary(json);
    } catch (err) {
      // Show error inline — don't overwrite main error state
      alert(err instanceof Error ? err.message : "Failed to generate summary");
    } finally {
      setGeneratingSummary(false);
    }
  }

  const prioritySubtitle = data
    ? Object.entries(data.openTickets.byPriority)
        .map(([label, count]) => `${count} ${label}`)
        .join(", ")
    : undefined;

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-4">
        <Headphones className="w-5 h-5 text-purple-600" />
        <h2 className="text-lg font-semibold text-gray-900">Support Engine</h2>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
              <div className="h-7 bg-gray-200 rounded w-32 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-40" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Freshdesk not configured */}
      {data && !loading && !data.freshdeskConfigured && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-start gap-2">
          <Info className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
          <p className="text-sm text-gray-500">
            Freshdesk inte konfigurerat. Konfigurera Freshdesk-anslutning i Settings för att se supportdata.
          </p>
        </div>
      )}

      {/* Data */}
      {data && !loading && data.freshdeskConfigured && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Open tickets */}
            <MetricCard
              label="Öppna ärenden"
              value={String(data.openTickets.total)}
              subtitle={prioritySubtitle || "Inga öppna ärenden"}
            />

            {/* Response time */}
            <MetricCard
              label="Svarstid (snitt 7d)"
              value={formatResponseTime(data.responseTime.avgHours)}
              trend={data.responseTime.trend}
              trendPositive="down"
              trendLabel={trendLabel(data.responseTime.trend)}
            />

            {/* This week */}
            <MetricCard
              label="Denna vecka"
              value={`${data.weekSummary.resolved} lösta`}
              subtitle={`${data.weekSummary.created} nya ärenden`}
            />
          </div>

          {/* AI Summary card */}
          <div className="bg-white rounded-lg border border-gray-200 p-5 mt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-medium text-gray-900">AI-veckosummering</h3>
              </div>
              <button
                onClick={generateSummary}
                disabled={generatingSummary}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${generatingSummary ? "animate-spin" : ""}`} />
                Uppdatera
              </button>
            </div>
            {summary ? (
              <>
                <p className="text-sm text-gray-700 leading-relaxed">{summary.summary}</p>
                <p className="text-xs text-gray-400 mt-2">
                  Genererad: {new Date(summary.generatedAt).toLocaleString("sv-SE")}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400 italic">Ingen summering genererad</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
