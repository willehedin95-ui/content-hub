"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  Loader2,
  Rocket,
  ImageIcon,
  ChevronUp,
  ChevronDown,
  Trash2,
  Zap,
  XCircle,
  TrendingUp,
  Play,
  Film,
  CheckCircle2,
  CircleDot,
} from "lucide-react";
import type { PipelineStage } from "@/types";

// ── Types ────────────────────────────────────────────────────

interface LaunchpadMarket {
  market: string;
  imageJobMarketId: string;
  stage: PipelineStage;
}

interface LaunchpadConcept {
  conceptId: string;
  type: "image" | "video";
  name: string;
  conceptNumber: number | null;
  source: string;
  product: string | null;
  thumbnailUrl: string | null;
  priority: number;
  marketPriorities: Record<string, number>;
  markets: LaunchpadMarket[];
  /** @deprecated Use conceptId */
  imageJobId: string;
}

interface FormatBudgetInfo {
  available: number;
  currency: string;
  canPush: number;
  campaignBudget: number;
  activeAdSets: number;
  campaignIds: string[];
}

interface BudgetInfo {
  image: FormatBudgetInfo;
  video: FormatBudgetInfo;
  /** Combined */
  available: number;
  currency: string;
  canPush: number;
  campaignBudget: number;
  activeAdSets: number;
  campaignIds: string[];
}

interface LaunchpadData {
  concepts: LaunchpadConcept[];
  budgets: Record<string, BudgetInfo>;
}

interface PushResult {
  conceptName: string;
  success: boolean;
  details: string;
}

// ── Constants ────────────────────────────────────────────────

const PRODUCT_COLORS: Record<string, string> = {
  happysleep: "bg-indigo-100 text-indigo-700",
  hydro13: "bg-teal-100 text-teal-700",
};

const TYPE_BADGE: Record<"image" | "video", { label: string; className: string }> = {
  image: { label: "Image", className: "bg-sky-100 text-sky-700" },
  video: { label: "Video", className: "bg-violet-100 text-violet-700" },
};

const MARKETS = ["NO", "DK", "SE"] as const;
const MARKET_FLAG: Record<string, string> = { NO: "\uD83C\uDDF3\uD83C\uDDF4", DK: "\uD83C\uDDE9\uD83C\uDDF0", SE: "\uD83C\uDDF8\uD83C\uDDEA", DE: "\uD83C\uDDE9\uD83C\uDDEA" };
const MAX_CONCEPTS_PER_BATCH = 3;
const BUDGET_PER_NEW_CONCEPT = 150; // kr/day

// ── Helpers ──────────────────────────────────────────────────

function sourceBadge(source: string, conceptNumber: number | null): string {
  if (source === "hub") return `Hub${conceptNumber !== null ? ` #${String(conceptNumber).padStart(3, "0")}` : ""}`;
  if (source === "external") return `Ron${conceptNumber !== null ? ` R${String(conceptNumber).padStart(3, "0")}` : ""}`;
  return "Legacy";
}

function sourceBadgeColors(source: string): string {
  if (source === "hub") return "bg-blue-100 text-blue-700";
  if (source === "external") return "bg-purple-100 text-purple-700";
  return "bg-gray-100 text-gray-500";
}

function budgetColorClass(canPush: number): string {
  if (canPush >= 2) return "border-emerald-200 bg-emerald-50";
  if (canPush === 1) return "border-amber-200 bg-amber-50";
  return "border-red-200 bg-red-50";
}

function budgetTextClass(canPush: number): string {
  if (canPush >= 2) return "text-emerald-700";
  if (canPush === 1) return "text-amber-700";
  return "text-red-700";
}

// ── Main Component ───────────────────────────────────────────

