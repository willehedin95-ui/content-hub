"use client";
import { useEffect, useRef } from "react";
import { X, Crown, Trash2 } from "lucide-react";
import { useQuiz } from "@/components/quiz-builder/QuizContext";
import { getVariantGroup, promoteVariant, deleteVariant, setTrafficSplit } from "@/lib/quiz-graph";
import type { StepNode } from "@/types/quiz";

const VARIANT_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

interface VariantControlsProps {
  nodeId: string;
  onClose: () => void;
}

/**
 * Popover panel that appears when clicking the "A/B" badge on a StepNode.
 * Lets the user adjust traffic splits, promote a winner, or delete a variant.
 */
export function VariantControls({ nodeId, onClose }: VariantControlsProps) {
  const { data, setData } = useQuiz();
  const panelRef = useRef<HTMLDivElement>(null);

  const group: StepNode[] = getVariantGroup(data, nodeId).filter((n) => n.kind === "step") as StepNode[];

  // Close when clicking outside the panel
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onClose]);

  const total = group.reduce((sum, n) => sum + (n.trafficPct ?? 0), 0);

  function handleTrafficChange(changedId: string, newPct: number) {
    const clamped = Math.max(0, Math.min(100, newPct));
    const others = group.filter((n) => n.id !== changedId);

    if (others.length === 0) return; // sole member, no rebalance needed

    const updates: Record<string, number> = { [changedId]: clamped };

    if (others.length === 1) {
      // Single other variant gets the remainder
      updates[others[0].id] = 100 - clamped;
    } else {
      // Proportional rebalance across all other variants
      const othersTotal = others.reduce((s, n) => s + (n.trafficPct ?? 0), 0);
      const remainder = 100 - clamped;
      if (othersTotal === 0) {
        // Distribute evenly
        const share = Math.floor(remainder / others.length);
        const extra = remainder - share * others.length;
        others.forEach((n, i) => {
          updates[n.id] = share + (i === 0 ? extra : 0);
        });
      } else {
        // Proportional
        let allocated = 0;
        others.forEach((n, i) => {
          if (i === others.length - 1) {
            // Last one gets the rest to avoid rounding drift
            updates[n.id] = remainder - allocated;
          } else {
            const share = Math.round(((n.trafficPct ?? 0) / othersTotal) * remainder);
            updates[n.id] = share;
            allocated += share;
          }
        });
      }
    }

    setData((prev) => setTrafficSplit(prev, updates));
  }

  function handlePromote(winnerId: string) {
    setData((prev) => promoteVariant(prev, winnerId));
    onClose();
  }

  function handleDelete(variantId: string) {
    setData((prev) => deleteVariant(prev, variantId));
    // If we deleted the current node, close the popover
    if (variantId === nodeId) onClose();
    // If after deletion only 1 remains (deleteVariant clears variant fields), also close
    const remaining = group.filter((n) => n.id !== variantId);
    if (remaining.length <= 1) onClose();
  }

  if (group.length === 0) return null;

  return (
    <div
      ref={panelRef}
      className="nodrag nopan absolute top-full right-0 mt-1 z-20 w-72 bg-white border border-gray-200 rounded-lg shadow-xl"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-700">
          A/B Test &middot; {group.length} variants
        </span>
        <button
          aria-label="Close variant controls"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="p-0.5 rounded text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Variant rows */}
      <ul className="py-1">
        {group.map((variant, i) => (
          <li key={variant.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
            {/* Variant label */}
            <span className="w-5 h-5 flex items-center justify-center rounded bg-indigo-100 text-indigo-700 text-xs font-bold shrink-0">
              {VARIANT_LETTERS[i] ?? String(i + 1)}
            </span>

            {/* Step name */}
            <span className="flex-1 text-xs text-gray-700 truncate" title={variant.name}>
              {variant.name}
            </span>

            {/* Traffic % input */}
            <div className="flex items-center gap-1 shrink-0">
              <input
                type="number"
                min={0}
                max={100}
                value={variant.trafficPct ?? 0}
                aria-label={`Traffic for variant ${VARIANT_LETTERS[i] ?? i + 1}`}
                onChange={(e) => handleTrafficChange(variant.id, Number(e.target.value))}
                className="w-12 text-xs text-right border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:border-indigo-400"
              />
              <span className="text-xs text-gray-400">%</span>
            </div>

            {/* Promote */}
            <button
              aria-label={`Promote variant ${VARIANT_LETTERS[i] ?? i + 1} as winner`}
              onClick={(e) => { e.stopPropagation(); handlePromote(variant.id); }}
              title="Promote as winner"
              className="p-1 rounded text-gray-400 hover:text-amber-500 hover:bg-amber-50 transition-colors"
            >
              <Crown size={13} />
            </button>

            {/* Delete */}
            <button
              aria-label={`Delete variant ${VARIANT_LETTERS[i] ?? i + 1}`}
              onClick={(e) => { e.stopPropagation(); handleDelete(variant.id); }}
              title="Delete variant"
              className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>

      {/* Footer: traffic sum indicator */}
      <div className="px-3 py-2 border-t border-gray-100">
        <p className={`text-xs ${total === 100 ? "text-gray-400" : "text-amber-600 font-medium"}`}>
          Traffic must sum to 100% - current total: {total}%
        </p>
      </div>
    </div>
  );
}
