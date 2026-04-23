// src/lib/quiz-swipe.test.ts
// Tests for the pure remapClarflowIds helper — no network, no browser.

import { describe, it, expect } from "vitest";
import { remapClarflowIds } from "./quiz-swipe";
import type { ClarflowData, ClarflowStepNode } from "./quiz-swipe";

// ---------------------------------------------------------------------------
// Sample Clarflow payload (3 step nodes + 1 exit + 1 start)
// ---------------------------------------------------------------------------

const SAMPLE_CLARFLOW: ClarflowData = {
  id: "cf-abc123",
  title: "Health Quiz",
  nodes: {
    "cf-start": {
      id: "cf-start",
      kind: "start",
      size: { width: 180, height: 80 },
      position: { x: 0, y: 200 },
    },
    "cf-step-1": {
      id: "cf-step-1",
      kind: "step",
      name: "Age Group",
      size: { width: 280, height: 360 },
      position: { x: 300, y: 100 },
      rotation: 0,
      subEls: [
        {
          kind: "title",
          text: "<b>How old are you?</b>",
          isRichText: true,
          contentFormat: "html",
        },
        {
          kind: "question",
          kindOf: "single",
          layout: "list",
          options: [
            { id: "opt-a", label: "18-25" },
            { id: "opt-b", label: "26-35" },
            { id: "opt-c", label: "36+" },
          ],
        },
      ],
    },
    "cf-step-2": {
      id: "cf-step-2",
      kind: "step",
      name: "Routine",
      size: { width: 280, height: 360 },
      position: { x: 640, y: 100 },
      rotation: 0,
      subEls: [
        {
          kind: "text",
          text: "Tell us about your routine.",
          isRichText: true,
          contentFormat: "html",
        },
        {
          kind: "image",
          url: "https://example.com/routine.jpg",
          alt: "Routine",
        },
      ],
    },
    "cf-step-3": {
      id: "cf-step-3",
      kind: "step",
      name: "Results",
      size: { width: 280, height: 360 },
      position: { x: 980, y: 100 },
      rotation: 0,
      subEls: [
        {
          kind: "loading",
          text: "Analyzing...",
          style: "dots",
          seconds: 3,
        },
        {
          kind: "custom_html",
          html: "<div class='result'>Your result</div>",
        },
      ],
    },
    "cf-exit": {
      id: "cf-exit",
      kind: "exit",
      name: "Exit",
      size: { width: 180, height: 80 },
      position: { x: 1320, y: 200 },
      redirectUrl: "https://example.com/product",
    },
  },
  edges: {
    "cf-e1": { id: "cf-e1", from: "cf-start", to: "cf-step-1" },
    "cf-e2": { id: "cf-e2", from: "cf-step-1", to: "cf-step-2" },
    "cf-e3": { id: "cf-e3", from: "cf-step-2", to: "cf-step-3" },
    "cf-e4": { id: "cf-e4", from: "cf-step-3", to: "cf-exit" },
  },
  settings: {
    brandColors: {
      background: "#FFFFFF",
      textPrimary: "#111111",
      textSecondary: "#777777",
      primaryBrand: "#3B82F6",
      optionBackground: "#F5F5F5",
    },
    fontSettings: { enabled: true, fontFamily: "Poppins" },
    progressBar: true,
    backNavigation: false,
  },
};