export default function LaunchpadClient() {
  const [data, setData] = useState<LaunchpadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [increasingBudget, setIncreasingBudget] = useState<string | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<string>("SE");
  const [confirmBudget, setConfirmBudget] = useState<{ market: string; budget: BudgetInfo; conceptsNeeded: number } | null>(null);
  const [pushResult, setPushResult] = useState<PushResult | null>(null);

  // ── Data fetching ────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/launchpad");
      if (!res.ok) throw new Error("Failed to fetch launch pad data");
      const json: LaunchpadData = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      console.error("Launchpad fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch launch pad data");
    }
  }, []);

  useEffect(() => {
    fetchData().then(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-dismiss push result after 8 seconds
  useEffect(() => {
    if (!pushResult) return;
    const timer = setTimeout(() => setPushResult(null), 8000);
    return () => clearTimeout(timer);
  }, [pushResult]);

  // ── Actions ──────────────────────────────────────────────

  async function handlePush(concept: LaunchpadConcept) {
    setPushingId(concept.conceptId);
    setError(null);
    setPushResult(null);
    try {
      const res = await fetch("/api/launchpad/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conceptId: concept.conceptId,
          type: concept.type,
          markets: [selectedMarket],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Push failed");
      }
      // Build success message from results
      const results = json.results ?? [];
      const pushed = results.filter((r: { status: string }) => r.status === "pushed");
      const skipped = results.filter((r: { status: string }) => r.status === "skipped" || r.status === "already_pushed");
      const failed = results.filter((r: { status: string }) => r.status !== "pushed" && r.status !== "skipped" && r.status !== "already_pushed");

      let details = "";
      if (pushed.length > 0) {
        details += `Pushed to ${pushed.map((r: { language: string }) => r.language?.toUpperCase()).join(", ")}`;
      }
      if (skipped.length > 0) {
        details += details ? ". " : "";
        details += `Skipped ${skipped.map((r: { language: string }) => r.language?.toUpperCase()).join(", ")} (already live)`;
      }
      if (failed.length > 0) {
        details += details ? ". " : "";
        details += `Failed: ${failed.map((r: { language: string; error?: string }) => `${r.language?.toUpperCase()}${r.error ? ` (${r.error})` : ""}`).join(", ")}`;
      }

      setPushResult({
        conceptName: concept.name,
        success: pushed.length > 0 && failed.length === 0,
        details: details || "Push completed",
      });

      await fetchData();
    } catch (err) {
      console.error("Push error:", err);
      const msg = err instanceof Error ? err.message : "Failed to push concept";
      setError(msg);
      setPushResult({
        conceptName: concept.name,
        success: false,
        details: msg,
      });
    } finally {
      setPushingId(null);
    }
  }

  async function handleRemove(concept: LaunchpadConcept) {
    setRemovingId(concept.conceptId);
    setError(null);
    try {
      const res = await fetch("/api/launchpad", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptId: concept.conceptId, type: concept.type }),
      });
      if (!res.ok) throw new Error("Remove failed");
      await fetchData();
    } catch (err) {
      console.error("Remove error:", err);
      setError(err instanceof Error ? err.message : "Failed to remove concept");
    } finally {
      setRemovingId(null);
    }
  }

  async function handleReorder(index: number, direction: "up" | "down") {
    const newOrder = [...marketConcepts];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newOrder.length) return;

    [newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]];

    setReordering(true);

    try {
      const res = await fetch("/api/launchpad/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market: selectedMarket,
          order: newOrder.map((c) => ({ conceptId: c.conceptId, type: c.type })),
        }),
      });
      if (!res.ok) throw new Error("Reorder failed");
      await fetchData();
    } catch (err) {
      console.error("Reorder error:", err);
      setError(err instanceof Error ? err.message : "Failed to reorder");
      await fetchData();
    } finally {
      setReordering(false);
    }
  }

  async function handleIncreaseBudget(market: string, budget: BudgetInfo, conceptsNeeded: number) {
    setIncreasingBudget(market);
    setError(null);
    try {
      // Calculate extra budget needed: how many concepts lack room x 150 kr, in cents
      const extraNeeded = conceptsNeeded * BUDGET_PER_NEW_CONCEPT;
      const extraPerCampaign = Math.round((extraNeeded / budget.campaignIds.length) * 100); // cents, split evenly

      const res = await fetch("/api/morning-brief/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "increase_budget",
          campaign_ids: budget.campaignIds,
          extra_per_campaign: extraPerCampaign,
          market,
          concepts_count: conceptsNeeded,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Budget increase failed");
      }
      await fetchData();
    } catch (err) {
      console.error("Budget increase error:", err);
      setError(err instanceof Error ? err.message : "Failed to increase budget");
    } finally {
      setIncreasingBudget(null);
    }
  }

  // ── Rendering ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const allConcepts = data?.concepts ?? [];
  const budgets = data?.budgets ?? {};

  // Concepts for selected market — only those in "launchpad" stage for this market
  const marketConcepts = allConcepts
    .filter((c) => c.markets.some((m) => m.market === selectedMarket && m.stage === "launchpad"))
    .sort((a, b) => {
      const aPrio = a.marketPriorities?.[selectedMarket] ?? a.priority;
      const bPrio = b.marketPriorities?.[selectedMarket] ?? b.priority;
      return aPrio - bPrio;
    });

  const selectedBudget = budgets[selectedMarket];

  return (
    <div className="max-w-[900px] pl-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Launch Pad</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Concepts waiting to be pushed to Meta. Auto-pushes daily at 04:00 CET, or click Push Now.
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchData().then(() => setLoading(false)); }}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <Rocket className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Push result banner */}
      {pushResult && (
        <div
          className={`flex items-center justify-between rounded-lg px-4 py-3 mb-4 text-sm ${
            pushResult.success
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          <div className="flex items-center gap-2">
            {pushResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            )}
            <div>
              <span className="font-medium">{pushResult.conceptName}</span>
              <span className="mx-1.5 text-gray-400">—</span>
              <span>{pushResult.details}</span>
            </div>
          </div>
          <button onClick={() => setPushResult(null)} className="text-gray-400 hover:text-gray-600 ml-2">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && !pushResult && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 mb-4 text-sm">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Market tabs */}
      <div className="flex items-center gap-1 mb-4">
        {MARKETS.map((market) => {
          const flag = MARKET_FLAG[market];
          const count = allConcepts.filter((c) =>
            c.markets.some((m) => m.market === market && m.stage === "launchpad")
          ).length;
          return (
            <button
              key={market}
              onClick={() => setSelectedMarket(market)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                selectedMarket === market
                  ? "bg-indigo-100 text-indigo-700"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              }`}
            >
              {flag} {market} ({count})
            </button>
          );
        })}
      </div>

      {/* Budget indicator — single card for selected market */}
      {selectedBudget && (
        <div className={`border rounded-xl p-4 mb-6 ${budgetColorClass(selectedBudget.canPush)}`}>
          <div className="flex items-center justify-between mb-1.5">
            <p className={`text-lg font-bold ${budgetTextClass(selectedBudget.canPush)}`}>
              {Math.min(selectedBudget.canPush, MAX_CONCEPTS_PER_BATCH)} new concept{Math.min(selectedBudget.canPush, MAX_CONCEPTS_PER_BATCH) !== 1 ? "s" : ""}/day
            </p>
            <span className="text-xs text-gray-400 font-medium">
              {selectedBudget.campaignBudget} SEK/day
            </span>
          </div>
          {selectedBudget.canPush > 0 ? (
            <p className="text-xs text-gray-500">
              {selectedBudget.available} SEK compressible from {selectedBudget.activeAdSets} active ad set{selectedBudget.activeAdSets !== 1 ? "s" : ""}
            </p>
          ) : (
            <p className="text-xs text-gray-500">
              Winners consuming full budget across {selectedBudget.activeAdSets} ad set{selectedBudget.activeAdSets !== 1 ? "s" : ""}
            </p>
          )}
          {selectedBudget.image.campaignBudget > 0 && selectedBudget.video.campaignBudget > 0 && (
            <div className="flex gap-3 mt-1.5 text-xs text-gray-400">
              <span>Images: {selectedBudget.image.canPush}</span>
              <span>Videos: {selectedBudget.video.canPush}</span>
            </div>
          )}
          {(() => {
            const queuedForMarket = marketConcepts.length;
            const needsMore = queuedForMarket > 0 && selectedBudget.canPush < Math.min(queuedForMarket, MAX_CONCEPTS_PER_BATCH);
            if (!needsMore || selectedBudget.campaignIds.length === 0) return null;
            const conceptsNeeded = Math.min(queuedForMarket, MAX_CONCEPTS_PER_BATCH) - selectedBudget.canPush;
            const extraBudget = conceptsNeeded * BUDGET_PER_NEW_CONCEPT;
            return (
              <button
                onClick={() => setConfirmBudget({ market: selectedMarket, budget: selectedBudget, conceptsNeeded })}
                disabled={increasingBudget === selectedMarket}
                className="mt-2 w-full flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                {increasingBudget === selectedMarket ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <TrendingUp className="w-3.5 h-3.5" />
                )}
                +{extraBudget} SEK/day for {conceptsNeeded} more concept{conceptsNeeded !== 1 ? "s" : ""}
              </button>
            );
          })()}
        </div>
      )}

      {/* Empty state */}
      {marketConcepts.length === 0 && (
        <div className="text-center py-16 bg-gray-50 border border-dashed border-gray-200 rounded-xl">
          <Rocket className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-gray-600 mb-1">
            No concepts waiting for {selectedMarket}
          </h3>
          <p className="text-xs text-gray-400">
            Add concepts from the Concepts or Video Ads page.
          </p>
        </div>
      )}

      {/* Concept list */}
      {marketConcepts.length > 0 && (
        <div className="space-y-3">
          {marketConcepts.map((concept, index) => {
            const typeBadge = TYPE_BADGE[concept.type];
            const liveMarkets = concept.markets.filter((m) => m.stage === "testing" || m.stage === "active");

            return (
              <div
                key={`${concept.type}-${concept.conceptId}`}
                className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  {/* Thumbnail — bigger for better recognition */}
                  <div className="relative shrink-0">
                    {concept.thumbnailUrl ? (
                      <Image
                        src={concept.thumbnailUrl}
                        alt={concept.name}
                        width={64}
                        height={64}
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center">
                        {concept.type === "video" ? (
                          <Film className="w-6 h-6 text-gray-300" />
                        ) : (
                          <ImageIcon className="w-6 h-6 text-gray-300" />
                        )}
                      </div>
                    )}
                    {/* Play icon overlay for video */}
                    {concept.type === "video" && concept.thumbnailUrl && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center">
                          <Play className="w-3.5 h-3.5 text-white ml-0.5" fill="white" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Name + meta badges */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        <span className="text-indigo-600">#{index + 1}</span>
                        <span className="text-gray-300 mx-1">&middot;</span>
                        {concept.name}
                      </p>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${typeBadge.className}`}>
                        {typeBadge.label}
                      </span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${sourceBadgeColors(concept.source)}`}>
                        {sourceBadge(concept.source, concept.conceptNumber)}
                      </span>
                      {concept.product && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${PRODUCT_COLORS[concept.product] || "bg-gray-100 text-gray-500"}`}>
                          {concept.product === "happysleep" ? "HappySleep" : concept.product === "hydro13" ? "Hydro13" : concept.product}
                        </span>
                      )}
                    </div>

                    {/* Market status */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                        <CircleDot className="w-3 h-3" />
                        Ready to push
                      </span>
                      {liveMarkets.map((m) => {
                        const flag = MARKET_FLAG[m.market] ?? m.market;
                        return (
                          <span
                            key={m.imageJobMarketId}
                            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            {flag} Live
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Reorder buttons */}
                    <button
                      onClick={() => handleReorder(index, "up")}
                      disabled={index === 0 || reordering}
                      className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                      title="Move up"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleReorder(index, "down")}
                      disabled={index === marketConcepts.length - 1 || reordering}
                      className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                      title="Move down"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>

                    {/* Push button */}
                    <button
                      onClick={() => handlePush(concept)}
                      disabled={pushingId !== null}
                      className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors ml-1"
                      title="Push to Meta"
                    >
                      {pushingId === concept.conceptId ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Zap className="w-3.5 h-3.5" />
                      )}
                      {pushingId === concept.conceptId ? "Pushing..." : "Push"}
                    </button>

                    {/* Remove button */}
                    <button
                      onClick={() => handleRemove(concept)}
                      disabled={removingId !== null}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 transition-colors"
                      title="Remove from launch pad"
                    >
                      {removingId === concept.conceptId ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation dialog for budget increases */}
      {confirmBudget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Increase daily budget?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will add {confirmBudget.conceptsNeeded * BUDGET_PER_NEW_CONCEPT} SEK/day to your {confirmBudget.market} campaigns
              ({Math.round((confirmBudget.conceptsNeeded * BUDGET_PER_NEW_CONCEPT) / confirmBudget.budget.campaignIds.length)} SEK/day each across {confirmBudget.budget.campaignIds.length} campaign{confirmBudget.budget.campaignIds.length !== 1 ? "s" : ""}).
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmBudget(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const { market, budget, conceptsNeeded } = confirmBudget;
                  setConfirmBudget(null);
                  await handleIncreaseBudget(market, budget, conceptsNeeded);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors"
              >
                Yes, increase
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
