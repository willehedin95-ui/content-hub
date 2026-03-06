"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  RefreshCw,
  FileText,
  FlaskConical,
  AlertCircle,
  TrendingUp,
  XCircle,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  Trash2,
  ImageIcon,
  Settings,
  Plus,
  Save,
  ListOrdered,
  Check,
  ExternalLink,
  Lightbulb,
  Workflow,
  GitBranch,
} from "lucide-react";
import type {
  PipelineData,
  PipelineConcept,
  PipelineSetting,
  PipelineStage,
  PipelineSignal,
  CampaignBudget,
} from "@/types";

// ── Constants ────────────────────────────────────────────────

const STAGES: PipelineStage[] = ["draft", "queued", "launchpad", "testing", "review", "active", "killed"];

const STAGE_CONFIG: Record<
  PipelineStage,
  { label: string; description: string; headerBg: string; headerText: string; borderColor: string }
> = {
  draft: {
    label: "Draft",
    description: "Pushed to Meta, waiting to go live",
    headerBg: "bg-blue-50",
    headerText: "text-blue-700",
    borderColor: "border-blue-200",
  },
  queued: {
    label: "Queued",
    description: "In line to start testing",
    headerBg: "bg-violet-50",
    headerText: "text-violet-700",
    borderColor: "border-violet-200",
  },
  launchpad: {
    label: "Launchpad",
    description: "Ready to push when budget is available",
    headerBg: "bg-indigo-50",
    headerText: "text-indigo-700",
    borderColor: "border-indigo-200",
  },
  testing: {
    label: "Testing",
    description: "Running \u2014 collecting data (2\u20133 days)",
    headerBg: "bg-slate-100",
    headerText: "text-slate-700",
    borderColor: "border-slate-200",
  },
  review: {
    label: "Review",
    description: "Enough data to decide: scale or kill",
    headerBg: "bg-amber-50",
    headerText: "text-amber-700",
    borderColor: "border-amber-200",
  },
  active: {
    label: "Active",
    description: "Performing well, running at full budget",
    headerBg: "bg-emerald-50",
    headerText: "text-emerald-700",
    borderColor: "border-emerald-200",
  },
  killed: {
    label: "Killed",
    description: "Stopped \u2014 learnings saved",
    headerBg: "bg-gray-100",
    headerText: "text-gray-500",
    borderColor: "border-gray-200",
  },
};

const SIGNAL_STYLES: Record<
  PipelineSignal["type"],
  { label: string; bg: string; text: string }
> = {
  kill: { label: "Kill?", bg: "bg-red-100", text: "text-red-700" },
  scale: { label: "Scale!", bg: "bg-emerald-100", text: "text-emerald-700" },
  fatigue: { label: "Fatiguing", bg: "bg-amber-100", text: "text-amber-700" },
  no_spend: { label: "No spend", bg: "bg-gray-100", text: "text-gray-500" },
  review_ready: { label: "Review", bg: "bg-orange-100", text: "text-orange-700" },
};

const PRODUCT_COLORS: Record<string, string> = {
  happysleep: "bg-indigo-100 text-indigo-700",
  hydro13: "bg-teal-100 text-teal-700",
};

const ALERT_STYLES: Record<string, string> = {
  high: "bg-rose-50 border-rose-200 text-rose-700",
  medium: "bg-amber-50 border-amber-200 text-amber-700",
  low: "bg-blue-50 border-blue-200 text-blue-700",
};

const LANG_TO_COUNTRY: Record<string, string> = {
  sv: "SE",
  da: "DK",
  no: "NO",
  de: "DE",
};

const COUNTRY_TABS = ["SE", "DK", "NO"] as const;

// ── Helpers ──────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatCurrency(n: number, currency?: string | null): string {
  return `${n.toFixed(0)} ${currency || "SEK"}`;
}

function cpaColorClass(
  cpa: number,
  conversions: number,
  targetCpa: number | null
): string {
  if (conversions === 0) return "text-gray-400";
  if (targetCpa === null || cpa <= targetCpa) return "text-emerald-600";
  if (cpa < targetCpa * 2) return "text-amber-600";
  return "text-red-600";
}

function roasColorClass(roas: number | null, targetRoas: number | null): string {
  if (roas === null || roas === 0) return "text-gray-400";
  if (!targetRoas) return "text-gray-600";
  if (roas >= targetRoas) return "text-green-600";
  if (roas >= targetRoas * 0.7) return "text-yellow-600";
  return "text-red-600";
}

// ── Main Component ───────────────────────────────────────────

