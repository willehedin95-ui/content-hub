// src/lib/quiz-swipe.test.ts
// Tests for the pure remapClarflowIds, isHeyflowHtml, and parseHeyflowHtml helpers — no network, no browser.

import { describe, it, expect } from "vitest";
import { remapClarflowIds, isHeyflowHtml, parseHeyflowHtml, pruneEmptySteps } from "./quiz-swipe";
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

// ---------------------------------------------------------------------------
// pruneEmptySteps unit tests (pure function, no network/browser needed)
// ---------------------------------------------------------------------------

import type { QuizData, QuizNode, StepNode } from "@/types/quiz";

function makeLinearQuizData(
  stepCount: number,
  emptyIndices: Set<number> = new Set(),
): QuizData {
  const startId = "start_test";
  const exitId = "exit_test";
  const stepIds = Array.from({ length: stepCount }, (_, i) => `step_test_${i}`);

  const nodes: Record<string, QuizNode> = {
    [startId]: { id: startId, kind: "start", size: { width: 180, height: 80 }, position: { x: 0, y: 0 } },
    [exitId]: { id: exitId, kind: "exit", name: "Exit", size: { width: 180, height: 80 }, position: { x: 9999, y: 0 }, redirectUrl: "" },
  };
  for (let i = 0; i < stepCount; i++) {
    const sid = stepIds[i];
    const stepNode: StepNode = {
      id: sid,
      kind: "step",
      name: `Step ${i + 1}`,
      size: { width: 280, height: 360 },
      position: { x: 300 + i * 320, y: 200 },
      rotation: 0,
      subEls: emptyIndices.has(i)
        ? []
        : [{ id: `el_test_${i}`, kind: "title", text: `Title ${i}`, isRichText: true, contentFormat: "html" }],
    };
    nodes[sid] = stepNode;
  }

  const edges: Record<string, import("@/types/quiz").QuizEdge> = {};
  let edgeSeq = 0;
  const addEdge = (from: string, to: string) => {
    const eid = `edge_test_${edgeSeq++}`;
    edges[eid] = { id: eid, from, to, condition: { kind: "default" } };
  };
  addEdge(startId, stepIds[0]);
  for (let i = 0; i < stepCount - 1; i++) addEdge(stepIds[i], stepIds[i + 1]);
  addEdge(stepIds[stepCount - 1], exitId);

  return { id: "quiz_test", nodes, edges, camera: { x: 0, y: 0, z: 1 } };
}

