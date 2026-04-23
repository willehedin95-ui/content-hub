import { describe, it, expect } from "vitest";
import { newId, addStepNode, removeNode, connectNodes, setEdgeCondition, topoOrderSteps, createVariant, getVariantGroup, setTrafficSplit } from "./quiz-graph";
import type { QuizData, StepNode } from "@/types/quiz";

describe("newId", () => {
  it("produces prefixed ids with timestamp + random suffix", () => {
    expect(newId("step")).toMatch(/^step_\d+_[a-z0-9]+$/);
  });
  it("produces distinct ids", () => {
    expect(newId("step")).not.toBe(newId("step"));
  });
});

function emptyQuiz(): QuizData {
  return { id: "q1", nodes: {}, edges: {}, camera: { x: 0, y: 0, z: 1 } };
}

describe("addStepNode", () => {
  it("adds a new step at position with empty subEls", () => {
    const q = emptyQuiz();
    const next = addStepNode(q, { position: { x: 100, y: 200 }, name: "Age" });
    const added = Object.values(next.nodes).find((n) => n.kind === "step") as StepNode | undefined;
    expect(added).toBeDefined();
    expect(added!.name).toBe("Age");
    expect(added!.position).toEqual({ x: 100, y: 200 });
    expect(added!.subEls).toEqual([]);
  });
});

describe("removeNode", () => {
  it("removes node and edges touching it", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    const stepId = Object.keys(q.nodes)[0];
    q.edges["e1"] = { id: "e1", from: stepId, to: stepId };
    const next = removeNode(q, stepId);
    expect(next.nodes[stepId]).toBeUndefined();
    expect(next.edges["e1"]).toBeUndefined();
  });
});

describe("connectNodes", () => {
  it("creates an edge between two nodes", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    q = addStepNode(q, { position: { x: 300, y: 0 }, name: "B" });
    const [aId, bId] = Object.keys(q.nodes);
    const next = connectNodes(q, { from: aId, to: bId });
    const edges = Object.values(next.edges);
    expect(edges).toHaveLength(1);
    expect(edges[0].from).toBe(aId);
    expect(edges[0].to).toBe(bId);
  });

  it("does not duplicate edges with the same condition", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    q = addStepNode(q, { position: { x: 300, y: 0 }, name: "B" });
    const [aId, bId] = Object.keys(q.nodes);
    q = connectNodes(q, { from: aId, to: bId });
    const q2 = connectNodes(q, { from: aId, to: bId });
    expect(Object.values(q2.edges)).toHaveLength(1);
  });

  it("allows edges with different conditions between the same nodes", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    q = addStepNode(q, { position: { x: 300, y: 0 }, name: "B" });
    const [aId, bId] = Object.keys(q.nodes);
    q = connectNodes(q, { from: aId, to: bId, condition: { kind: "default" } });
    q = connectNodes(q, { from: aId, to: bId, condition: { kind: "option", questionElId: "el1", optionId: "opt1" } });
    expect(Object.values(q.edges)).toHaveLength(2);
  });
});

describe("topoOrderSteps", () => {
  it("returns steps in BFS order from start", () => {
    let q = emptyQuiz();
    // Add start node manually
    q.nodes["start1"] = { id: "start1", kind: "start", size: { width: 180, height: 80 }, position: { x: 0, y: 0 } };
    q = addStepNode(q, { position: { x: 300, y: 0 }, name: "A" });
    const aId = Object.keys(q.nodes).find((k) => k !== "start1")!;
    q = addStepNode(q, { position: { x: 600, y: 0 }, name: "B" });
    const bId = Object.keys(q.nodes).find((k) => k !== "start1" && k !== aId)!;
    // Add exit node
    q.nodes["exit1"] = { id: "exit1", kind: "exit", name: "Exit", size: { width: 180, height: 80 }, position: { x: 900, y: 0 }, redirectUrl: "" };
    // Connect start->A->B->exit
    q = connectNodes(q, { from: "start1", to: aId });
    q = connectNodes(q, { from: aId, to: bId });
    q = connectNodes(q, { from: bId, to: "exit1" });
    const order = topoOrderSteps(q);
    expect(order.map((n) => n.name)).toEqual(["A", "B"]);
  });

  it("handles cycles without infinite loop", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    q = addStepNode(q, { position: { x: 300, y: 0 }, name: "B" });
    const [aId, bId] = Object.keys(q.nodes);
    // Create cycle
    q = connectNodes(q, { from: aId, to: bId });
    q = connectNodes(q, { from: bId, to: aId });
    const order = topoOrderSteps(q);
    expect(order).toHaveLength(2);
  });
});