export default function PipelineClient() {
  const [pipelineData, setPipelineData] = useState<PipelineData | null>(null);
  const [settings, setSettings] = useState<PipelineSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [killingId, setKillingId] = useState<string | null>(null);
  const [killNotes, setKillNotes] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [countryFilter, setCountryFilter] = useState<string | null>(null);
  const [queuePickerOpen, setQueuePickerOpen] = useState(false);
  const [queueSelectedIds, setQueueSelectedIds] = useState<Set<string>>(new Set());
  const [queueing, setQueueing] = useState(false);

  // New setting form
  const [newProduct, setNewProduct] = useState("happysleep");
  const [newCountry, setNewCountry] = useState("NO");
  const [newTargetCpa, setNewTargetCpa] = useState("");
  const [newTargetRoas, setNewTargetRoas] = useState("");
  const [newCurrency, setNewCurrency] = useState("NOK");
  const [newTestingSlots, setNewTestingSlots] = useState("5");
  const [savingNewSetting, setSavingNewSetting] = useState(false);

  // Inline editing for existing settings
  const [editingSettingId, setEditingSettingId] = useState<string | null>(null);
  const [editCpa, setEditCpa] = useState("");
  const [editRoas, setEditRoas] = useState("");
  const [editCurrency, setEditCurrency] = useState("");
  const [editTestingSlots, setEditTestingSlots] = useState("");
  const [savingSettingId, setSavingSettingId] = useState<string | null>(null);

  // ── Data fetching ────────────────────────────────────────

  const fetchPipeline = useCallback(async () => {
    try {
      const res = await fetch("/api/pipeline");
      if (!res.ok) throw new Error("Failed to fetch pipeline data");
      const data: PipelineData = await res.json();
      setPipelineData(data);
      setError(null);
    } catch (err) {
      console.error("Pipeline fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch pipeline data");
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/pipeline/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      const data: PipelineSetting[] = await res.json();
      setSettings(data);
    } catch (err) {
      console.error("Settings fetch error:", err);
    }
  }, []);

  const syncPipeline = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/pipeline/sync", { method: "POST" });
      if (!res.ok) throw new Error("Sync failed");
      const data: PipelineData = await res.json();
      setPipelineData(data);
      setError(null);
    } catch (err) {
      console.error("Pipeline sync error:", err);
      setError(err instanceof Error ? err.message : "Pipeline sync failed");
    } finally {
      setSyncing(false);
    }
  }, []);

  // Initial load: fast cached data, then background sync
  useEffect(() => {
    async function init() {
      await Promise.all([fetchPipeline(), fetchSettings()]);
      setLoading(false);
      // Background sync after initial load
      syncPipeline();
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Kill concept ─────────────────────────────────────────

  async function handleKill(imageJobMarketId: string) {
    try {
      const res = await fetch("/api/pipeline/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageJobMarketId, notes: killNotes }),
      });
      if (!res.ok) throw new Error("Kill failed");
      setKillingId(null);
      setKillNotes("");
      setExpandedId(null);
      setError(null);
      await fetchPipeline();
    } catch (err) {
      console.error("Kill error:", err);
      setError(err instanceof Error ? err.message : "Failed to kill concept");
    }
  }

  // ── Settings CRUD ────────────────────────────────────────

  async function handleSaveSetting(product: string, country: string, targetCpa: number, targetRoas: number | null, currency: string, testingSlots?: number) {
    const res = await fetch("/api/pipeline/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product, country, target_cpa: targetCpa, target_roas: targetRoas, currency, testing_slots: testingSlots }),
    });
    if (!res.ok) throw new Error("Failed to save setting");
    await fetchSettings();
    await fetchPipeline();
  }

  async function handleAddSetting() {
    if (!newTargetCpa) return;
    setSavingNewSetting(true);
    try {
      await handleSaveSetting(
        newProduct,
        newCountry,
        parseFloat(newTargetCpa),
        newTargetRoas ? parseFloat(newTargetRoas) : null,
        newCurrency,
        newTestingSlots ? parseInt(newTestingSlots) : 5
      );
      setNewTargetCpa("");
      setNewTargetRoas("");
      setNewTestingSlots("5");
    } catch (err) {
      console.error("Add setting error:", err);
    } finally {
      setSavingNewSetting(false);
    }
  }

  async function handleUpdateSetting(setting: PipelineSetting) {
    if (!editCpa) return;
    setSavingSettingId(setting.id);
    try {
      await handleSaveSetting(
        setting.product,
        setting.country,
        parseFloat(editCpa),
        editRoas ? parseFloat(editRoas) : null,
        editCurrency,
        editTestingSlots ? parseInt(editTestingSlots) : undefined
      );
      setEditingSettingId(null);
    } catch (err) {
      console.error("Update setting error:", err);
    } finally {
      setSavingSettingId(null);
    }
  }

  // ── Queue management ────────────────────────────────────

  async function handleAddToQueue() {
    if (queueSelectedIds.size === 0) return;
    setQueueing(true);
    try {
      for (const id of queueSelectedIds) {
        const res = await fetch("/api/pipeline/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageJobMarketId: id }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to queue concept");
        }
      }
      setQueueSelectedIds(new Set());
      setQueuePickerOpen(false);
      await fetchPipeline();
    } catch (err) {
      console.error("Queue error:", err);
      setError(err instanceof Error ? err.message : "Failed to queue concepts");
    } finally {
      setQueueing(false);
    }
  }

  async function handleRemoveFromQueue(imageJobMarketId: string) {
    try {
      const res = await fetch("/api/pipeline/queue", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageJobMarketId }),
      });
      if (!res.ok) throw new Error("Failed to remove from queue");
      await fetchPipeline();
    } catch (err) {
      console.error("Unqueue error:", err);
      setError(err instanceof Error ? err.message : "Failed to remove from queue");
    }
  }

  // ── Rendering ────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const allConcepts = pipelineData?.concepts ?? [];
  const allCampaignBudgets = pipelineData?.campaignBudgets ?? [];
  const allAlerts = pipelineData?.alerts ?? [];

  // Filter by country/market
  function conceptMatchesCountry(c: PipelineConcept, country: string): boolean {
    return c.market === country;
  }

  const concepts = countryFilter
    ? allConcepts.filter((c) => conceptMatchesCountry(c, countryFilter))
    : allConcepts;

  const campaignBudgets = countryFilter
    ? allCampaignBudgets.filter((b) => b.countries.includes(countryFilter))
    : allCampaignBudgets;

  // Recompute summary from filtered concepts
  const summary = countryFilter
    ? (() => {
        const filteredTesting = concepts.filter((c) => c.stage === "testing").length;
        return {
          launchpad: concepts.filter((c) => c.stage === "queued" || c.stage === "launchpad").length,
          inTesting: filteredTesting,
          needsReview: concepts.filter((c) => c.stage === "review").length,
          activeScaling: concepts.filter((c) => c.stage === "active").length,
          killed: concepts.filter((c) => c.stage === "killed").length,
          avgCreativeAge: pipelineData?.summary?.avgCreativeAge ?? 0,
          availableBudgetByMarket: pipelineData?.summary?.availableBudgetByMarket ?? {},
        };
      })()
    : pipelineData?.summary ?? null;

  // Compute alerts — when filtering by country, derive from filtered concepts
  const alerts = countryFilter
    ? (() => {
        const filtered: typeof allAlerts = [];
        const activeCount = concepts.filter((c) => c.stage === "active").length;
        const reviewCount = concepts.filter((c) => c.stage === "review").length;
        const totalSpend = concepts.reduce((s, c) => s + (c.metrics?.totalSpend ?? 0), 0);
        const testingSpend = concepts
          .filter((c) => c.stage === "testing")
          .reduce((s, c) => s + (c.metrics?.totalSpend ?? 0), 0);
        const testingBudgetPct = totalSpend > 0 ? (testingSpend / totalSpend) * 100 : 0;

        if (activeCount < 5) {
          filtered.push({
            type: "publish_more",
            message: activeCount === 0
              ? `No proven winners in ${countryFilter} yet. Keep testing — concepts graduate to Active after 5 days of profitable ROAS.`
              : `Only ${activeCount} proven winner${activeCount > 1 ? "s" : ""} in ${countryFilter} (goal: 5+). Keep pushing new concepts.`,
            priority: activeCount === 0 ? "high" : "medium",
          });
        }
        if (reviewCount > 0) {
          filtered.push({
            type: "review_needed",
            message: `${reviewCount} concept${reviewCount > 1 ? "s have" : " has"} finished testing in ${countryFilter} — check ROAS and decide: scale or kill?`,
            priority: reviewCount >= 3 ? "high" : "medium",
          });
        }
        if (testingBudgetPct > 50 && totalSpend > 0) {
          filtered.push({
            type: "budget_imbalance",
            message: `${testingBudgetPct.toFixed(0)}% of ${countryFilter} ad spend is on unproven concepts. Kill the losers so budget flows to winners.`,
            priority: "medium",
          });
        }
        return filtered;
      })()
    : allAlerts;

  // Count per country for tab badges
  const countPerCountry: Record<string, number> = {};
  for (const country of COUNTRY_TABS) {
    countPerCountry[country] = allConcepts.filter(
      (c) => c.stage !== "draft" && c.stage !== "queued" && c.stage !== "killed" && conceptMatchesCountry(c, country)
    ).length;
  }

  // Group concepts by stage, sorted by daysInStage desc
  const conceptsByStage: Record<PipelineStage, PipelineConcept[]> = {
    draft: [],
    queued: [],
    launchpad: [],
    testing: [],
    review: [],
    active: [],
    killed: [],
  };
  for (const c of concepts) {
    conceptsByStage[c.stage].push(c);
  }
  for (const stage of STAGES) {
    if (stage === "queued") {
      // FIFO: earliest queued first (position 1 = pushed next)
      conceptsByStage[stage].sort((a, b) =>
        new Date(a.stageEnteredAt).getTime() - new Date(b.stageEnteredAt).getTime()
      );
    } else {
      conceptsByStage[stage].sort((a, b) => b.daysSincePush - a.daysSincePush);
    }
  }

  // When filtering by country, hide queued column (queued have no country) and show core stages
  const visibleStages = countryFilter
    ? (["draft", "testing", "review", "active", "killed"] as PipelineStage[]).filter(
        (s) => conceptsByStage[s].length > 0 || s === "draft" || s === "testing" || s === "review" || s === "active"
      )
    : STAGES;

  // Draft concepts (for queue picker) — concepts with stage "draft"
  const draftConcepts = allConcepts.filter((c) => c.stage === "draft");

  return (
    <div className="max-w-[1400px] pl-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ad Tracker</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track your ads from launch to scale</p>
        </div>
        <div className="flex items-center gap-3">
          {pipelineData?.lastSyncedAt && (
            <span className="text-xs text-gray-400">
              Last synced: {timeAgo(pipelineData.lastSyncedAt)}
            </span>
          )}
          {draftConcepts.length > 0 && (
            <button
              onClick={() => { setQueuePickerOpen(true); setQueueSelectedIds(new Set()); }}
              className="flex items-center gap-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add to Queue
              <span className="bg-violet-200 text-violet-800 text-xs px-1.5 py-0.5 rounded-full ml-0.5 tabular-nums">
                {draftConcepts.length}
              </span>
            </button>
          )}
          <button
            onClick={syncPipeline}
            disabled={syncing}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync"}
          </button>
        </div>
      </div>

      {/* Country filter tabs */}
      <div className="flex items-center gap-1 mb-4">
        <button
          onClick={() => setCountryFilter(null)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            countryFilter === null
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          All
          <span className="ml-1.5 tabular-nums">{allConcepts.filter((c) => c.stage !== "draft").length}</span>
        </button>
        {COUNTRY_TABS.map((country) => (
          <button
            key={country}
            onClick={() => setCountryFilter(country)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              countryFilter === country
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {country}
            <span className="ml-1.5 tabular-nums">{countPerCountry[country]}</span>
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 mb-4 text-sm">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
          <SummaryCard
            icon={<ListOrdered className="w-4 h-4 text-indigo-500" />}
            label="Launchpad"
            value={summary.launchpad}
            color="indigo"
          />
          <SummaryCard
            icon={<FlaskConical className="w-4 h-4 text-slate-500" />}
            label="Testing"
            value={summary.inTesting}
            color="slate"
          />
          <SummaryCard
            icon={<AlertCircle className="w-4 h-4 text-amber-500" />}
            label="Need Review"
            value={summary.needsReview}
            color="amber"
          />
          <SummaryCard
            icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
            label="Active"
            value={summary.activeScaling}
            color="emerald"
          />
          <SummaryCard
            icon={<XCircle className="w-4 h-4 text-gray-400" />}
            label="Killed"
            value={summary.killed}
            color="gray"
          />
        </div>
      )}

      {/* Alert badges */}
      {alerts.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={`flex items-center gap-1.5 border rounded-lg px-3 py-1.5 text-xs font-medium ${
                ALERT_STYLES[alert.priority] || ALERT_STYLES.low
              }`}
            >
              <AlertCircle className="w-3 h-3 shrink-0" />
              {alert.message}
            </div>
          ))}
        </div>
      )}

      {/* Campaign Budgets */}
      {campaignBudgets.length > 0 && (
        <CampaignBudgetSection budgets={campaignBudgets} concepts={concepts} />
      )}

      {/* Empty state */}
      {concepts.length === 0 && !loading && (
        <div className="text-center py-16 bg-gray-50 border border-dashed border-gray-200 rounded-xl mb-8">
          <Workflow className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-gray-600 mb-3">No ads being tracked yet</h3>
          <div className="text-xs text-gray-400 max-w-md mx-auto space-y-1.5 mb-4">
            <p><span className="font-medium text-gray-500">1.</span> Go to <strong className="text-gray-600">Brainstorm</strong> to generate ad concepts</p>
            <p><span className="font-medium text-gray-500">2.</span> Open <strong className="text-gray-600">Concepts</strong> to design images and write copy</p>
            <p><span className="font-medium text-gray-500">3.</span> Push to Meta &mdash; ads appear here automatically</p>
          </div>
          <Link
            href="/brainstorm"
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Lightbulb className="w-4 h-4" />
            Start Brainstorming
          </Link>
        </div>
      )}

      {/* Pipeline Columns (Kanban) */}
      {concepts.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-4 mb-8">
          {visibleStages.map((stage) => {
            const config = STAGE_CONFIG[stage];
            const stageConcepts = conceptsByStage[stage];
            return (
              <div key={stage} className="flex-1 min-w-[240px]">
                {/* Column header */}
                <div
                  className={`px-3 py-2 rounded-t-lg border ${config.headerBg} ${config.borderColor}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold uppercase tracking-wider ${config.headerText}`}>
                      {config.label}
                    </span>
                    <span
                      className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${config.headerBg} ${config.headerText}`}
                    >
                      {stageConcepts.length}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 font-normal mt-0.5">{config.description}</p>
                </div>

                {/* Column body */}
                <div
                  className={`border border-t-0 ${config.borderColor} rounded-b-lg bg-gray-50 p-2 min-h-[200px] space-y-2`}
                >
                  {stageConcepts.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-6">No concepts</p>
                  )}
                  {stageConcepts.map((concept, idx) => (
                    <ConceptCard
                      key={concept.id}
                      concept={concept}
                      queuePosition={stage === "queued" ? idx + 1 : undefined}
                      onClick={() => setExpandedId(concept.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Concept Detail Modal */}
      {expandedId && (() => {
        const concept = concepts.find((c) => c.id === expandedId);
        if (!concept) return null;
        return (
          <ConceptModal
            concept={concept}
            onClose={() => {
              setExpandedId(null);
              setKillingId(null);
              setKillNotes("");
            }}
            killingId={killingId}
            killNotes={killNotes}
            onStartKill={() => setKillingId(concept.id)}
            onCancelKill={() => {
              setKillingId(null);
              setKillNotes("");
            }}
            onKillNotesChange={setKillNotes}
            onConfirmKill={() => handleKill(concept.id)}
            onRemoveFromQueue={concept.stage === "queued" ? async () => {
              await handleRemoveFromQueue(concept.id);
              setExpandedId(null);
            } : undefined}
          />
        );
      })()}

      {/* Queue Picker Modal */}
      {queuePickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setQueuePickerOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Add to Queue</h2>
              <button onClick={() => setQueuePickerOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-3 space-y-1.5">
              {draftConcepts.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">No draft concepts available</p>
              ) : (
                draftConcepts
                  .sort((a, b) => (a.conceptNumber ?? 999) - (b.conceptNumber ?? 999))
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        const next = new Set(queueSelectedIds);
                        if (next.has(c.id)) next.delete(c.id);
                        else next.add(c.id);
                        setQueueSelectedIds(next);
                      }}
                      className={`w-full flex items-center gap-2.5 p-2.5 rounded-lg border transition-colors text-left ${
                        queueSelectedIds.has(c.id)
                          ? "border-violet-400 bg-violet-50"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                        queueSelectedIds.has(c.id)
                          ? "bg-violet-600 border-violet-600"
                          : "border-gray-300"
                      }`}>
                        {queueSelectedIds.has(c.id) && <Check className="w-3 h-3 text-white" />}
                      </div>
                      {c.thumbnailUrl ? (
                        <Image src={c.thumbnailUrl} alt="" width={36} height={36} className="w-9 h-9 rounded object-cover shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded bg-gray-100 flex items-center justify-center shrink-0">
                          <ImageIcon className="w-3.5 h-3.5 text-gray-300" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{c.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {c.conceptNumber !== null && (
                            <span className="text-xs text-gray-400">#{c.conceptNumber}</span>
                          )}
                          {!c.product && (
                            <span className="text-xs font-medium px-1 py-0.5 rounded bg-red-100 text-red-600">
                              No product
                            </span>
                          )}
                          {c.product && (
                            <span className={`text-xs font-medium px-1 py-0.5 rounded ${PRODUCT_COLORS[c.product] || "bg-gray-100 text-gray-500"}`}>
                              {c.product}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
              )}
            </div>
            {draftConcepts.length > 0 && (
              <div className="p-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {queueSelectedIds.size} selected
                </span>
                <button
                  onClick={handleAddToQueue}
                  disabled={queueSelectedIds.size === 0 || queueing}
                  className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                >
                  {queueing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  {queueing ? "Adding..." : `Add ${queueSelectedIds.size} to Queue`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings Panel */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="flex items-center justify-between w-full px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Pipeline Settings</span>
          </div>
          {settingsOpen ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>

        {settingsOpen && (
          <div className="border-t border-gray-200 px-4 py-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-2 py-2 text-xs uppercase tracking-wider font-medium text-gray-400">
                    Product
                  </th>
                  <th className="px-2 py-2 text-xs uppercase tracking-wider font-medium text-gray-400">
                    Country
                  </th>
                  <th className="px-2 py-2 text-xs uppercase tracking-wider font-medium text-gray-400">
                    Target CPA
                  </th>
                  <th className="px-2 py-2 text-xs uppercase tracking-wider font-medium text-gray-400">
                    BE-ROAS
                  </th>
                  <th className="px-2 py-2 text-xs uppercase tracking-wider font-medium text-gray-400">
                    Currency
                  </th>
                  <th className="px-2 py-2 text-xs uppercase tracking-wider font-medium text-gray-400">
                    Slots
                  </th>
                  <th className="px-2 py-2 text-xs uppercase tracking-wider font-medium text-gray-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {settings.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-2 py-2 text-gray-700">{s.product}</td>
                    <td className="px-2 py-2 text-gray-700">{s.country}</td>
                    <td className="px-2 py-2">
                      {editingSettingId === s.id ? (
                        <input
                          type="number"
                          step="0.01"
                          value={editCpa}
                          onChange={(e) => setEditCpa(e.target.value)}
                          className="w-24 border border-gray-300 rounded px-2 py-1 text-xs tabular-nums"
                        />
                      ) : (
                        <span className="tabular-nums">{s.target_cpa.toFixed(2)}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {editingSettingId === s.id ? (
                        <input
                          type="number"
                          step="0.01"
                          value={editRoas}
                          onChange={(e) => setEditRoas(e.target.value)}
                          className="w-20 border border-gray-300 rounded px-2 py-1 text-xs tabular-nums"
                          placeholder="e.g. 1.61"
                        />
                      ) : (
                        <span className="tabular-nums">
                          {s.target_roas !== null ? `${s.target_roas.toFixed(2)}x` : "--"}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {editingSettingId === s.id ? (
                        <input
                          type="text"
                          value={editCurrency}
                          onChange={(e) => setEditCurrency(e.target.value)}
                          className="w-16 border border-gray-300 rounded px-2 py-1 text-xs"
                        />
                      ) : (
                        <span>{s.currency}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {editingSettingId === s.id ? (
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={editTestingSlots}
                          onChange={(e) => setEditTestingSlots(e.target.value)}
                          className="w-14 border border-gray-300 rounded px-2 py-1 text-xs tabular-nums"
                        />
                      ) : (
                        <span className="tabular-nums">{s.testing_slots ?? 5}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {editingSettingId === s.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleUpdateSetting(s)}
                            disabled={savingSettingId === s.id}
                            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-50"
                          >
                            {savingSettingId === s.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Save className="w-3 h-3" />
                            )}
                            Save
                          </button>
                          <button
                            onClick={() => setEditingSettingId(null)}
                            className="text-xs text-gray-400 hover:text-gray-600 ml-2"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingSettingId(s.id);
                            setEditCpa(s.target_cpa.toString());
                            setEditRoas(s.target_roas?.toString() ?? "");
                            setEditCurrency(s.currency);
                            setEditTestingSlots(String(s.testing_slots ?? 5));
                          }}
                          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}

                {/* Add new setting row */}
                <tr className="border-t border-gray-200">
                  <td className="px-2 py-2">
                    <select
                      value={newProduct}
                      onChange={(e) => setNewProduct(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-xs"
                    >
                      <option value="happysleep">happysleep</option>
                      <option value="hydro13">hydro13</option>
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={newCountry}
                      onChange={(e) => setNewCountry(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-xs"
                    >
                      <option value="NO">NO</option>
                      <option value="DK">DK</option>
                      <option value="SE">SE</option>
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 250"
                      value={newTargetCpa}
                      onChange={(e) => setNewTargetCpa(e.target.value)}
                      className="w-24 border border-gray-300 rounded px-2 py-1 text-xs tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 1.61"
                      value={newTargetRoas}
                      onChange={(e) => setNewTargetRoas(e.target.value)}
                      className="w-20 border border-gray-300 rounded px-2 py-1 text-xs tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={newCurrency}
                      onChange={(e) => setNewCurrency(e.target.value)}
                      className="w-16 border border-gray-300 rounded px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={newTestingSlots}
                      onChange={(e) => setNewTestingSlots(e.target.value)}
                      className="w-14 border border-gray-300 rounded px-2 py-1 text-xs tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <button
                      onClick={handleAddSetting}
                      disabled={!newTargetCpa || savingNewSetting}
                      className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-50"
                    >
                      {savingNewSetting ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Plus className="w-3 h-3" />
                      )}
                      Add
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────

function SummaryCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-lg font-semibold text-gray-900 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function ConceptCard({
  concept,
  queuePosition,
  onClick,
}: {
  concept: PipelineConcept;
  queuePosition?: number;
  onClick: () => void;
}) {
  const m = concept.metrics;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-gray-200 rounded-lg p-2.5 hover:shadow-sm transition-shadow"
    >
      {/* Row 1: Thumbnail + Name + Number */}
      <div className="flex items-center gap-2 mb-1.5">
        {queuePosition !== undefined ? (
          <div className="w-10 h-10 rounded bg-violet-100 flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-violet-600 tabular-nums">{queuePosition}</span>
          </div>
        ) : concept.thumbnailUrl ? (
          <Image
            src={concept.thumbnailUrl}
            alt=""
            width={40}
            height={40}
            className="w-10 h-10 rounded object-cover shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center shrink-0">
            <ImageIcon className="w-4 h-4 text-gray-300" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-800 truncate">
            {concept.name}
          </p>
          {concept.conceptNumber !== null && (
            <span className="text-xs text-gray-400">#{concept.conceptNumber}</span>
          )}
        </div>
      </div>

      {/* Row 2: Product badge + Country flags */}
      <div className="flex items-center gap-1.5 mb-1.5">
        {concept.product && (
          <span
            className={`text-xs font-medium px-1.5 py-0.5 rounded ${
              PRODUCT_COLORS[concept.product] || "bg-gray-100 text-gray-500"
            }`}
          >
            {concept.product}
          </span>
        )}
        <span className="text-xs text-gray-400 uppercase">
          {concept.market}
        </span>
      </div>

      {/* Row 3: Age badge + ROAS indicator */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded tabular-nums">
          {concept.daysSincePush}d
        </span>
        {m && (
          <span
            className={`text-xs font-medium tabular-nums ${roasColorClass(
              m.roas,
              concept.targetRoas
            )}`}
          >
            {m.roas !== null && m.roas > 0
              ? `ROAS: ${m.roas.toFixed(2)}x`
              : m.conversions === 0
              ? "No conversions"
              : "No revenue"}
          </span>
        )}
      </div>

      {/* Row 4: Signal badges */}
      {concept.signals.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {concept.signals.map((signal, i) => {
            const style = SIGNAL_STYLES[signal.type];
            return (
              <span
                key={i}
                className={`text-xs font-medium px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}
                title={signal.reason}
              >
                {style.label}
              </span>
            );
          })}
        </div>
      )}
    </button>
  );
}

