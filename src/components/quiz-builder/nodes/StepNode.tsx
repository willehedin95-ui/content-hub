"use client";
import { useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import { Edit, Copy, Trash2, Sparkles, GitBranch, Users, TrendingDown, Clock } from "lucide-react";
import type { StepNode as StepNodeData, SubEl } from "@/types/quiz";
import { useQuiz } from "@/components/quiz-builder/QuizContext";
import { useQuizAnalytics } from "@/components/quiz-builder/QuizAnalyticsContext";
import { removeNode, duplicateStep, createVariant } from "@/lib/quiz-graph";
import { VariantControls } from "@/components/quiz-builder/VariantControls";

export type StepNodeType = Node<{ node: StepNodeData }, "step">;

/** Strip HTML tags to get plain text preview. Uses regex, no HTML injection. */
function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

function getPreviewTitle(subEls: SubEl[]): string | null {
  const titleEl = subEls.find((el) => el.kind === "title" || el.kind === "text");
  if (!titleEl) return null;
  if (titleEl.kind === "title" || titleEl.kind === "text") {
    const plain = stripTags(titleEl.text).trim();
    return plain.length > 40 ? plain.slice(0, 40) + "…" : plain;
  }
  return null;
}

function getOptionLabels(subEls: SubEl[]): string[] {
  const questionEl = subEls.find((el) => el.kind === "question");
  if (!questionEl || questionEl.kind !== "question") return [];
  return questionEl.options.slice(0, 4).map((o) => o.label);
}

export function StepNode({ data }: NodeProps<StepNodeType>) {
  const { node } = data;
  const { selectedNodeId, setSelectedNodeId, setData } = useQuiz();
  const { enabled: analyticsEnabled, funnelFor, optionsFor } = useQuizAnalytics();
  const isSelected = selectedNodeId === node.id;

  const funnelRow = analyticsEnabled ? funnelFor(node.id) : undefined;
  const optionRows = analyticsEnabled ? optionsFor(node.id) : [];
  const [variantControlsOpen, setVariantControlsOpen] = useState(false);
  const abBadgeRef = useRef<HTMLButtonElement>(null);

  const previewTitle = getPreviewTitle(node.subEls);
  const optionLabels = getOptionLabels(node.subEls);

  const isStartOrExit = node.kind !== "step"; // always false for StepNode, defensive guard

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    setData((prev) => duplicateStep(prev, node.id));
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (isStartOrExit) return;
    setData((prev) => removeNode(prev, node.id));
    setSelectedNodeId(null);
  }

  function handleCreateVariant(e: React.MouseEvent) {
    e.stopPropagation();
    setData((prev) => createVariant(prev, node.id));
  }

  function handleAbBadgeClick(e: React.MouseEvent) {
    e.stopPropagation();
    setVariantControlsOpen((prev) => !prev);
  }

  return (
    <div
      className="relative bg-white border border-gray-200 rounded-lg shadow-md overflow-visible"
      style={{ width: 280 }}
    >
      <Handle type="target" position={Position.Left} />

      {/* Floating toolbar — shown only when selected */}
      {isSelected && (
        <div
          className="nodrag nopan absolute -top-10 left-0 flex items-center gap-1 bg-white border border-gray-200 rounded-lg shadow-md px-1.5 py-1 z-10"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Edit: visual indicator only, selecting the node */}
          <button
            aria-label="Edit step"
            className="p-1 rounded text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setSelectedNodeId(node.id); }}
          >
            <Edit size={14} />
          </button>

          {/* Copy */}
          <button
            aria-label="Duplicate step"
            className="p-1 rounded text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleCopy}
          >
            <Copy size={14} />
          </button>

          {/* Delete */}
          <button
            aria-label="Delete step"
            disabled={isStartOrExit}
            className="p-1 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleDelete}
          >
            <Trash2 size={14} />
          </button>

          {/* AI stub */}
          <button
            aria-label="AI assist (coming soon)"
            disabled
            title="Coming soon"
            className="p-1 rounded text-gray-300 cursor-not-allowed"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Sparkles size={14} />
          </button>

          {/* A/B branch */}
          <button
            aria-label="Create A/B variant"
            className="p-1 rounded text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleCreateVariant}
          >
            <GitBranch size={14} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg">
        <span className="text-sm font-semibold text-gray-800 truncate max-w-[200px]">{node.name}</span>
        {node.variantGroupId && (
          <button
            ref={abBadgeRef}
            aria-label="Manage A/B variants"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleAbBadgeClick}
            className="nodrag nopan ml-2 px-1.5 py-0.5 text-xs font-bold bg-indigo-100 text-indigo-700 rounded shrink-0 hover:bg-indigo-200 transition-colors"
          >
            A/B
          </button>
        )}
      </div>

      {/* Analytics overlay strip */}
      {analyticsEnabled && funnelRow && (
        <div className="px-3 py-1.5 bg-indigo-50 border-b border-indigo-100 flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1 text-xs font-semibold text-indigo-700">
            <Users size={11} />
            {funnelRow.sessions.toLocaleString()}
          </span>
          {funnelRow.dropoff_pct > 0 && (
            <span className="flex items-center gap-0.5 text-xs font-semibold text-red-500">
              <TrendingDown size={11} />
              {funnelRow.dropoff_pct}%
            </span>
          )}
          {funnelRow.median_time_sec > 0 && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Clock size={10} />
              {funnelRow.median_time_sec < 60
                ? `${Math.round(funnelRow.median_time_sec)}s`
                : `${Math.floor(funnelRow.median_time_sec / 60)}m`}
            </span>
          )}
        </div>
      )}

      {/* Body */}
      <div className="px-3 py-2 space-y-1.5">
        {previewTitle ? (
          <p className="text-xs text-gray-600 italic truncate">{previewTitle}</p>
        ) : (
          <p className="text-xs text-gray-400 italic">No content yet</p>
        )}

        {optionLabels.length > 0 && (
          <ul className="space-y-1 mt-1">
            {optionLabels.map((label, i) => {
              // Find the option id for this label to get its analytics %
              const questionEl = node.subEls.find((el) => el.kind === "question");
              const optId =
                questionEl && questionEl.kind === "question"
                  ? questionEl.options[i]?.id
                  : undefined;
              const optRow = optId ? optionRows.find((r) => r.option_id === optId) : undefined;

              return (
                <li
                  key={i}
                  className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded px-2 py-1 flex items-center justify-between gap-1"
                >
                  <span className="truncate">{label}</span>
                  {optRow && (
                    <span className="text-indigo-600 font-semibold shrink-0">
                      {optRow.option_pct_of_step}%
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Handle type="source" position={Position.Right} />

      {/* VariantControls popover — anchored below the A/B badge */}
      {variantControlsOpen && node.variantGroupId && (
        <VariantControls
          nodeId={node.id}
          onClose={() => setVariantControlsOpen(false)}
        />
      )}
    </div>
  );
}
