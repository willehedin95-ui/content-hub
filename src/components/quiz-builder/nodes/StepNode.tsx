"use client";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import type { StepNode as StepNodeData, SubEl } from "@/types/quiz";

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
  const previewTitle = getPreviewTitle(node.subEls);
  const optionLabels = getOptionLabels(node.subEls);

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg shadow-md overflow-hidden"
      style={{ width: 280 }}
    >
      <Handle type="target" position={Position.Left} />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
        <span className="text-sm font-semibold text-gray-800 truncate max-w-[200px]">{node.name}</span>
        {node.variantGroupId && (
          <span className="ml-2 px-1.5 py-0.5 text-xs font-bold bg-indigo-100 text-indigo-700 rounded shrink-0">
            A/B
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2 space-y-1.5">
        {previewTitle ? (
          <p className="text-xs text-gray-600 italic truncate">{previewTitle}</p>
        ) : (
          <p className="text-xs text-gray-400 italic">No content yet</p>
        )}

        {optionLabels.length > 0 && (
          <ul className="space-y-1 mt-1">
            {optionLabels.map((label, i) => (
              <li
                key={i}
                className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded px-2 py-1 truncate"
              >
                {label}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}
