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

// ── Constants ────────────────────────────────────────────────

type TypeFilter = "all" | "image" | "video";

const PRODUCT_COLORS: Record<string, string> = {
  happysleep: "bg-indigo-100 text-indigo-700",
  hydro13: "bg-teal-100 text-teal-700",
};

const TYPE_BADGE: Record<"image" | "video", { label: string; className: string }> = {
  image: { label: "Image", className: "bg-sky-100 text-sky-700" },
  video: { label: "Video", className: "bg-violet-100 text-violet-700" },
};

const MARKETS = ["NO", "DK", "SE"] as const;
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

function stageDisplay(stage: PipelineStage): { label: string; className: string } {
  switch (stage) {
    case "launchpad":
      return { label: "Waiting", className: "text-amber-600" };
    case "testing":
    case "active":
      return { label: "Live", className: "text-emerald-600" };
    default:
      return { label: stage, className: "text-gray-500" };
  }
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
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

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

  // ── Actions ──────────────────────────────────────────────

  async function handlePush(concept: LaunchpadConcept) {
    setPushingId(concept.conceptId);
    setError(null);
    try {
      const res = await fetch("/api/launchpad/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptId: concept.conceptId, type: concept.type }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Push failed");
      }
      await fetchData();
    } catch (err) {
      console.error("Push error:", err);
      setError(err instanceof Error ? err.message : "Failed to push concept");
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

  async function handleReorder(concepts: LaunchpadConcept[], index: number, direction: "up" | "down") {
    const newOrder = [...concepts];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newOrder.length) return;

    [newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]];

    // Optimistic update
    setData((prev) => prev ? { ...prev, concepts: newOrder } : prev);
    setReordering(true);

    try {
      const res = await fetch("/api/launchpad/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: newOrder.map((c) => ({ conceptId: c.conceptId, type: c.type })),
        }),
      });
      if (!res.ok) throw new Error("Reorder failed");
      await fetchData();
    } catch (err) {
      console.error("Reorder error:", err);
      setError(err instanceof Error ? err.message : "Failed to reorder");
      // Revert optimistic update
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
  const concepts = typeFilter === "all"
    ? allConcepts
    : allConcepts.filter((c) => c.type === typeFilter);
  const budgets = data?.budgets ?? {};

  const imageCount = allConcepts.filter((c) => c.type === "image").length;
  const videoCount = allConcepts.filter((c) => c.type === "video").length;

  return (
    <div className="max-w-[900px] pl-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Launch Pad</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Concepts ready to push to Meta. Auto-push picks from here based on budget.
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

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 mb-4 text-sm">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Type filter tabs */}
      {allConcepts.length > 0 && (
        <div className="flex items-center gap-1 mb-4">
          {(
            [
              { key: "all" as TypeFilter, label: "All", count: allConcepts.length },
              { key: "image" as TypeFilter, label: "Images", count: imageCount },
              { key: "video" as TypeFilter, label: "Videos", count: videoCount },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTypeFilter(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                typeFilter === tab.key
                  ? "bg-indigo-100 text-indigo-700"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      )}

      {/* Budget indicators */}
      {Object.keys(budgets).length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {MARKETS.map((market) => {
            const budget = budgets[market];
            if (!budget) {
              return (
                <div
                  key={market}
                  className="border border-gray-200 bg-gray-50 rounded-xl p-4"
                >
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{market}</p>
                  <p className="text-sm text-gray-400">No campaign configured</p>
                </div>
              );
            }

            // Count queued concepts for this market
            const queuedForMarket = allConcepts.filter((c) =>
              c.markets.some((m) => m.market === market && m.stage === "launchpad")
            ).length;
            const effectiveCanPush = Math.min(budget.canPush, MAX_CONCEPTS_PER_BATCH);
            const needsMore = queuedForMarket > 0 && budget.canPush < Math.min(queuedForMarket, MAX_CONCEPTS_PER_BATCH);
            const conceptsNeeded = Math.min(queuedForMarket, MAX_CONCEPTS_PER_BATCH) - budget.canPush;
            const extraBudget = conceptsNeeded * BUDGET_PER_NEW_CONCEPT;

            const hasImageBudget = budget.image.campaignBudget > 0 || budget.image.activeAdSets > 0;
            const hasVideoBudget = budget.video.campaignBudget > 0 || budget.video.activeAdSets > 0;

            return (
              <div
                key={market}
                className={`border rounded-xl p-4 ${budgetColorClass(budget.canPush)}`}
              >
                <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${budgetTextClass(budget.canPush)}`}>
                  {market}
                </p>
                {budget.canPush > 0 ? (
                  <div>
                    <p className={`text-sm font-medium ${budgetTextClass(budget.canPush)}`}>
                      {budget.available} {budget.currency} available for testing
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {budget.campaignBudget} {budget.currency}/day &middot; {budget.activeAdSets} active &middot; ~{effectiveCanPush} per batch (max {MAX_CONCEPTS_PER_BATCH})
                    </p>
                    {/* Per-format breakdown if both formats have campaigns */}
                    {hasImageBudget && hasVideoBudget && (
                      <div className="flex gap-3 mt-1.5 text-xs text-gray-400">
                        <span>Img: {budget.image.canPush} slots</span>
                        <span>Vid: {budget.video.canPush} slots</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-red-700">
                      Winners consuming full budget
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {budget.campaignBudget} {budget.currency}/day &middot; {budget.activeAdSets} active
                    </p>
                  </div>
                )}
                {needsMore && budget.campaignIds.length > 0 && (
                  <button
                    onClick={() => handleIncreaseBudget(market, budget, conceptsNeeded)}
                    disabled={increasingBudget === market}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {increasingBudget === market ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <TrendingUp className="w-3.5 h-3.5" />
                    )}
                    +{extraBudget} {budget.currency}/day for {conceptsNeeded} concept{conceptsNeeded !== 1 ? "s" : ""}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {concepts.length === 0 && (
        <div className="text-center py-16 bg-gray-50 border border-dashed border-gray-200 rounded-xl">
          <Rocket className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-gray-600 mb-1">
            {typeFilter !== "all" && allConcepts.length > 0
              ? `No ${typeFilter} concepts on launch pad`
              : "No concepts on launch pad"}
          </h3>
          <p className="text-xs text-gray-400">
            Add concepts from the Concepts or Video Ads page.
          </p>
        </div>
      )}

      {/* Concept list */}
      {concepts.length > 0 && (
        <div className="space-y-3">
          {concepts.map((concept, index) => {
            const typeBadge = TYPE_BADGE[concept.type];
            return (
              <div
                key={`${concept.type}-${concept.conceptId}`}
                className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  {/* Priority number */}
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-indigo-600 tabular-nums">{index + 1}</span>
                  </div>

                  {/* Thumbnail */}
                  <div className="relative shrink-0">
                    {concept.thumbnailUrl ? (
                      <Image
                        src={concept.thumbnailUrl}
                        alt=""
                        width={48}
                        height={48}
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                        {concept.type === "video" ? (
                          <Film className="w-5 h-5 text-gray-300" />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-gray-300" />
                        )}
                      </div>
                    )}
                    {/* Play icon overlay for video */}
                    {concept.type === "video" && concept.thumbnailUrl && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                          <Play className="w-3 h-3 text-white ml-0.5" fill="white" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{concept.name}</p>
                    </div>

                    {/* Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      {/* Type badge */}
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${typeBadge.className}`}>
                        {typeBadge.label}
                      </span>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${sourceBadgeColors(concept.source)}`}>
                        {sourceBadge(concept.source, concept.conceptNumber)}
                      </span>
                      {concept.product && (
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${PRODUCT_COLORS[concept.product] || "bg-gray-100 text-gray-500"}`}>
                          {concept.product === "happysleep" ? "HappySleep" : concept.product === "hydro13" ? "Hydro13" : concept.product}
                        </span>
                      )}
                    </div>

                    {/* Per-market status */}
                    <div className="flex items-center gap-3">
                      {concept.markets.map((m) => {
                        const display = stageDisplay(m.stage);
                        return (
                          <span key={m.imageJobMarketId} className={`text-xs ${display.className}`}>
                            {m.market}: {m.stage === "launchpad" ? "\u23F3" : m.stage === "testing" || m.stage === "active" ? "\u2705" : ""} {display.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Reorder buttons */}
                    <button
                      onClick={() => handleReorder(allConcepts, allConcepts.findIndex((c) => c.conceptId === concept.conceptId && c.type === concept.type), "up")}
                      disabled={allConcepts.findIndex((c) => c.conceptId === concept.conceptId && c.type === concept.type) === 0 || reordering}
                      className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                      title="Move up"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleReorder(allConcepts, allConcepts.findIndex((c) => c.conceptId === concept.conceptId && c.type === concept.type), "down")}
                      disabled={allConcepts.findIndex((c) => c.conceptId === concept.conceptId && c.type === concept.type) === allConcepts.length - 1 || reordering}
                      className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                      title="Move down"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>

                    {/* Push button */}
                    <button
                      onClick={() => handlePush(concept)}
                      disabled={pushingId !== null}
                      className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ml-1"
                      title="Push to Meta now"
                    >
                      {pushingId === concept.conceptId ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Zap className="w-3.5 h-3.5" />
                      )}
                      {pushingId === concept.conceptId ? "Pushing..." : "Push Now"}
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
    </div>
  );
}
