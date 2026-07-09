"use client";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import type { StartNode as StartNodeData } from "@/types/quiz";

export type StartNodeType = Node<{ node: StartNodeData }, "start">;

export function StartNode(_props: NodeProps<StartNodeType>) {
  return (
    <div className="flex items-center justify-center px-6 py-3 rounded-full bg-green-500 text-white font-semibold text-sm shadow-md min-w-[100px]">
      START
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