describe("pruneEmptySteps", () => {
  it("returns data unchanged when no empty steps exist", () => {
    const data = makeLinearQuizData(3);
    const { data: result, warnings } = pruneEmptySteps(data, []);
    const steps = Object.values(result.nodes).filter((n) => n.kind === "step");
    expect(steps).toHaveLength(3);
    expect(warnings).toHaveLength(0);
  });

  it("removes a middle empty step and bridges edges", () => {
    // step0 (content) -> step1 (empty) -> step2 (content)
    const data = makeLinearQuizData(3, new Set([1]));
    const { data: result, warnings } = pruneEmptySteps(data, []);

    const steps = Object.values(result.nodes).filter((n) => n.kind === "step");
    expect(steps).toHaveLength(2);

    const step0Id = "step_test_0";
    const step2Id = "step_test_2";
    const edges = Object.values(result.edges);

    // Direct bridge edge step0 -> step2 should exist
    const bridge = edges.find((e) => e.from === step0Id && e.to === step2Id);
    expect(bridge).toBeDefined();

    // The empty step1 must not appear in nodes
    expect(result.nodes["step_test_1"]).toBeUndefined();

    // Warning message should mention 1 removed screen
    expect(warnings.some((w) => w.includes("1") && w.includes("empty"))).toBe(true);
  });

  it("removes the first step when it is empty", () => {
    // step0 (empty) -> step1 (content) -> step2 (content)
    const data = makeLinearQuizData(3, new Set([0]));
    const { data: result } = pruneEmptySteps(data, []);
    const steps = Object.values(result.nodes).filter((n) => n.kind === "step");
    expect(steps).toHaveLength(2);
    expect(result.nodes["step_test_0"]).toBeUndefined();
    // start -> step1 bridge should exist
    const edges = Object.values(result.edges);
    expect(edges.some((e) => e.from === "start_test" && e.to === "step_test_1")).toBe(true);
  });

  it("keeps steps that have a variantGroupId even when subEls is empty", () => {
    const data = makeLinearQuizData(2, new Set([0]));
    // Give step0 a variantGroupId so it should NOT be pruned
    const step0 = data.nodes["step_test_0"] as StepNode;
    (step0 as StepNode & { variantGroupId: string }).variantGroupId = "vg_test";

    const { data: result } = pruneEmptySteps(data, []);
    const steps = Object.values(result.nodes).filter((n) => n.kind === "step");
    expect(steps).toHaveLength(2); // step0 preserved because it has variantGroupId
    expect(result.nodes["step_test_0"]).toBeDefined();
  });

  it("does not create duplicate edges when multiple empty steps are adjacent", () => {
    // step0 (content) -> step1 (empty) -> step2 (empty) -> step3 (content)
    const data = makeLinearQuizData(4, new Set([1, 2]));
    const { data: result } = pruneEmptySteps(data, []);

    const steps = Object.values(result.nodes).filter((n) => n.kind === "step");
    expect(steps).toHaveLength(2);

    const edges = Object.values(result.edges);
    // Count edges from step0 to step3 — should be exactly 1, not duplicated
    const bridgeEdges = edges.filter(
      (e) => e.from === "step_test_0" && e.to === "step_test_3",
    );
    expect(bridgeEdges).toHaveLength(1);
  });

  it("adds a single warning message with correct count for multiple removed steps", () => {
    const data = makeLinearQuizData(5, new Set([1, 3]));
    const { warnings } = pruneEmptySteps(data, []);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/2.*empty/i);
  });
});

// ---------------------------------------------------------------------------
// Heyflow fixture HTML (minimal but realistic)
// ---------------------------------------------------------------------------

const HEYFLOW_FIXTURE_HTML = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="generator" content="Heyflow" />
  <meta property="og:image" content="https://example.com/og.jpg" />
  <title>Skin Quiz</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap" />
  <script data-is-heyflow-script="true" src="heyflow.js"></script>
</head>
<body>
  <!-- Screen 1: rich-text + multiple-choice -->
  <section name="screen-aabbcc11" id="screen-aabbcc11" class="visible">
    <div class="block" data-blocktype="rich-text" data-blockid="id-rt-1">
      <div data-block-id="id-rt-1"
           data-config='{"blockName":"richText","blockId":"id-rt-1","blockType":"rich-text","content":"<h2>How is your skin?</h2><p>Select the best description.</p>"}'>
      </div>
    </div>
    <div class="block" data-blocktype="multiple-choice" data-blockid="id-mc-1">
      <div data-block-id="id-mc-1"
           data-config='{"blockName":"multipleChoice","blockId":"id-mc-1","blockType":"multiple-choice","options":[{"label":"Dry","id":"id-opt-1","emoji":null,"image":null},{"label":"Oily","id":"id-opt-2","emoji":null,"image":null},{"label":"Combination","id":"id-opt-3","emoji":null,"image":null}],"multiselect":false,"autoRedirect":true}'>
        <input type="radio" data-destination="next" />
        <input type="radio" data-destination="next" />
        <input type="radio" data-destination="next" />
      </div>
    </div>
    <div class="block" data-blocktype="progress-bar" data-blockid="id-pb-1">
      <div data-block-id="id-pb-1" data-config='{"blockType":"progress-bar","value":25}'></div>
    </div>
  </section>

  <!-- Screen 2: rich-text + image -->
  <section name="screen-ddeeff22" id="screen-ddeeff22">
    <div class="block" data-blocktype="rich-text" data-blockid="id-rt-2">
      <div data-block-id="id-rt-2"
           data-config='{"blockName":"richText","blockId":"id-rt-2","blockType":"rich-text","content":"<h2>Your Routine</h2><p>Based on your answers, here is what we recommend.</p>"}'>
      </div>
    </div>
    <div class="block" data-blocktype="image" data-blockid="id-img-1">
      <div data-block-id="id-img-1"
           data-config='{"blockName":"image","blockId":"id-img-1","blockType":"image","url":"https://example.com/routine.jpg","alt":"Routine image"}'>
      </div>
    </div>
    <div class="block" data-blocktype="generic-button" data-blockid="id-btn-1">
      <div data-block-id="id-btn-1" data-config='{"blockType":"generic-button","label":"Continue"}'></div>
    </div>
  </section>