function ConceptModal({
  concept,
  onClose,
  killingId,
  killNotes,
  onStartKill,
  onCancelKill,
  onKillNotesChange,
  onConfirmKill,
  onRemoveFromQueue,
}: {
  concept: PipelineConcept;
  onClose: () => void;
  killingId: string | null;
  killNotes: string;
  onStartKill: () => void;
  onCancelKill: () => void;
  onKillNotesChange: (v: string) => void;
  onConfirmKill: () => void;
  onRemoveFromQueue?: () => void;
}) {
  const isKilling = killingId === concept.id;
  const m = concept.metrics;
  const stageConfig = STAGE_CONFIG[concept.stage];

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-start gap-3 p-5 border-b border-gray-100">
          {concept.thumbnailUrl ? (
            <Image
              src={concept.thumbnailUrl}
              alt=""
              width={64}
              height={64}
              className="w-16 h-16 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <ImageIcon className="w-6 h-6 text-gray-300" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 truncate">
              {concept.name}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              {concept.conceptNumber !== null && (
                <span className="text-xs text-gray-400">#{concept.conceptNumber}</span>
              )}
              {concept.product && (
                <span
                  className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                    PRODUCT_COLORS[concept.product] || "bg-gray-100 text-gray-500"
                  }`}
                >
                  {concept.product}
                </span>
              )}
              <span
                className={`text-xs font-medium px-1.5 py-0.5 rounded ${stageConfig.headerBg} ${stageConfig.headerText}`}
              >
                {stageConfig.label}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs text-gray-400 uppercase">
                {concept.market}
              </span>
              <span className="text-xs text-gray-400 tabular-nums">
                {concept.daysSincePush}d total{concept.daysInStage !== concept.daysSincePush ? ` · ${concept.daysInStage}d in ${STAGE_CONFIG[concept.stage].label}` : ""}
              </span>
            </div>
            {concept.imageJobId && (
              <div className="flex items-center gap-3 mt-1">
                <Link
                  href={`/images/${concept.imageJobId}`}
                  className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700"
                  target="_blank"
                >
                  View Concept <ExternalLink className="w-3 h-3" />
                </Link>
                {(concept.stage === "active" || concept.stage === "review") && (
                  <Link
                    href={`/images/${concept.imageJobId}`}
                    className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700"
                    title="Create iteration of this winner"
                  >
                    <GitBranch className="w-3 h-3" />
                    Iterate
                  </Link>
                )}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 -m-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Signal badges */}
        {concept.signals.length > 0 && (
          <div className="px-5 pt-3 flex flex-wrap gap-1.5">
            {concept.signals.map((signal, i) => {
              const style = SIGNAL_STYLES[signal.type];
              return (
                <span
                  key={i}
                  className={`text-xs font-medium px-2 py-1 rounded ${style.bg} ${style.text}`}
                  title={signal.reason}
                >
                  {style.label}: {signal.reason}
                </span>
              );
            })}
          </div>
        )}

        {/* Review Recommendation */}
        {concept.stage === "review" && (
          <ReviewRecommendation concept={concept} />
        )}

        {/* Metrics */}
        <div className="p-5">
          {m ? (
            <>
              {/* Primary metrics row */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-400 mb-0.5">Spend</p>
                  <p className="text-sm font-semibold text-gray-800 tabular-nums">
                    {formatCurrency(m.totalSpend, concept.currency)}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-400 mb-0.5">Revenue</p>
                  <p className="text-sm font-semibold text-gray-800 tabular-nums">
                    {formatCurrency(m.revenue, concept.currency)}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-400 mb-0.5">ROAS</p>
                  <p
                    className={`text-sm font-semibold tabular-nums ${roasColorClass(
                      m.roas,
                      concept.targetRoas
                    )}`}
                  >
                    {m.roas !== null && m.roas > 0 ? `${m.roas.toFixed(2)}x` : "--"}
                  </p>
                  {concept.targetRoas && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      target: {concept.targetRoas.toFixed(2)}x
                    </p>
                  )}
                </div>
              </div>

              {/* Detailed metrics */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <MetricRow label="Impressions" value={m.impressions.toLocaleString()} />
                <MetricRow label="Clicks" value={m.clicks.toLocaleString()} />
                <MetricRow label="CTR" value={`${m.ctr.toFixed(2)}%`} />
                <MetricRow label="CPC" value={formatCurrency(m.cpc, concept.currency)} />
                <MetricRow label="CPM" value={formatCurrency(m.cpm, concept.currency)} />
                <MetricRow label="Frequency" value={m.frequency.toFixed(2)} />
                <MetricRow label="Conversions" value={String(m.conversions)} />
                <MetricRow
                  label="CPA"
                  value={m.conversions > 0 ? formatCurrency(m.cpa, concept.currency) : "--"}
                  valueClass={cpaColorClass(m.cpa, m.conversions, concept.targetCpa)}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No metrics data yet.</p>
          )}
        </div>

        {/* Kill hypothesis & notes for killed concepts */}
        {concept.stage === "killed" && (concept.killHypothesis || concept.killNotes) && (
          <div className="border-t border-gray-100 px-5 py-4 space-y-3">
            {concept.killHypothesis && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">AI Hypothesis</p>
                <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 rounded-lg p-3">
                  {concept.killHypothesis}
                </p>
              </div>
            )}
            {concept.killNotes && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Your Notes</p>
                <p className="text-xs text-gray-600 leading-relaxed">{concept.killNotes}</p>
              </div>
            )}
          </div>
        )}

        {/* Remove from queue action */}
        {onRemoveFromQueue && (
          <div className="border-t border-gray-100 p-5">
            <button
              onClick={onRemoveFromQueue}
              className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-700 font-medium"
            >
              <X className="w-4 h-4" />
              Remove from Queue
            </button>
          </div>
        )}

        {/* Actions */}
        {(concept.stage === "review" || concept.stage === "active" || concept.stage === "testing") && (
          <div className="border-t border-gray-100 p-5">
            {!isKilling ? (
              <button
                onClick={onStartKill}
                className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 font-medium"
              >
                <Trash2 className="w-4 h-4" />
                Kill Concept
              </button>
            ) : (
              <div className="space-y-3">
                <label className="text-xs font-medium text-gray-600">
                  What did you learn from this concept?
                </label>
                <textarea
                  value={killNotes}
                  onChange={(e) => onKillNotesChange(e.target.value)}
                  placeholder="Record learnings before killing..."
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={onConfirmKill}
                    className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Kill & Save Learnings
                  </button>
                  <button
                    onClick={onCancelKill}
                    className="text-sm text-gray-400 hover:text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`text-xs font-medium tabular-nums ${valueClass || "text-gray-700"}`}>
        {value}
      </span>
    </div>
  );
}

function ReviewRecommendation({ concept }: { concept: PipelineConcept }) {
  const m = concept.metrics;
  const targetCpa = concept.targetCpa;
  const targetRoas = concept.targetRoas;

  let verdict: "kill" | "keep" | "scale";
  let reason: string;

  if (!m || m.totalSpend === 0) {
    verdict = "keep";
    reason = "Not enough data yet — wait for metrics to come in.";
  } else if (m.conversions === 0) {
    verdict = "kill";
    reason = `Spent ${formatCurrency(m.totalSpend, concept.currency)} with zero conversions. The concept isn't resonating.`;
  } else if (targetCpa !== null && m.cpa > targetCpa * 2) {
    verdict = "kill";
    reason = `CPA (${formatCurrency(m.cpa, concept.currency)}) is more than 2x your target (${formatCurrency(targetCpa, concept.currency)}). Unlikely to improve.`;
  } else if (targetRoas !== null && m.roas !== null && m.roas < targetRoas * 0.5) {
    verdict = "kill";
    reason = `ROAS (${m.roas.toFixed(2)}x) is far below break-even (${targetRoas.toFixed(2)}x). Not profitable.`;
  } else if (targetCpa !== null && m.cpa <= targetCpa && m.conversions >= 3) {
    verdict = "scale";
    reason = `CPA (${formatCurrency(m.cpa, concept.currency)}) is below target with ${m.conversions} conversions. Strong candidate for scaling.`;
  } else if (targetRoas !== null && m.roas !== null && m.roas >= targetRoas) {
    verdict = "scale";
    reason = `ROAS (${m.roas.toFixed(2)}x) meets your target (${targetRoas.toFixed(2)}x). Consider scaling.`;
  } else {
    verdict = "keep";
    reason = targetCpa !== null
      ? `CPA (${formatCurrency(m.cpa, concept.currency)}) is above target (${formatCurrency(targetCpa, concept.currency)}) but could improve. Give it a few more days.`
      : "Performance is mixed. Keep monitoring for a clearer trend.";
  }

  const styles = {
    kill: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", label: "Recommendation: Kill" },
    keep: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", label: "Recommendation: Keep monitoring" },
    scale: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", label: "Recommendation: Scale" },
  };
  const s = styles[verdict];

  return (
    <div className={`mx-5 mt-3 p-3 rounded-lg border ${s.bg} ${s.border}`}>
      <p className={`text-xs font-semibold ${s.text} mb-1`}>{s.label}</p>
      <p className={`text-xs ${s.text}`}>{reason}</p>
    </div>
  );
}

function CampaignBudgetSection({
  budgets,
  concepts,
}: {
  budgets: CampaignBudget[];
  concepts: PipelineConcept[];
}) {
  // Count active (non-draft, non-killed) concepts per campaign
  const activeConcepts = concepts.filter(
    (c) => c.stage !== "draft" && c.stage !== "queued" && c.stage !== "killed"
  );
  const totalActiveConcepts = activeConcepts.length;

  // Calculate testing concepts count and check for budget guidance alerts
  const testingConcepts = concepts.filter((c) => c.stage === "testing").length;
  const showLowTestingAlert = testingConcepts < 3;

  // Check if any budget per concept is below 15 SEK
  const hasLowBudgetAlert = budgets.some((b) => {
    const conceptsInCampaign = activeConcepts.filter((c) => b.countries.includes(c.market)).length;
    const budgetPerConcept = conceptsInCampaign > 0 ? b.dailyBudget / conceptsInCampaign : b.dailyBudget;
    return conceptsInCampaign > 0 && budgetPerConcept < 15;
  });

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mb-6">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
        Campaign Budgets
      </h3>

      {/* Budget guidance alerts */}
      {(showLowTestingAlert || hasLowBudgetAlert) && (
        <div className="space-y-2 mb-3">
          {showLowTestingAlert && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-2 text-xs">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Consider adding more testing concepts (currently {testingConcepts}, recommended: 3+)</span>
            </div>
          )}
          {hasLowBudgetAlert && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-2 text-xs">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Budget may be too low for effective testing (some concepts have less than 15/day per concept)</span>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {budgets.map((b) => {
          // Estimate concepts per campaign based on market/country overlap
          const conceptsInCampaign = activeConcepts.filter((c) =>
            b.countries.includes(c.market)
          ).length;
          const budgetPerConcept = conceptsInCampaign > 0 ? b.dailyBudget / conceptsInCampaign : b.dailyBudget;
          const isLow = conceptsInCampaign > 0 && budgetPerConcept < 20;

          return (
            <div
              key={b.campaignId}
              className={`flex items-center justify-between p-2.5 rounded-lg border ${
                isLow ? "border-amber-200 bg-amber-50" : "border-gray-100 bg-gray-50"
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">{b.name}</p>
                <p className="text-xs text-gray-400">
                  {b.countries.join(", ")} &middot; {conceptsInCampaign} concept{conceptsInCampaign !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="text-right shrink-0 ml-3">
                <p className="text-xs font-semibold tabular-nums text-gray-700">
                  {b.dailyBudget.toFixed(0)} {b.currency}/day
                </p>
                {conceptsInCampaign > 0 && (
                  <p className={`text-xs tabular-nums ${isLow ? "text-amber-600 font-medium" : "text-gray-400"}`}>
                    ~{budgetPerConcept.toFixed(0)} {b.currency}/day per concept
                    {isLow && " (low)"}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {budgets.length > 0 && totalActiveConcepts > 0 && (
        <p className="text-xs text-gray-400 mt-2">
          Total daily: {budgets.reduce((s, b) => s + b.dailyBudget, 0).toFixed(0)} {budgets[0]?.currency || "SEK"} across {totalActiveConcepts} active concepts
        </p>
      )}
    </div>
  );
}
