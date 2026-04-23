"use client";

/**
 * AdaptPanel
 * Shown after a successful quiz import (SwipeClient) or launched from the
 * editor top bar (QuizTopBar). Lets the user choose a product, optionally add
 * steering notes, then reviews the AI-generated diff before applying it.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  ArrowRight,
} from "lucide-react";
import type { AdaptChange } from "@/lib/quiz-adapt";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Product = {
  id: string;
  name: string;
  slug: string;
};

type AdaptPhase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "review"; adaptedData: unknown; adaptedSettings: unknown; changes: AdaptChange[]; warnings: string[]; usage: { inputTokens: number; outputTokens: number } }
  | { kind: "applying" }
  | { kind: "error"; message: string };

type Props = {
  quizId: string;
  targetMarket: "se" | "dk" | "no";
  /** If true, renders without the surrounding indigo card (for editor top bar modal) */
  inlineMode?: boolean;
  /** Called when the user cancels - caller decides how to close the panel */
  onCancel?: () => void;
};

const MARKET_LABEL: Record<"se" | "dk" | "no", string> = {
  se: "Swedish (SE)",
  dk: "Danish (DK)",
  no: "Norwegian (NO)",
};

/** Strip HTML tags and return plain text for safe display */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// ChangeDiff row
// ---------------------------------------------------------------------------