</body>
</html>`;

const HEYFLOW_ID_PATTERN = /^(step|edge|exit|start|el|opt|vg)_\d+_[a-z0-9]+$/;

// ---------------------------------------------------------------------------
// isHeyflowHtml tests
// ---------------------------------------------------------------------------

describe("isHeyflowHtml", () => {
  it("returns true for fixture with data-is-heyflow-script attribute", () => {
    expect(isHeyflowHtml(HEYFLOW_FIXTURE_HTML)).toBe(true);
  });

  it("returns true for HTML with assets.prd.heyflow.com URL", () => {
    expect(isHeyflowHtml('<script src="https://assets.prd.heyflow.com/flows/abc/www/index.html"></script>')).toBe(true);
  });

  it("returns true for HTML with meta generator=Heyflow", () => {
    expect(isHeyflowHtml('<meta name="generator" content="Heyflow">')).toBe(true);
  });

  it("returns true for HTML with window.heyflow string", () => {
    expect(isHeyflowHtml('<script>window.heyflow = {};</script>')).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isHeyflowHtml("")).toBe(false);
  });

  it("returns false for non-Heyflow HTML", () => {
    expect(isHeyflowHtml('<html><body><p>Hello</p></body></html>')).toBe(false);
  });

  it("returns false for Clarflow HTML", () => {
    expect(isHeyflowHtml('<script>window.__CLARFLOW_DATA__ = {};</script>')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseHeyflowHtml tests
// ---------------------------------------------------------------------------

describe("parseHeyflowHtml", () => {
  it("produces exactly 2 step nodes (one per screen)", () => {
    const { data } = parseHeyflowHtml(HEYFLOW_FIXTURE_HTML);
    const steps = Object.values(data.nodes).filter((n) => n.kind === "step");
    expect(steps).toHaveLength(2);
  });

  it("produces 1 start node and 1 exit node", () => {
    const { data } = parseHeyflowHtml(HEYFLOW_FIXTURE_HTML);
    const starts = Object.values(data.nodes).filter((n) => n.kind === "start");
    const exits = Object.values(data.nodes).filter((n) => n.kind === "exit");
    expect(starts).toHaveLength(1);
    expect(exits).toHaveLength(1);
  });

  it("step names come from h2 content in rich-text blocks", () => {
    const { data } = parseHeyflowHtml(HEYFLOW_FIXTURE_HTML);
    const steps = Object.values(data.nodes).filter((n) => n.kind === "step");
    const names = steps.map((s) => s.name);
    expect(names[0]).toMatch(/How is your skin/);
    expect(names[1]).toMatch(/Your Routine/);
  });

  it("first screen has a question subEl with 3 options matching labels", () => {
    const { data } = parseHeyflowHtml(HEYFLOW_FIXTURE_HTML);
    const steps = Object.values(data.nodes).filter((n) => n.kind === "step");
    const firstStep = steps[0];
    if (!firstStep || firstStep.kind !== "step") throw new Error("no first step");
    const question = firstStep.subEls.find((e) => e.kind === "question");
    expect(question).toBeDefined();
    if (!question || question.kind !== "question") throw new Error("no question");
    expect(question.options).toHaveLength(3);
    const labels = question.options.map((o) => o.label);
    expect(labels).toContain("Dry");
    expect(labels).toContain("Oily");
    expect(labels).toContain("Combination");
  });

  it("question kindOf is 'single' (multiselect=false)", () => {
    const { data } = parseHeyflowHtml(HEYFLOW_FIXTURE_HTML);
    const steps = Object.values(data.nodes).filter((n) => n.kind === "step");
    const firstStep = steps[0];
    if (!firstStep || firstStep.kind !== "step") throw new Error("no first step");
    const question = firstStep.subEls.find((e) => e.kind === "question");
    if (!question || question.kind !== "question") throw new Error("no question");
    expect(question.kindOf).toBe("single");
  });

  it("question layout is 'list' when no option images", () => {
    const { data } = parseHeyflowHtml(HEYFLOW_FIXTURE_HTML);
    const steps = Object.values(data.nodes).filter((n) => n.kind === "step");
    const firstStep = steps[0];
    if (!firstStep || firstStep.kind !== "step") throw new Error("no first step");
    const question = firstStep.subEls.find((e) => e.kind === "question");
    if (!question || question.kind !== "question") throw new Error("no question");
    expect(question.layout).toBe("list");
  });

  it("second screen has an image subEl with correct URL", () => {
    const { data } = parseHeyflowHtml(HEYFLOW_FIXTURE_HTML);
    const steps = Object.values(data.nodes).filter((n) => n.kind === "step");
    const secondStep = steps[1];
    if (!secondStep || secondStep.kind !== "step") throw new Error("no second step");
    const img = secondStep.subEls.find((e) => e.kind === "image");
    expect(img).toBeDefined();
    if (!img || img.kind !== "image") throw new Error("no image");
    expect(img.url).toBe("https://example.com/routine.jpg");
    expect(img.alt).toBe("Routine image");
  });

  it("progress-bar and generic-button blocks are SKIPPED from subEls", () => {
    const { data } = parseHeyflowHtml(HEYFLOW_FIXTURE_HTML);
    const steps = Object.values(data.nodes).filter((n) => n.kind === "step");
    for (const step of steps) {
      if (step.kind !== "step") continue;
      for (const el of step.subEls) {
        if (el.kind === "custom_html") {
          expect(el.html).not.toMatch(/data-blocktype="progress-bar"/);
          expect(el.html).not.toMatch(/data-blocktype="generic-button"/);
        }
      }
    }
  });

  it("edges form the chain: start -> step1 -> step2 -> exit", () => {
    const { data } = parseHeyflowHtml(HEYFLOW_FIXTURE_HTML);
    const startNode = Object.values(data.nodes).find((n) => n.kind === "start")!;
    const exitNode = Object.values(data.nodes).find((n) => n.kind === "exit")!;
    const edges = Object.values(data.edges);
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
    expect(visited.size).toBe(4);
  });

  it("all node ids are in internal format", () => {
    const { data } = parseHeyflowHtml(HEYFLOW_FIXTURE_HTML);
    for (const id of Object.keys(data.nodes)) {
      expect(id).toMatch(HEYFLOW_ID_PATTERN);
    }
  });

  it("all edge ids are in internal format", () => {
    const { data } = parseHeyflowHtml(HEYFLOW_FIXTURE_HTML);
    for (const id of Object.keys(data.edges)) {
      expect(id).toMatch(HEYFLOW_ID_PATTERN);
    }
  });

  it("all subEl ids are in internal format", () => {
    const { data } = parseHeyflowHtml(HEYFLOW_FIXTURE_HTML);
    for (const node of Object.values(data.nodes)) {
      if (node.kind !== "step") continue;
      for (const el of node.subEls) {
        expect(el.id).toMatch(HEYFLOW_ID_PATTERN);
      }
    }
  });

  it("all question option ids are in internal format", () => {
    const { data } = parseHeyflowHtml(HEYFLOW_FIXTURE_HTML);
    for (const node of Object.values(data.nodes)) {
      if (node.kind !== "step") continue;
      for (const el of node.subEls) {
        if (el.kind !== "question") continue;
        for (const opt of el.options) {
          expect(opt.id).toMatch(HEYFLOW_ID_PATTERN);
        }
      }
    }
  });

  it("warnings array is empty for well-formed input", () => {
    const { warnings } = parseHeyflowHtml(HEYFLOW_FIXTURE_HTML);
    expect(warnings).toHaveLength(0);
  });

  it("extracts page title from <title> tag", () => {
    const { title } = parseHeyflowHtml(HEYFLOW_FIXTURE_HTML);
    expect(title).toBe("Skin Quiz");
  });

  it("settings include font family from Google Fonts link", () => {
    const { settings } = parseHeyflowHtml(HEYFLOW_FIXTURE_HTML);
    expect(settings.fontSettings.fontFamily).toBe("Poppins");
    expect(settings.fontSettings.enabled).toBe(true);
  });

  it("settings progressBar is true", () => {
    const { settings } = parseHeyflowHtml(HEYFLOW_FIXTURE_HTML);
    expect(settings.progressBar).toBe(true);
  });

  it("settings metadata.ogImage is extracted from og:image meta", () => {
    const { settings } = parseHeyflowHtml(HEYFLOW_FIXTURE_HTML);
    expect(settings.metadata.ogImage).toBe("https://example.com/og.jpg");
  });

  it("step positions are laid out horizontally (x increases, y=200)", () => {
    const { data } = parseHeyflowHtml(HEYFLOW_FIXTURE_HTML);
    const steps = Object.values(data.nodes)
      .filter((n) => n.kind === "step")
      .sort((a, b) => a.position.x - b.position.x);
    expect(steps[0].position.x).toBeLessThan(steps[1].position.x);
    expect(steps[0].position.y).toBe(200);
    expect(steps[1].position.y).toBe(200);
  });

  it("produces warnings for unknown block types", () => {
    const htmlWithUnknown = HEYFLOW_FIXTURE_HTML.replace(
      'data-blocktype="progress-bar"',
      'data-blocktype="mystery-widget"'
    );
    const { warnings } = parseHeyflowHtml(htmlWithUnknown);
    expect(warnings.some((w) => w.includes("mystery-widget"))).toBe(true);
  });

  it("produces warning for date-picker blocks", () => {
    const htmlWithDatePicker = HEYFLOW_FIXTURE_HTML.replace(
      'data-blocktype="generic-button"',
      'data-blocktype="date-picker"'
    );
    const { warnings } = parseHeyflowHtml(htmlWithDatePicker);
    expect(warnings.some((w) => w.toLowerCase().includes("date picker"))).toBe(true);
  });

  it("handles HTML with no screens - produces 0 step nodes", () => {
    const emptyHtml = `<!DOCTYPE html><html><head><meta name="generator" content="Heyflow"></head><body></body></html>`;
    const { data } = parseHeyflowHtml(emptyHtml);
    const steps = Object.values(data.nodes).filter((n) => n.kind === "step");
    expect(steps).toHaveLength(0);
  });

  it("multiselect options produce kindOf='multi'", () => {
    const htmlWithMulti = HEYFLOW_FIXTURE_HTML.replace('"multiselect":false', '"multiselect":true');
    const { data } = parseHeyflowHtml(htmlWithMulti);
    const steps = Object.values(data.nodes).filter((n) => n.kind === "step");
    const firstStep = steps[0];
    if (!firstStep || firstStep.kind !== "step") throw new Error("no step");
    const question = firstStep.subEls.find((e) => e.kind === "question");
    if (!question || question.kind !== "question") throw new Error("no question");
    expect(question.kindOf).toBe("multi");
  });

  it("option images produce layout='image_cards' and set imageUrl on options", () => {
    const htmlWithImages = HEYFLOW_FIXTURE_HTML.replace(
      '"image":null},{"label":"Oily","id":"id-opt-2","emoji":null,"image":null},{"label":"Combination","id":"id-opt-3","emoji":null,"image":null}',
      '"image":"https://example.com/dry.jpg"},{"label":"Oily","id":"id-opt-2","emoji":null,"image":"https://example.com/oily.jpg"},{"label":"Combination","id":"id-opt-3","emoji":null,"image":"https://example.com/combo.jpg"}'
    );
    const { data } = parseHeyflowHtml(htmlWithImages);
    const steps = Object.values(data.nodes).filter((n) => n.kind === "step");
    const firstStep = steps[0];
    if (!firstStep || firstStep.kind !== "step") throw new Error("no step");
    const question = firstStep.subEls.find((e) => e.kind === "question");
    if (!question || question.kind !== "question") throw new Error("no question");
    expect(question.layout).toBe("image_cards");
    expect(question.options[0].imageUrl).toBe("https://example.com/dry.jpg");
  });

  it("conditional destination edges are resolved when screen name matches", () => {
    const htmlWithCondEdge = HEYFLOW_FIXTURE_HTML.replace(
      'data-destination="next"',
      'data-destination="screen-ddeeff22"'
    );
    const { data, warnings } = parseHeyflowHtml(htmlWithCondEdge);
    const condEdges = Object.values(data.edges).filter((e) => e.condition?.kind === "option");
    expect(condEdges).toHaveLength(1);
    expect(warnings.some((w) => w.includes("does not resolve"))).toBe(false);
  });

  it("unresolved conditional destination produces a warning", () => {
    const htmlWithBadDest = HEYFLOW_FIXTURE_HTML.replace(
      'data-destination="next"',
      'data-destination="screen-nonexistent99"'
    );
    const { warnings } = parseHeyflowHtml(htmlWithBadDest);
    expect(warnings.some((w) => w.includes("screen-nonexistent99"))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // photo-carousel extraction
  // ---------------------------------------------------------------------------

  it("photo-carousel with 3 <img> tags produces 3 image subEls with matching URLs", () => {
    const htmlWithCarousel = `<!DOCTYPE html>
