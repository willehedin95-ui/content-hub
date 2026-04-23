"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useQuizAnalytics } from "./QuizAnalyticsContext";
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
  const { enabled: analyticsEnabled, funnelFor } = useQuizAnalytics();
  const containerRef = useRef<HTMLDivElement>(null);

  // Local ReactFlow node state so measurement/dimension changes propagate
  // (ReactFlow v12 keeps nodes visibility:hidden until measured via onNodesChange).
  // We mirror positions from `data.nodes` into this local state and sync drags back.
  const [rfNodes, setRfNodes] = useState<Node[]>(() =>
    Object.values(data.nodes).map((n: QuizNode) => ({
      id: n.id,
      type: n.kind,
      position: n.position,
      data: { node: n },
    })),
  );

  // Keep rfNodes in sync with quiz data (add/remove/update from outside the canvas).
  // Preserves ReactFlow-managed fields (measured, selected) when id still exists.
  useEffect(() => {
    setRfNodes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]));
      return Object.values(data.nodes).map((n: QuizNode) => {
        const existing = byId.get(n.id);
        return {
          ...(existing ?? {}),
          id: n.id,
          type: n.kind,
          position: n.position,
          data: { node: n },
        } as Node;
      });
    });
  }, [data.nodes]);

  const rfEdges: Edge[] = useMemo(
    () =>
      Object.values(data.edges).map((e) => {
        // When analytics overlay is on, show the session count on the source node as edge label
        const analyticsLabel =
          analyticsEnabled && e.from ? funnelFor(e.from)?.sessions : undefined;

        const conditionLabel =
          e.condition?.kind === "option"
            ? `opt:${e.condition.optionId.slice(-4)}`
            : undefined;

        const label = analyticsLabel !== undefined
          ? analyticsLabel.toLocaleString()
          : conditionLabel;

        return {
          id: e.id,
          source: e.from,
          target: e.to,
          label,
        };
      }),
    [data.edges, analyticsEnabled, funnelFor],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Apply ALL changes (dimensions/measurement/position/select) to local state
      setRfNodes((prev) => applyNodeChanges(changes, prev));

      // Only persist position changes (after drag ends) back to the quiz data.
      const positionChanges = changes.filter(
        (c): c is Extract<NodeChange, { type: "position" }> =>
          c.type === "position" && !c.dragging && !!c.position,
      );
      if (positionChanges.length === 0) return;

      setData((prev) => {
        const nodes = { ...prev.nodes };
        for (const c of positionChanges) {
          const existing = nodes[c.id];
          if (existing && c.position) {
            nodes[c.id] = { ...existing, position: c.position };
          }
        }
        return { ...prev, nodes };
      });
    },
    [setData],
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
    <div ref={containerRef} className="absolute inset-0" tabIndex={0}>
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