describe("setEdgeCondition", () => {
  it("updates the condition on an existing edge", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    q = addStepNode(q, { position: { x: 300, y: 0 }, name: "B" });
    const [aId, bId] = Object.keys(q.nodes);
    q = connectNodes(q, { from: aId, to: bId });
    const edgeId = Object.keys(q.edges)[0];
    const next = setEdgeCondition(q, edgeId, { kind: "option", questionElId: "el1", optionId: "opt1" });
    expect(next.edges[edgeId].condition).toEqual({ kind: "option", questionElId: "el1", optionId: "opt1" });
  });

  it("returns q unchanged for unknown edgeId", () => {
    const q = emptyQuiz();
    const next = setEdgeCondition(q, "nonexistent", { kind: "default" });
    expect(next).toBe(q);
  });
});

describe("createVariant", () => {
  it("creates a sibling node with the same variantGroupId and 50% traffic each", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "Original" });
    const origId = Object.keys(q.nodes)[0];
    const next = createVariant(q, origId);
    const nodes = Object.values(next.nodes);
    expect(nodes).toHaveLength(2);
    const orig = next.nodes[origId];
    const variant = nodes.find((n) => n.id !== origId)!;
    if (orig.kind !== "step" || variant.kind !== "step") throw new Error("not step");
    expect(orig.variantGroupId).toBeDefined();
    expect(variant.variantGroupId).toBe(orig.variantGroupId);
    expect(orig.trafficPct).toBe(50);
    expect(variant.trafficPct).toBe(50);
  });

  it("positions the variant below the original", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 100, y: 100 }, name: "Original" });
    const origId = Object.keys(q.nodes)[0];
    const next = createVariant(q, origId);
    const variant = Object.values(next.nodes).find((n) => n.id !== origId)!;
    const orig = next.nodes[origId];
    if (orig.kind !== "step" || variant.kind !== "step") throw new Error("not step");
    expect(variant.position.y).toBeGreaterThan(orig.position.y);
    expect(variant.position.x).toBe(orig.position.x);
  });

  it("deep-copies subEls (not shared reference)", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    const origId = Object.keys(q.nodes)[0];
    const origNode = q.nodes[origId];
    if (origNode.kind !== "step") throw new Error("not step");
    // Give the original a subEl
    origNode.subEls = [{ id: "el1", kind: "title", text: "Hello", isRichText: true, contentFormat: "html" }];
    const next = createVariant(q, origId);
    const variant = Object.values(next.nodes).find((n) => n.id !== origId)!;
    if (variant.kind !== "step") throw new Error("not step");
    expect(variant.subEls).not.toBe(origNode.subEls);
    expect(variant.subEls).toEqual(origNode.subEls);
  });
});

describe("getVariantGroup", () => {
  it("returns all members of the variant group", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    const origId = Object.keys(q.nodes)[0];
    q = createVariant(q, origId);
    const group = getVariantGroup(q, origId);
    expect(group).toHaveLength(2);
  });

  it("returns just the node if no variantGroupId", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    const stepId = Object.keys(q.nodes)[0];
    const group = getVariantGroup(q, stepId);
    expect(group).toHaveLength(1);
    expect(group[0].id).toBe(stepId);
  });
});

describe("setTrafficSplit", () => {
  it("updates traffic percentages for specified nodes", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    const origId = Object.keys(q.nodes)[0];
    q = createVariant(q, origId);
    const variantId = Object.keys(q.nodes).find((k) => k !== origId)!;
    const next = setTrafficSplit(q, { [origId]: 70, [variantId]: 30 });
    const orig = next.nodes[origId];
    const variant = next.nodes[variantId];
    if (orig.kind !== "step" || variant.kind !== "step") throw new Error("not step");
    expect(orig.trafficPct).toBe(70);
    expect(variant.trafficPct).toBe(30);
  });
});