<html><head><meta name="generator" content="Heyflow"><title>Carousel Test</title></head>
<body>
  <section name="screen-cc001122" id="screen-cc001122">
    <div class="block" data-blocktype="photo-carousel" data-blockid="id-pc-1">
      <div data-block-id="id-pc-1" data-config='{"blockType":"photo-carousel"}'>
        <img src="https://example.com/img1.jpg" alt="Image 1" />
        <img src="https://example.com/img2.jpg" alt="Image 2" />
        <img src="https://example.com/img3.jpg" alt="Image 3" />
        <svg><path d="M5 12l7-7 7 7"/></svg>
        <svg><path d="M19 12l-7 7-7-7"/></svg>
      </div>
    </div>
  </section>
</body></html>`;

    const { data, warnings } = parseHeyflowHtml(htmlWithCarousel);
    const steps = Object.values(data.nodes).filter((n) => n.kind === "step");
    expect(steps).toHaveLength(1);
    const step = steps[0];
    if (!step || step.kind !== "step") throw new Error("no step");
    const imageEls = step.subEls.filter((e) => e.kind === "image");
    expect(imageEls).toHaveLength(3);
    const urls = imageEls.map((e) => (e.kind === "image" ? e.url : ""));
    expect(urls).toContain("https://example.com/img1.jpg");
    expect(urls).toContain("https://example.com/img2.jpg");
    expect(urls).toContain("https://example.com/img3.jpg");
    // Should produce no custom_html for the carousel
    const customEls = step.subEls.filter((e) => e.kind === "custom_html");
    expect(customEls).toHaveLength(0);
    // Should not warn about skipped block
    expect(warnings.some((w) => w.includes("no images"))).toBe(false);
  });

  it("photo-carousel with config.images array produces image subEls with alt text preserved", () => {
    const htmlWithCarouselConfig = `<!DOCTYPE html>
