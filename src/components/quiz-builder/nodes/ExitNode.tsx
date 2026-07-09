"use client";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import type { ExitNode as ExitNodeData } from "@/types/quiz";

export type ExitNodeType = Node<{ node: ExitNodeData }, "exit">;

export function ExitNode({ data }: NodeProps<ExitNodeType>) {
  const { node } = data;
  const url = node.redirectUrl
    ? node.redirectUrl.length > 30
      ? node.redirectUrl.slice(0, 30) + "…"
      : node.redirectUrl
    : "No redirect URL";

  return (
    <div className="flex flex-col items-center justify-center px-5 py-3 rounded-full bg-orange-500 text-white font-semibold text-sm shadow-md min-w-[140px]">
      <Handle type="target" position={Position.Top} />
      <span>{node.name || "EXIT"}</span>
      <span className="text-xs font-normal opacity-80 mt-0.5 max-w-[160px] truncate">{url}</span>
    </div>
  );
}