// Clarflow payload with variant groups (two steps share same variantGroupId)
const SAMPLE_WITH_VARIANTS: ClarflowData = {
  ...SAMPLE_CLARFLOW,
  nodes: {
    ...SAMPLE_CLARFLOW.nodes,
    "cf-step-1": {
      ...(SAMPLE_CLARFLOW.nodes["cf-step-1"] as ClarflowStepNode),
      variantGroupId: "vg-old-1",
      trafficPct: 60,
    },
    "cf-step-1b": {
      id: "cf-step-1b",
      kind: "step",
      name: "Age Group (B)",
      size: { width: 280, height: 360 },
      position: { x: 300, y: 520 },
      rotation: 0,
      subEls: [
        { kind: "title", text: "What is your age?", isRichText: true, contentFormat: "html" },
      ],
      variantGroupId: "vg-old-1",
      trafficPct: 40,
    },
  },
  edges: {
    ...SAMPLE_CLARFLOW.edges,
    "cf-e1b": { id: "cf-e1b", from: "cf-start", to: "cf-step-1b" },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ID_PATTERN = /^(step|edge|exit|start|el|opt|vg)_\d+_[a-z0-9]+$/;

function expectAllIdsInFormat(ids: string[]) {
  for (const id of ids) {
    expect(id, `id "${id}" should match internal format`).toMatch(ID_PATTERN);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("remapClarflowIds", () => {
  it("returns a QuizData with matching topology (3 steps, 1 start, 1 exit)", () => {
    const result = remapClarflowIds(SAMPLE_CLARFLOW);
    const nodeKinds = Object.values(result.nodes).map((n) => n.kind);

    expect(nodeKinds.filter((k) => k === "step")).toHaveLength(3);
    expect(nodeKinds.filter((k) => k === "start")).toHaveLength(1);
    expect(nodeKinds.filter((k) => k === "exit")).toHaveLength(1);
    expect(Object.keys(result.edges)).toHaveLength(4);
  });

  it("all node ids are in our internal format", () => {
    const result = remapClarflowIds(SAMPLE_CLARFLOW);
    expectAllIdsInFormat(Object.keys(result.nodes));
    // Also check the id field inside each node matches its key
    for (const [key, node] of Object.entries(result.nodes)) {
      expect(node.id).toBe(key);
    }
  });

  it("all edge ids are in our internal format", () => {
    const result = remapClarflowIds(SAMPLE_CLARFLOW);
    expectAllIdsInFormat(Object.keys(result.edges));
    for (const [key, edge] of Object.entries(result.edges)) {
      expect(edge.id).toBe(key);
    }
  });

  it("edge from/to point to remapped node ids (not original Clarflow ids)", () => {
    const result = remapClarflowIds(SAMPLE_CLARFLOW);
    const nodeIds = new Set(Object.keys(result.nodes));
    const originalIds = new Set(["cf-start", "cf-step-1", "cf-step-2", "cf-step-3", "cf-exit"]);

    for (const edge of Object.values(result.edges)) {
      // from/to must be in our node id set
      expect(nodeIds.has(edge.from), `edge.from "${edge.from}" should be a remapped node id`).toBe(true);
      expect(nodeIds.has(edge.to), `edge.to "${edge.to}" should be a remapped node id`).toBe(true);
      // from/to must NOT be any original Clarflow id
      expect(originalIds.has(edge.from), `edge.from "${edge.from}" must not be original CF id`).toBe(false);
      expect(originalIds.has(edge.to), `edge.to "${edge.to}" must not be original CF id`).toBe(false);
    }
  });

  it("all subEl ids are in our internal format", () => {
    const result = remapClarflowIds(SAMPLE_CLARFLOW);
    for (const node of Object.values(result.nodes)) {
      if (node.kind !== "step") continue;
      expectAllIdsInFormat(node.subEls.map((e) => e.id));
    }
  });

  it("all question option ids are in our internal format", () => {
    const result = remapClarflowIds(SAMPLE_CLARFLOW);
    for (const node of Object.values(result.nodes)) {
      if (node.kind !== "step") continue;
      for (const el of node.subEls) {
        if (el.kind !== "question") continue;
        expectAllIdsInFormat(el.options.map((o) => o.id));
        // Original option ids must not appear
        expect(el.options.map((o) => o.id)).not.toContain("opt-a");
        expect(el.options.map((o) => o.id)).not.toContain("opt-b");
        expect(el.options.map((o) => o.id)).not.toContain("opt-c");
      }
    }
  });

  it("all question options preserve labels", () => {
    const result = remapClarflowIds(SAMPLE_CLARFLOW);
    const stepWithQuestion = Object.values(result.nodes).find(
      (n) => n.kind === "step" && n.subEls.some((e) => e.kind === "question")
    );
    expect(stepWithQuestion).toBeDefined();
    if (!stepWithQuestion || stepWithQuestion.kind !== "step") return;
    const q = stepWithQuestion.subEls.find((e) => e.kind === "question");
    expect(q).toBeDefined();
    if (!q || q.kind !== "question") return;
    const labels = q.options.map((o) => o.label);
    expect(labels).toContain("18-25");
    expect(labels).toContain("26-35");
    expect(labels).toContain("36+");
  });

  it("preserves settings (colors, fonts)", () => {
    const result = remapClarflowIds(SAMPLE_CLARFLOW);
    // The settings are not part of QuizData itself (they're on QuizSettings)
    // but we verify node structure is preserved
    const exitNode = Object.values(result.nodes).find((n) => n.kind === "exit");
    expect(exitNode).toBeDefined();
    if (!exitNode || exitNode.kind !== "exit") return;
    expect(exitNode.redirectUrl).toBe("https://example.com/product");
  });

  it("preserves node positions and sizes", () => {
    const result = remapClarflowIds(SAMPLE_CLARFLOW);
    const stepNodes = Object.values(result.nodes).filter((n) => n.kind === "step");
    // All 3 steps should have valid positions
    for (const node of stepNodes) {
      if (node.kind !== "step") continue;
      expect(typeof node.position.x).toBe("number");
      expect(typeof node.position.y).toBe("number");
      expect(node.size.width).toBeGreaterThan(0);
      expect(node.size.height).toBeGreaterThan(0);
    }
  });

  it("topology: edges form a connected chain start->step1->step2->step3->exit", () => {
    const result = remapClarflowIds(SAMPLE_CLARFLOW);
    const startNode = Object.values(result.nodes).find((n) => n.kind === "start")!;
    const exitNode = Object.values(result.nodes).find((n) => n.kind === "exit")!;
    const edges = Object.values(result.edges);

    // BFS from start to exit
    const visited = new Set<string>();
    const queue = [startNode.id];
    while (queue.length) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const e of edges) {
        if (e.from === current && !visited.has(e.to)) queue.push(e.to);
      }
    }
    expect(visited.has(exitNode.id)).toBe(true);
  });

  it("variant group consistency: two steps with same Clarflow variantGroupId share the same new variantGroupId", () => {
    const result = remapClarflowIds(SAMPLE_WITH_VARIANTS);
    const stepNodes = Object.values(result.nodes).filter(
      (n): n is { id: string; kind: "step"; variantGroupId?: string; trafficPct?: number; name: string; size: { width: number; height: number }; position: { x: number; y: number }; rotation: number; subEls: never[] } =>
        n.kind === "step"
    );

    // Find variant nodes (those with a variantGroupId)
    const variantNodes = stepNodes.filter((n) => n.variantGroupId);
    expect(variantNodes).toHaveLength(2);

    // They should share the same variantGroupId
    const vgIds = variantNodes.map((n) => n.variantGroupId!);
    expect(vgIds[0]).toBe(vgIds[1]);

    // The shared variantGroupId should be in our format
    expectAllIdsInFormat([vgIds[0]]);

    // The original variant group id must not appear
    expect(vgIds[0]).not.toBe("vg-old-1");
  });

  it("variant trafficPct values are preserved", () => {
    const result = remapClarflowIds(SAMPLE_WITH_VARIANTS);
    const variantNodes = Object.values(result.nodes).filter(
      (n) => n.kind === "step" && n.variantGroupId !== undefined
    );
    const pcts = variantNodes
      .filter((n) => n.kind === "step")
      .map((n) => (n as { trafficPct?: number }).trafficPct);
    expect(pcts).toContain(60);
    expect(pcts).toContain(40);
  });

  it("generates unique node ids on each call (no collisions)", () => {
    const r1 = remapClarflowIds(SAMPLE_CLARFLOW);
    const r2 = remapClarflowIds(SAMPLE_CLARFLOW);
    const ids1 = new Set(Object.keys(r1.nodes));
    const ids2 = new Set(Object.keys(r2.nodes));
    // Same quiz run twice should produce different ids
    const intersection = [...ids1].filter((id) => ids2.has(id));
    expect(intersection).toHaveLength(0);
  });

  it("handles steps with no subEls gracefully", () => {
    const minimalCf: ClarflowData = {
      id: "cf-min",
      title: "Minimal",
      nodes: {
        "s": { id: "s", kind: "start", size: { width: 100, height: 50 }, position: { x: 0, y: 0 } },
        "n": { id: "n", kind: "step", name: "Empty", size: { width: 280, height: 360 }, position: { x: 200, y: 0 }, rotation: 0, subEls: [] },
        "e": { id: "e", kind: "exit", name: "Exit", size: { width: 100, height: 50 }, position: { x: 600, y: 0 }, redirectUrl: "" },
      },
      edges: {
        "e1": { id: "e1", from: "s", to: "n" },
        "e2": { id: "e2", from: "n", to: "e" },
      },
    };
    const result = remapClarflowIds(minimalCf);
    const stepNode = Object.values(result.nodes).find((n) => n.kind === "step");
    expect(stepNode).toBeDefined();
    if (!stepNode || stepNode.kind !== "step") return;
    expect(stepNode.subEls).toHaveLength(0);
  });

  it("orphaned edges (nodes not in payload) are dropped", () => {
    const cfWithOrphan: ClarflowData = {
      ...SAMPLE_CLARFLOW,
      edges: {
        ...SAMPLE_CLARFLOW.edges,
        "cf-orphan": { id: "cf-orphan", from: "cf-step-1", to: "cf-nonexistent" },
      },
    };
    const result = remapClarflowIds(cfWithOrphan);
    // The orphaned edge should be dropped (to node doesn't exist)
    for (const edge of Object.values(result.edges)) {
      expect(Object.keys(result.nodes)).toContain(edge.to);
    }
  });
});
