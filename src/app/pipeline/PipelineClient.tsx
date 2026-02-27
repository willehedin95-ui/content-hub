"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  RefreshCw,
  FileText,
  FlaskConical,
  AlertCircle,
  TrendingUp,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Trash2,
  ImageIcon,
  Settings,
  Plus,
  Save,
} from "lucide-react";
import type {
  PipelineData,
  PipelineConcept,
  PipelineSetting,
  PipelineStage,
  PipelineSignal,
} from "@/types";

// ── Constants ────────────────────────────────────────────────

const STAGES: PipelineStage[] = ["draft", "testing", "review", "active", "killed"];

const STAGE_CONFIG: Record<
  PipelineStage,
  { label: string; headerBg: string; headerText: string; borderColor: string }
> = {
  draft: {
    label: "Draft",
    headerBg: "bg-blue-50",
    headerText: "text-blue-700",
    borderColor: "border-blue-200",
  },
  testing: {
    label: "Testing",
    headerBg: "bg-slate-100",
    headerText: "text-slate-700",
    borderColor: "border-slate-200",
  },
  review: {
    label: "Review",
    headerBg: "bg-amber-50",
    headerText: "text-amber-700",
    borderColor: "border-amber-200",
  },
  active: {
    label: "Active",
    headerBg: "bg-emerald-50",
    headerText: "text-emerald-700",
    borderColor: "border-emerald-200",
  },
  killed: {
    label: "Killed",
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
  const cur = currency || "USD";
  return `${n.toFixed(2)} ${cur}`;
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

  // New setting form
  const [newProduct, setNewProduct] = useState("happysleep");
  const [newCountry, setNewCountry] = useState("NO");
  const [newTargetCpa, setNewTargetCpa] = useState("");
  const [newCurrency, setNewCurrency] = useState("NOK");
  const [savingNewSetting, setSavingNewSetting] = useState(false);

  // Inline editing for existing settings
  const [editingSettingId, setEditingSettingId] = useState<string | null>(null);
  const [editCpa, setEditCpa] = useState("");
  const [editCurrency, setEditCurrency] = useState("");
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

  async function handleKill(imageJobId: string) {
    try {
      const res = await fetch("/api/pipeline/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageJobId, notes: killNotes }),
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

  async function handleSaveSetting(product: string, country: string, targetCpa: number, currency: string) {
    const res = await fetch("/api/pipeline/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product, country, target_cpa: targetCpa, currency }),
    });
    if (!res.ok) throw new Error("Failed to save setting");
    await fetchSettings();
    await fetchPipeline();
  }

  async function handleAddSetting() {
    if (!newTargetCpa) return;
    setSavingNewSetting(true);
    try {
      await handleSaveSetting(newProduct, newCountry, parseFloat(newTargetCpa), newCurrency);
      setNewTargetCpa("");
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
      await handleSaveSetting(setting.product, setting.country, parseFloat(editCpa), editCurrency);
      setEditingSettingId(null);
    } catch (err) {
      console.error("Update setting error:", err);
    } finally {
      setSavingSettingId(null);
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

  const summary = pipelineData?.summary;
  const alerts = pipelineData?.alerts ?? [];
  const concepts = pipelineData?.concepts ?? [];

  // Group concepts by stage, sorted by daysInStage desc
  const conceptsByStage: Record<PipelineStage, PipelineConcept[]> = {
    draft: [],
    testing: [],
    review: [],
    active: [],
    killed: [],
  };
  for (const c of concepts) {
    conceptsByStage[c.stage].push(c);
  }
  for (const stage of STAGES) {
    conceptsByStage[stage].sort((a, b) => b.daysInStage - a.daysInStage);
  }

  return (
    <div className="max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Creative Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track concepts from draft to scale</p>
        </div>
        <div className="flex items-center gap-3">
          {pipelineData?.lastSyncedAt && (
            <span className="text-xs text-gray-400">
              Last synced: {timeAgo(pipelineData.lastSyncedAt)}
            </span>
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
            icon={<FileText className="w-4 h-4 text-blue-500" />}
            label="Drafts Ready"
            value={summary.draftsReady}
            color="blue"
          />
          <SummaryCard
            icon={<FlaskConical className="w-4 h-4 text-slate-500" />}
            label="Testing"
            value={summary.inTesting}
            sub="hands off"
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

      {/* Empty state */}
      {concepts.length === 0 && !loading && (
        <div className="text-center py-16 bg-gray-50 border border-dashed border-gray-200 rounded-xl mb-8">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-gray-600 mb-1">No concepts in the pipeline yet</h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            Create concepts in Ad Concepts, push them to Meta, then they&apos;ll appear here automatically.
          </p>
        </div>
      )}

      {/* Pipeline Columns (Kanban) */}
      {concepts.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-4 mb-8">
          {STAGES.map((stage) => {
            const config = STAGE_CONFIG[stage];
            const stageConcepts = conceptsByStage[stage];
            return (
              <div key={stage} className="flex-1 min-w-[240px]">
                {/* Column header */}
                <div
                  className={`flex items-center justify-between px-3 py-2 rounded-t-lg border ${config.headerBg} ${config.borderColor}`}
                >
                  <span className={`text-xs font-semibold uppercase tracking-wider ${config.headerText}`}>
                    {config.label}
                  </span>
                  <span
                    className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${config.headerBg} ${config.headerText}`}
                  >
                    {stageConcepts.length}
                  </span>
                </div>

                {/* Column body */}
                <div
                  className={`border border-t-0 ${config.borderColor} rounded-b-lg bg-gray-50 p-2 min-h-[200px] space-y-2`}
                >
                  {stageConcepts.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-6">No concepts</p>
                  )}
                  {stageConcepts.map((concept) => (
                    <ConceptCard
                      key={concept.id}
                      concept={concept}
                      expanded={expandedId === concept.id}
                      onToggle={() =>
                        setExpandedId(expandedId === concept.id ? null : concept.id)
                      }
                      killingId={killingId}
                      killNotes={killNotes}
                      onStartKill={() => setKillingId(concept.id)}
                      onCancelKill={() => {
                        setKillingId(null);
                        setKillNotes("");
                      }}
                      onKillNotesChange={setKillNotes}
                      onConfirmKill={() => handleKill(concept.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
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
            <span className="text-sm font-medium text-gray-700">Target CPA Settings</span>
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
                    Currency
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
                            setEditCurrency(s.currency);
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
                      type="text"
                      value={newCurrency}
                      onChange={(e) => setNewCurrency(e.target.value)}
                      className="w-16 border border-gray-300 rounded px-2 py-1 text-xs"
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
  expanded,
  onToggle,
  killingId,
  killNotes,
  onStartKill,
  onCancelKill,
  onKillNotesChange,
  onConfirmKill,
}: {
  concept: PipelineConcept;
  expanded: boolean;
  onToggle: () => void;
  killingId: string | null;
  killNotes: string;
  onStartKill: () => void;
  onCancelKill: () => void;
  onKillNotesChange: (v: string) => void;
  onConfirmKill: () => void;
}) {
  const isKilling = killingId === concept.id;
  const m = concept.metrics;

  return (
    <div
      className={`bg-white border border-gray-200 rounded-lg transition-shadow ${
        expanded ? "shadow-md" : "hover:shadow-sm"
      }`}
    >
      {/* Collapsed view */}
      <button
        onClick={onToggle}
        className="w-full text-left p-2.5"
      >
        {/* Row 1: Thumbnail + Name + Number */}
        <div className="flex items-center gap-2 mb-1.5">
          {concept.thumbnailUrl ? (
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
          {concept.languages.length > 0 && (
            <span className="text-xs text-gray-400 uppercase">
              {concept.languages.join(", ")}
            </span>
          )}
        </div>

        {/* Row 3: Age badge + CPA indicator */}
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded tabular-nums">
            {concept.daysInStage}d
          </span>
          {m && (
            <span
              className={`text-xs font-medium tabular-nums ${cpaColorClass(
                m.cpa,
                m.conversions,
                concept.targetCpa
              )}`}
            >
              {m.conversions === 0 ? "No conversions" : `CPA: ${m.cpa.toFixed(2)}`}
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

      {/* Expanded view */}
      {expanded && (
        <div className="border-t border-gray-100 px-2.5 pb-2.5 pt-2">
          {/* Metrics grid */}
          {m && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-3">
              <MetricRow label="Spend" value={formatCurrency(m.totalSpend, concept.currency)} />
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
          )}

          {!m && (
            <p className="text-xs text-gray-400 mb-3">No metrics data yet.</p>
          )}

          {/* Kill button (only for review/active) */}
          {(concept.stage === "review" || concept.stage === "active") && !isKilling && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStartKill();
              }}
              className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium"
            >
              <Trash2 className="w-3 h-3" />
              Kill Concept
            </button>
          )}

          {/* Kill form */}
          {isKilling && (
            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
              <textarea
                value={killNotes}
                onChange={(e) => onKillNotesChange(e.target.value)}
                placeholder="What did you learn from this concept?"
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={onConfirmKill}
                  className="flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Kill & Save Learnings
                </button>
                <button
                  onClick={onCancelKill}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
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
