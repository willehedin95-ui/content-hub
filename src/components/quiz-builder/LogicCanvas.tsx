"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { useQuiz } from "./QuizContext";
import { StartNode } from "./nodes/StartNode";
import { StepNode } from "./nodes/StepNode";
import { ExitNode } from "./nodes/ExitNode";
import { addStepNode, connectNodes, removeNode } from "@/lib/quiz-graph";
import type { QuizNode } from "@/types/quiz";

const nodeTypes = {
  start: StartNode,
  step: StepNode,
  exit: ExitNode,
} as const;

function Inner() {
  const { data, setData, selectedNodeId, setSelectedNodeId } = useQuiz();
  const containerRef = useRef<HTMLDivElement>(null);

  const rfNodes: Node[] = useMemo(
    () =>
      Object.values(data.nodes).map((n: QuizNode) => ({
        id: n.id,
        type: n.kind,
        position: n.position,
        data: { node: n },
      })),
    [data.nodes],
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      Object.values(data.edges).map((e) => ({
        id: e.id,
        source: e.from,
        target: e.to,
        label:
          e.condition?.kind === "option"
            ? `opt:${e.condition.optionId.slice(-4)}`
            : undefined,
      })),
    [data.edges],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const updated = applyNodeChanges(changes, rfNodes);
      setData((prev) => {
        const nodes = { ...prev.nodes };
        for (const n of updated) {
          const existing = nodes[n.id];
          if (existing && n.position) {
            nodes[n.id] = { ...existing, position: n.position };
          }
        }
        return { ...prev, nodes };
      });
    },
    [rfNodes, setData],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      setData((prev) => connectNodes(prev, { from: c.source!, to: c.target! }));
    },
    [setData],
  );

  // Keyboard delete: Backspace/Delete removes selected step node only
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      // Don't delete if focus is inside an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      if (!selectedNodeId) return;
      setData((prev) => {
        const node = prev.nodes[selectedNodeId];
        if (!node || node.kind !== "step") return prev; // never delete start/exit
        return removeNode(prev, selectedNodeId);
      });
      setSelectedNodeId(null);
    }
    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodeId, setData, setSelectedNodeId]);

  // "+ Add step" button handler
  function handleAddStep() {
    const selectedNode = selectedNodeId ? data.nodes[selectedNodeId] : null;
    const position =
      selectedNode
        ? { x: selectedNode.position.x + 320, y: selectedNode.position.y }
        : { x: 400, y: 200 };

    setData((prev) => {
      const withStep = addStepNode(prev, { position, name: "New Step" });
      // Find the id of the newly added step (last entry)
      const newStepId = Object.keys(withStep.nodes).find(
        (id) => !prev.nodes[id],
      );
      if (selectedNodeId && newStepId) {
        return connectNodes(withStep, { from: selectedNodeId, to: newStepId });
      }
      return withStep;
    });
  }

  return (
    // tabIndex makes the div focusable so keydown events fire when canvas is clicked
    <div ref={containerRef} className="relative w-full h-full" tabIndex={0}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeClick={(_, n) => setSelectedNodeId(n.id)}
        onPaneClick={() => setSelectedNodeId(null)}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>

      {/* Floating "+ Add step" button */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
        <button
          onClick={handleAddStep}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-full shadow-lg transition-colors"
        >
          + Add step
        </button>
      </div>
    </div>
  );
}

export function LogicCanvas() {
  return (
    <ReactFlowProvider>
      <Inner />
    </ReactFlowProvider>
  );
}