function DiffRow({ change }: { change: AdaptChange }) {
  return (
    <div className="py-2 border-b border-gray-100 last:border-0">
      <p className="text-xs font-mono text-gray-400 mb-1">
        {change.stepId} / {change.field}
      </p>
      <p className="text-xs text-gray-400 line-through mb-0.5">
        {stripHtml(change.before)}
      </p>
      <p className="text-sm text-gray-900">
        {stripHtml(change.after)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AdaptPanel component
// ---------------------------------------------------------------------------

export function AdaptPanel({ quizId, targetMarket, inlineMode = false, onCancel }: Props) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [userNotes, setUserNotes] = useState("");
  const [phase, setPhase] = useState<AdaptPhase>({ kind: "idle" });

  // Load products on mount
  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          const prods = (data as Record<string, unknown>[]).map((p) => ({
            id: p.id as string,
            name: p.name as string,
            slug: p.slug as string,
          }));
          setProducts(prods);
          if (prods.length > 0) setSelectedProductId(prods[0].id);
        }
      })
      .catch(() => {
        // silently fail - user sees empty dropdown
      })
      .finally(() => setProductsLoading(false));
  }, []);

  async function runAdaptation() {
    if (!selectedProductId) return;
    setPhase({ kind: "loading" });

    try {
      const res = await fetch(`/api/quiz/${quizId}/adapt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProductId,
          userNotes: userNotes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
        setPhase({ kind: "error", message: body.error ?? `HTTP ${res.status}` });
        return;
      }

      const result = await res.json() as {
        adaptedData: unknown;
        adaptedSettings: unknown;
        changes: AdaptChange[];
        warnings: string[];
        usage: { inputTokens: number; outputTokens: number };
      };

      setPhase({
        kind: "review",
        adaptedData: result.adaptedData,
        adaptedSettings: result.adaptedSettings,
        changes: result.changes,
        warnings: result.warnings,
        usage: result.usage,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      setPhase({ kind: "error", message });
    }
  }

  async function applyAdaptation() {
    if (phase.kind !== "review") return;
    setPhase({ kind: "applying" });

    try {
      const res = await fetch(`/api/quiz/${quizId}/apply-adaptation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: phase.adaptedData,
          settings: phase.adaptedSettings,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
        setPhase({ kind: "error", message: body.error ?? `HTTP ${res.status}` });
        return;
      }

      // Navigate to the editor
      router.push(`/quizzes/${quizId}/edit`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      setPhase({ kind: "error", message });
    }
  }

  function reset() {
    setPhase({ kind: "idle" });
  }

  const wrapClass = inlineMode
    ? ""
    : "mt-6 p-4 bg-indigo-50 border border-indigo-200 rounded-xl";

  // ---------------------------------------------------------------------------
  // Render: idle / error state - the form
  // ---------------------------------------------------------------------------

  if (phase.kind === "idle" || phase.kind === "error") {
    return (
      <div className={wrapClass}>
        {!inlineMode && (
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-indigo-900">Adapt for your product</h2>
          </div>
        )}

        <div className="space-y-3">
          {/* Product dropdown */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Product</label>
            {productsLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading products...
              </div>
            ) : products.length === 0 ? (
              <p className="text-xs text-gray-400">No products found. Add one in the Product Bank.</p>
            ) : (
              <div className="relative">
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full appearance-none border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 pr-8"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            )}
          </div>

          {/* Target market (read-only) */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Target market</label>
            <div className="text-sm text-gray-600 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
              {MARKET_LABEL[targetMarket]}
            </div>
          </div>

          {/* User notes */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Notes for AI{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={userNotes}
              onChange={(e) => setUserNotes(e.target.value)}
              placeholder="e.g. focus on the anti-aging angle, mention our 90-day guarantee"
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400 resize-none"
            />
          </div>

          {/* Error */}
          {phase.kind === "error" && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Adaptation failed</p>
                <p className="mt-0.5 text-red-600 text-xs">{phase.message}</p>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2">
            <button
              onClick={runAdaptation}
              disabled={!selectedProductId || productsLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Adapt now
            </button>
            {onCancel && (
              <button
                onClick={onCancel}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: loading
  // ---------------------------------------------------------------------------

  if (phase.kind === "loading") {
    return (
      <div className={wrapClass}>
        <div className="flex items-center gap-3 py-4">
          <Loader2 className="w-5 h-5 text-indigo-600 animate-spin flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-indigo-900">Adapting quiz copy...</p>
            <p className="text-xs text-indigo-600 mt-0.5">
              This can take 30-90 seconds for longer quizzes.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: applying
  // ---------------------------------------------------------------------------

  if (phase.kind === "applying") {
    return (
      <div className={wrapClass}>
        <div className="flex items-center gap-3 py-4">
          <Loader2 className="w-5 h-5 text-indigo-600 animate-spin flex-shrink-0" />
          <p className="text-sm font-medium text-indigo-900">Applying adaptation...</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: review
  // ---------------------------------------------------------------------------

  if (phase.kind === "review") {
    const { changes, warnings, usage } = phase;

    return (
      <div className={inlineMode ? "" : "mt-6"}>
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <h2 className="text-sm font-semibold text-gray-900">
            Adaptation ready -{" "}
            <span className="font-normal text-gray-500">
              {changes.length} {changes.length === 1 ? "change" : "changes"}
            </span>
          </h2>
          <span className="ml-auto text-xs text-gray-400">
            {usage.inputTokens.toLocaleString()} in / {usage.outputTokens.toLocaleString()} out
          </span>
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs font-semibold text-amber-700 mb-1.5 uppercase tracking-wide">
              Warnings - review manually
            </p>
            <ul className="space-y-1">
              {warnings.map((w, i) => (
                <li key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                  <span className="mt-0.5 text-amber-500">-</span>
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Diff list */}
        {changes.length > 0 ? (
          <div className="border border-gray-200 rounded-lg bg-white divide-y divide-gray-100 max-h-80 overflow-y-auto mb-4">
            <div className="px-3 py-2 bg-gray-50 text-xs font-medium text-gray-500 sticky top-0 border-b border-gray-200">
              Changes
            </div>
            <div className="px-3 divide-y divide-gray-100">
              {changes.map((c, i) => (
                <DiffRow key={i} change={c} />
              ))}
            </div>
          </div>
        ) : (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500 mb-4">
            No text changes were made - the quiz may already be in the target language.
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={applyAdaptation}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Apply
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={reset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return null;
}
