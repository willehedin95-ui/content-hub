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
import { addStepNode, connectNodes, removeNode, computeAutoLayout } from "@/lib/quiz-graph";
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

  // Node positions are DERIVED from the graph, never free-dragged. This keeps
  // the canvas mirroring the real flow order so it can't drift into a mess.
  const layout = useMemo(() => computeAutoLayout(data), [data]);

  // Local ReactFlow node state so measurement/dimension changes propagate
  // (ReactFlow v12 keeps nodes visibility:hidden until measured via onNodesChange).
  const [rfNodes, setRfNodes] = useState<Node[]>(() =>
    Object.values(data.nodes).map((n: QuizNode) => ({
      id: n.id,
      type: n.kind,
      position: layout[n.id] ?? n.position,
      data: { node: n },
    })),
  );

  // Keep rfNodes in sync with quiz data + recomputed layout (add/remove/reorder).
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
          position: layout[n.id] ?? n.position,
          data: { node: n },
        } as Node;
      });
    });
  }, [data.nodes, layout]);

  // Build a lookup: { stepId -> { optionId -> letter } } for option→letter labeling
  const optionLetterMap = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    for (const node of Object.values(data.nodes)) {
      if (node.kind !== "step") continue;
      for (const el of node.subEls) {
        if (el.kind !== "question") continue;
        el.options.forEach((opt, idx) => {
          if (!map[node.id]) map[node.id] = {};
          map[node.id][opt.id] = String.fromCharCode(65 + idx); // A, B, C…
        });
      }
    }
    return map;
  }, [data.nodes]);

  const rfEdges: Edge[] = useMemo(
    () =>
      Object.values(data.edges).map((e) => {
        // When analytics overlay is on, show the session count on the source node as edge label
        const analyticsLabel =
          analyticsEnabled && e.from ? funnelFor(e.from)?.sessions : undefined;

        // Show option letter (A, B, C) for conditional edges
        let conditionLabel: string | undefined;
        if (e.condition?.kind === "option") {
          const letter = optionLetterMap[e.from]?.[e.condition.optionId];
          conditionLabel = letter ?? `opt:${e.condition.optionId.slice(-4)}`;
        }

        const label = analyticsLabel !== undefined
          ? analyticsLabel.toLocaleString()
          : conditionLabel;

        return {
          id: e.id,
          source: e.from,
          target: e.to,
          label,
          type: "smoothstep",
        };
      }),
    [data.edges, analyticsEnabled, funnelFor, optionLetterMap],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Apply dimension/measurement/select changes to local state only.
      // Positions are derived from computeAutoLayout and never persisted, so
      // there is nothing to sync back to the quiz data here.
      setRfNodes((prev) => applyNodeChanges(changes, prev));
    },
    [],
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
        nodesDraggable={false}
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