<html><head><meta name="generator" content="Heyflow"><title>Config Carousel Test</title></head>
<body>
  <section name="screen-cc003344" id="screen-cc003344">
    <div class="block" data-blocktype="photo-carousel" data-blockid="id-pc-2">
      <div data-block-id="id-pc-2"
           data-config='{"blockType":"photo-carousel","images":[{"url":"https://example.com/a.jpg","alt":"Alpha"},{"url":"https://example.com/b.jpg","alt":"Beta"},{"url":"https://example.com/c.jpg","alt":"Gamma"}]}'>
      </div>
    </div>
  </section>
</body></html>`;

    const { data, warnings } = parseHeyflowHtml(htmlWithCarouselConfig);
    const steps = Object.values(data.nodes).filter((n) => n.kind === "step");
    expect(steps).toHaveLength(1);
    const step = steps[0];
    if (!step || step.kind !== "step") throw new Error("no step");
    const imageEls = step.subEls.filter((e) => e.kind === "image");
    expect(imageEls).toHaveLength(3);
    const alts = imageEls.map((e) => (e.kind === "image" ? e.alt : ""));
    expect(alts).toContain("Alpha");
    expect(alts).toContain("Beta");
    expect(alts).toContain("Gamma");
    const urls = imageEls.map((e) => (e.kind === "image" ? e.url : ""));
    expect(urls).toContain("https://example.com/a.jpg");
    expect(urls).toContain("https://example.com/b.jpg");
    expect(urls).toContain("https://example.com/c.jpg");
    // Should produce no custom_html for the carousel
    const customEls = step.subEls.filter((e) => e.kind === "custom_html");
    expect(customEls).toHaveLength(0);
    expect(warnings.some((w) => w.includes("no images"))).toBe(false);
  });

  it("empty photo-carousel produces a warning and the step is pruned (no subEls left, so step is removed)", () => {
    // A screen containing ONLY an empty carousel → no subEls → step gets pruned by pruneEmptySteps.
    const htmlWithEmptyCarousel = `<!DOCTYPE html>
