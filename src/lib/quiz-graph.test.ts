import { describe, it, expect } from "vitest";
import { newId, addStepNode, removeNode, connectNodes, setEdgeCondition } from "./quiz-graph";
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