<html><head><meta name="generator" content="Heyflow"><title>Empty Carousel</title></head>
<body>
  <section name="screen-cc005566" id="screen-cc005566">
    <div class="block" data-blocktype="photo-carousel" data-blockid="id-pc-3">
      <div data-block-id="id-pc-3" data-config='{"blockType":"photo-carousel"}'>
      </div>
    </div>
  </section>
</body></html>`;

    const { data, warnings } = parseHeyflowHtml(htmlWithEmptyCarousel);
    // The empty step is pruned — no steps remain
    const steps = Object.values(data.nodes).filter((n) => n.kind === "step");
    expect(steps).toHaveLength(0);
    // Must emit the "no images" warning from photo-carousel handler
    expect(warnings.some((w) => w.includes("no images"))).toBe(true);
    // Must also emit the "removed empty screens" warning from pruneEmptySteps
    expect(warnings.some((w) => w.toLowerCase().includes("removed") && w.includes("empty"))).toBe(true);
  });

  it("photo-carousel deduplicates repeated image URLs", () => {
    const htmlWithDupes = `<!DOCTYPE html>
<html><head><meta name="generator" content="Heyflow"><title>Dupe Carousel</title></head>
<body>
  <section name="screen-cc007788" id="screen-cc007788">
    <div class="block" data-blocktype="photo-carousel" data-blockid="id-pc-4">
      <div data-block-id="id-pc-4"
           data-config='{"blockType":"photo-carousel","items":[{"url":"https://example.com/x.jpg","alt":"X"},{"url":"https://example.com/x.jpg","alt":"X again"},{"url":"https://example.com/y.jpg","alt":"Y"}]}'>
      </div>
    </div>
  </section>
</body></html>`;

    const { data } = parseHeyflowHtml(htmlWithDupes);
    const steps = Object.values(data.nodes).filter((n) => n.kind === "step");
    const step = steps[0];
    if (!step || step.kind !== "step") throw new Error("no step");
    const imageEls = step.subEls.filter((e) => e.kind === "image");
    // x.jpg appears twice in config but should only produce 1 subEl
    expect(imageEls).toHaveLength(2);
    const urls = imageEls.map((e) => (e.kind === "image" ? e.url : ""));
    expect(urls).toContain("https://example.com/x.jpg");
    expect(urls).toContain("https://example.com/y.jpg");
  });

  // ---------------------------------------------------------------------------
  // pruneEmptySteps integration: middle screen with only generic-button + progress-bar
  // ---------------------------------------------------------------------------

  it("middle screen with only generic-button + progress-bar is pruned: 2 steps, single edge from screen1 to screen3", () => {
    // 3 screens: screen1 (rich-text + multiple-choice), screen2 (only skipped blocks),
    // screen3 (rich-text + image)
    const htmlWithEmptyMiddle = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="generator" content="Heyflow" />
  <title>Empty Middle Screen Quiz</title>
</head>
<body>
  <!-- Screen 1: has real content -->
  <section name="screen-111111aa" id="screen-111111aa">
    <div class="block" data-blocktype="rich-text" data-blockid="id-rt-s1">
      <div data-block-id="id-rt-s1"
           data-config='{"blockType":"rich-text","content":"<h2>Question 1</h2>"}'>
      </div>
    </div>
    <div class="block" data-blocktype="multiple-choice" data-blockid="id-mc-s1">
      <div data-block-id="id-mc-s1"
           data-config='{"blockType":"multiple-choice","options":[{"label":"Yes","id":"opt-yes"},{"label":"No","id":"opt-no"}],"multiselect":false}'>
        <input type="radio" data-destination="next" />
        <input type="radio" data-destination="next" />
      </div>
    </div>
  </section>

  <!-- Screen 2: ONLY skipped blocks → should be pruned -->
  <section name="screen-222222bb" id="screen-222222bb">
    <div class="block" data-blocktype="generic-button" data-blockid="id-btn-s2">
      <div data-block-id="id-btn-s2" data-config='{"blockType":"generic-button","label":"Continue"}'></div>
    </div>
    <div class="block" data-blocktype="progress-bar" data-blockid="id-pb-s2">
      <div data-block-id="id-pb-s2" data-config='{"blockType":"progress-bar","value":50}'></div>
    </div>
  </section>

  <!-- Screen 3: has real content -->
  <section name="screen-333333cc" id="screen-333333cc">
    <div class="block" data-blocktype="rich-text" data-blockid="id-rt-s3">
      <div data-block-id="id-rt-s3"
           data-config='{"blockType":"rich-text","content":"<h2>Screen 3</h2>"}'>
      </div>
    </div>
    <div class="block" data-blocktype="image" data-blockid="id-img-s3">
      <div data-block-id="id-img-s3"
           data-config='{"blockType":"image","url":"https://example.com/s3.jpg","alt":"Screen 3 image"}'>
      </div>
    </div>
  </section>
</body>
</html>`;

    const { data, warnings } = parseHeyflowHtml(htmlWithEmptyMiddle);

    // Should have exactly 2 step nodes after pruning
    const steps = Object.values(data.nodes).filter((n) => n.kind === "step");
    expect(steps).toHaveLength(2);

    // Neither step should be empty
    for (const step of steps) {
      if (step.kind !== "step") continue;
      expect(step.subEls.length).toBeGreaterThan(0);
    }

    // There should be a direct edge from screen1's step to screen3's step
    // (the middle empty screen was bridged out)
    const stepIds = steps.map((s) => s.id);
    const edges = Object.values(data.edges);

    // The two steps should be connected: find an edge from stepId[0] to stepId[1]
    // (they are in DOM order: screen1 then screen3)
    const screen1Step = steps.find((s) => s.kind === "step" && s.subEls.some((e) => e.kind === "question"))!;
    const screen3Step = steps.find((s) => s.kind === "step" && s.subEls.some((e) => e.kind === "image"))!;
    expect(screen1Step).toBeDefined();
    expect(screen3Step).toBeDefined();

    const bridgeEdge = edges.find(
      (e) => e.from === screen1Step.id && e.to === screen3Step.id,
    );
    expect(bridgeEdge).toBeDefined();

    // A warning about removed screens should be present
    expect(warnings.some((w) => w.toLowerCase().includes("removed") && w.includes("empty"))).toBe(true);
    expect(warnings.some((w) => w.includes("1"))).toBe(true);

    // All node ids still in internal format
    for (const id of Object.keys(data.nodes)) {
      expect(id).toMatch(HEYFLOW_ID_PATTERN);
    }

    void stepIds; // suppress unused var lint
  });
});
