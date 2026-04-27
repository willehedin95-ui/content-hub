import { describe, it, expect } from "vitest";
import { newId, addStepNode, removeNode, connectNodes, setEdgeCondition, topoOrderSteps, createVariant, getVariantGroup, setTrafficSplit, addSubEl, updateStepSubEls, updateSubEl, removeSubEl, addOption, updateOption, removeOption, duplicateStep, promoteVariant, deleteVariant, setOptionRoute, ensureDefaultEdge } from "./quiz-graph";
import type { QuizData, QuizNode, StepNode } from "@/types/quiz";

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

  it("reuses variantGroupId when creating a variant from an existing variant", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "Original" });
    const origId = Object.keys(q.nodes)[0];
    // Create first variant (orig + variant1 = 2 nodes sharing variantGroupId)
    q = createVariant(q, origId);
    const firstVariantId = Object.keys(q.nodes).find((k) => k !== origId)!;
    const firstVariantGroupId = (q.nodes[firstVariantId] as StepNode).variantGroupId;
    // Create a variant from the first variant (should add a third node to the SAME group)
    q = createVariant(q, firstVariantId);
    const nodes = Object.values(q.nodes);
    expect(nodes).toHaveLength(3);
    // All three should share the same variantGroupId
    const group = getVariantGroup(q, origId);
    expect(group).toHaveLength(3);
    expect(group.every((n) => n.variantGroupId === firstVariantGroupId)).toBe(true);
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

describe("addSubEl", () => {
  it("adds a title subEl with default text to a step", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "S1" });
    const stepId = Object.keys(q.nodes)[0];
    const next = addSubEl(q, stepId, { kind: "title" });
    const step = next.nodes[stepId];
    if (step.kind !== "step") throw new Error("not step");
    expect(step.subEls).toHaveLength(1);
    expect(step.subEls[0].kind).toBe("title");
    if (step.subEls[0].kind === "title") {
      expect(step.subEls[0].text).toBe("New title");
      expect(step.subEls[0].isRichText).toBe(true);
      expect(step.subEls[0].contentFormat).toBe("html");
    }
  });

  it("adds a question subEl with 2 default options", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "S1" });
    const stepId = Object.keys(q.nodes)[0];
    const next = addSubEl(q, stepId, { kind: "question" });
    const step = next.nodes[stepId];
    if (step.kind !== "step") throw new Error("not step");
    expect(step.subEls).toHaveLength(1);
    const el = step.subEls[0];
    expect(el.kind).toBe("question");
    if (el.kind === "question") {
      expect(el.options).toHaveLength(2);
      expect(el.options[0].label).toBe("Option A");
      expect(el.options[1].label).toBe("Option B");
      expect(el.options[0].id).toMatch(/^opt_/);
    }
  });

  it("is a no-op for a non-step node id", () => {
    let q = emptyQuiz();
    q.nodes["start1"] = { id: "start1", kind: "start", size: { width: 180, height: 80 }, position: { x: 0, y: 0 } };
    const result = addSubEl(q, "start1", { kind: "text" });
    expect(result).toBe(q);
  });

  it("is a no-op for a non-existent node id", () => {
    const q = emptyQuiz();
    const result = addSubEl(q, "nonexistent", { kind: "title" });
    expect(result).toBe(q);
  });

  it("appends multiple subEls in order", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "S1" });
    const stepId = Object.keys(q.nodes)[0];
    q = addSubEl(q, stepId, { kind: "title", text: "Hello" });
    q = addSubEl(q, stepId, { kind: "image", url: "https://img.co/1.jpg", alt: "pic" });
    const step = q.nodes[stepId];
    if (step.kind !== "step") throw new Error("not step");
    expect(step.subEls).toHaveLength(2);
    expect(step.subEls[0].kind).toBe("title");
    expect(step.subEls[1].kind).toBe("image");
  });

  // -------------------------------------------------------------------------
  // New subEl kinds: range_slider, text_input, testimonial_slider
  // -------------------------------------------------------------------------
  function makeQuizWithEmptyStep(): QuizData {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "S1" });
    return q;
  }

  it("addSubEl creates a range_slider with sensible defaults", () => {
    const start = makeQuizWithEmptyStep();
    const stepId = Object.keys(start.nodes).find(
      (k) => start.nodes[k].kind === "step",
    )!;
    const updated = addSubEl(start, stepId, { kind: "range_slider" });
    const step = updated.nodes[stepId] as Extract<QuizNode, { kind: "step" }>;
    const el = step.subEls[step.subEls.length - 1];
    expect(el.kind).toBe("range_slider");
    if (el.kind !== "range_slider") return;
    expect(el.variable).toBe("score");
    expect(el.min).toBe(0);
    expect(el.max).toBe(100);
    expect(el.step).toBe(1);
    expect(el.initial).toBe(50);
    expect(el.unit).toBe("");
  });

  it("addSubEl creates a text_input with sensible defaults", () => {
    const start = makeQuizWithEmptyStep();
    const stepId = Object.keys(start.nodes).find(
      (k) => start.nodes[k].kind === "step",
    )!;
    const updated = addSubEl(start, stepId, { kind: "text_input" });
    const step = updated.nodes[stepId] as Extract<QuizNode, { kind: "step" }>;
    const el = step.subEls[step.subEls.length - 1];
    expect(el.kind).toBe("text_input");
    if (el.kind !== "text_input") return;
    expect(el.variable).toBe("answer");
    expect(el.inputType).toBe("text");
    expect(el.placeholder).toBe("");
  });

  it("addSubEl creates a testimonial_slider with one starter item", () => {
    const start = makeQuizWithEmptyStep();
    const stepId = Object.keys(start.nodes).find(
      (k) => start.nodes[k].kind === "step",
    )!;
    const updated = addSubEl(start, stepId, { kind: "testimonial_slider" });
    const step = updated.nodes[stepId] as Extract<QuizNode, { kind: "step" }>;
    const el = step.subEls[step.subEls.length - 1];
    expect(el.kind).toBe("testimonial_slider");
    if (el.kind !== "testimonial_slider") return;
    expect(el.items).toHaveLength(1);
    expect(el.items[0].name).toBe("Customer");
    expect(el.items[0].rating).toBe(5);
  });
});

describe("updateStepSubEls", () => {
  it("replaces subEls on an existing step", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "S1" });
    const stepId = Object.keys(q.nodes)[0];
    const newSubEls = [
      { id: "el1", kind: "title" as const, text: "Changed", isRichText: true as const, contentFormat: "html" as const },
    ];
    const next = updateStepSubEls(q, stepId, newSubEls);
    const step = next.nodes[stepId];
    if (step.kind !== "step") throw new Error("not step");
    expect(step.subEls).toEqual(newSubEls);
  });

  it("is a no-op for a non-step node", () => {
    let q = emptyQuiz();
    q.nodes["start1"] = { id: "start1", kind: "start", size: { width: 180, height: 80 }, position: { x: 0, y: 0 } };
    const result = updateStepSubEls(q, "start1", []);
    expect(result).toBe(q);
  });

  it("is a no-op for a non-existent node id", () => {
    const q = emptyQuiz();
    const result = updateStepSubEls(q, "does-not-exist", []);
    expect(result).toBe(q);
  });
});

// ---------------------------------------------------------------------------
// Helper: builds a quiz with one step that has a title and a question subEl
// ---------------------------------------------------------------------------
function quizWithSubEls() {
  let q = emptyQuiz();
  q = addStepNode(q, { position: { x: 0, y: 0 }, name: "S1" });
  const stepId = Object.keys(q.nodes)[0];
  q = addSubEl(q, stepId, { kind: "title", text: "Hello" });
  q = addSubEl(q, stepId, { kind: "question" });
  return { q, stepId };
}

describe("updateSubEl", () => {
  it("merges a patch into a title subEl", () => {
    const { q, stepId } = quizWithSubEls();
    const step = q.nodes[stepId];
    if (step.kind !== "step") throw new Error("not step");
    const titleId = step.subEls[0].id;
    const next = updateSubEl(q, stepId, titleId, { text: "Updated" });
    const nextStep = next.nodes[stepId];
    if (nextStep.kind !== "step") throw new Error("not step");
    expect(nextStep.subEls[0]).toMatchObject({ kind: "title", text: "Updated" });
  });

  it("does not mutate the original quiz", () => {
    const { q, stepId } = quizWithSubEls();
    const step = q.nodes[stepId];
    if (step.kind !== "step") throw new Error("not step");
    const titleId = step.subEls[0].id;
    updateSubEl(q, stepId, titleId, { text: "Changed" });
    if (step.kind !== "step") throw new Error("not step");
    expect(step.subEls[0]).toMatchObject({ text: "Hello" });
  });

  it("is a no-op when stepId does not exist", () => {
    const { q } = quizWithSubEls();
    const result = updateSubEl(q, "nonexistent", "el1", { text: "x" });
    expect(result).toBe(q);
  });

  it("is a no-op when elId does not exist in the step", () => {
    const { q, stepId } = quizWithSubEls();
    const result = updateSubEl(q, stepId, "does-not-exist", { text: "x" });
    expect(result).toBe(q);
  });
});

describe("removeSubEl", () => {
  it("removes the matching subEl from the step", () => {
    const { q, stepId } = quizWithSubEls();
    const step = q.nodes[stepId];
    if (step.kind !== "step") throw new Error("not step");
    const titleId = step.subEls[0].id;
    const next = removeSubEl(q, stepId, titleId);
    const nextStep = next.nodes[stepId];
    if (nextStep.kind !== "step") throw new Error("not step");
    expect(nextStep.subEls).toHaveLength(1);
    expect(nextStep.subEls[0].kind).toBe("question");
  });

  it("is a no-op for an unknown elId", () => {
    const { q, stepId } = quizWithSubEls();
    const next = removeSubEl(q, stepId, "bogus");
    const step = next.nodes[stepId];
    if (step.kind !== "step") throw new Error("not step");
    expect(step.subEls).toHaveLength(2);
  });

  it("is a no-op for an unknown stepId", () => {
    const { q } = quizWithSubEls();
    const result = removeSubEl(q, "nonexistent", "el1");
    expect(result).toBe(q);
  });
});

describe("addOption", () => {
  it("appends a new option to a question subEl", () => {
    const { q, stepId } = quizWithSubEls();
    const step = q.nodes[stepId];
    if (step.kind !== "step") throw new Error("not step");
    const questionEl = step.subEls.find((e) => e.kind === "question")!;
    const next = addOption(q, stepId, questionEl.id, "Option C");
    const nextStep = next.nodes[stepId];
    if (nextStep.kind !== "step") throw new Error("not step");
    const nextQ = nextStep.subEls.find((e) => e.kind === "question");
    if (!nextQ || nextQ.kind !== "question") throw new Error("not question");
    expect(nextQ.options).toHaveLength(3);
    expect(nextQ.options[2].label).toBe("Option C");
    expect(nextQ.options[2].id).toMatch(/^opt_/);
  });

  it("defaults label to empty string when not provided", () => {
    const { q, stepId } = quizWithSubEls();
    const step = q.nodes[stepId];
    if (step.kind !== "step") throw new Error("not step");
    const questionEl = step.subEls.find((e) => e.kind === "question")!;
    const next = addOption(q, stepId, questionEl.id);
    const nextStep = next.nodes[stepId];
    if (nextStep.kind !== "step") throw new Error("not step");
    const nextQ = nextStep.subEls.find((e) => e.kind === "question");
    if (!nextQ || nextQ.kind !== "question") throw new Error("not question");
    expect(nextQ.options[2].label).toBe("");
  });

  it("is a no-op when the subEl is not a question", () => {
    const { q, stepId } = quizWithSubEls();
    const step = q.nodes[stepId];
    if (step.kind !== "step") throw new Error("not step");
    const titleId = step.subEls[0].id;
    const result = addOption(q, stepId, titleId, "x");
    expect(result).toBe(q);
  });
});

describe("updateOption", () => {
  it("merges a patch into the matching option", () => {
    const { q, stepId } = quizWithSubEls();
    const step = q.nodes[stepId];
    if (step.kind !== "step") throw new Error("not step");
    const questionEl = step.subEls.find((e) => e.kind === "question");
    if (!questionEl || questionEl.kind !== "question") throw new Error("not question");
    const optId = questionEl.options[0].id;
    const next = updateOption(q, stepId, questionEl.id, optId, { label: "Changed A" });
    const nextStep = next.nodes[stepId];
    if (nextStep.kind !== "step") throw new Error("not step");
    const nextQ = nextStep.subEls.find((e) => e.kind === "question");
    if (!nextQ || nextQ.kind !== "question") throw new Error("not question");
    expect(nextQ.options[0].label).toBe("Changed A");
  });

  it("is a no-op for an unknown optionId", () => {
    const { q, stepId } = quizWithSubEls();
    const step = q.nodes[stepId];
    if (step.kind !== "step") throw new Error("not step");
    const questionEl = step.subEls.find((e) => e.kind === "question");
    if (!questionEl || questionEl.kind !== "question") throw new Error("not question");
    const result = updateOption(q, stepId, questionEl.id, "bogus-opt", { label: "x" });
    const resultStep = result.nodes[stepId];
    if (resultStep.kind !== "step") throw new Error("not step");
    const resultQ = resultStep.subEls.find((e) => e.kind === "question");
    if (!resultQ || resultQ.kind !== "question") throw new Error("not question");
    expect(resultQ.options[0].label).toBe("Option A");
  });
});

describe("duplicateStep", () => {
  it("creates a new node with a different id and offset position", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 100, y: 200 }, name: "Original" });
    const origId = Object.keys(q.nodes)[0];
    const next = duplicateStep(q, origId);
    const nodeIds = Object.keys(next.nodes);
    expect(nodeIds).toHaveLength(2);
    const dupId = nodeIds.find((id) => id !== origId)!;
    const dup = next.nodes[dupId];
    if (dup.kind !== "step") throw new Error("not step");
    expect(dupId).not.toBe(origId);
    expect(dup.position).toEqual({ x: 140, y: 240 });
    expect(dup.name).toBe("Original (copy)");
  });

  it("gives duplicate new subEl ids (no shared references)", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    const origId = Object.keys(q.nodes)[0];
    q = addSubEl(q, origId, { kind: "title", text: "Hello" });
    const origNode = q.nodes[origId];
    if (origNode.kind !== "step") throw new Error("not step");
    const origElId = origNode.subEls[0].id;

    const next = duplicateStep(q, origId);
    const dupId = Object.keys(next.nodes).find((id) => id !== origId)!;
    const dup = next.nodes[dupId];
    if (dup.kind !== "step") throw new Error("not step");
    expect(dup.subEls).toHaveLength(1);
    // New el id
    expect(dup.subEls[0].id).not.toBe(origElId);
    // Content copied
    if (dup.subEls[0].kind === "title") expect(dup.subEls[0].text).toBe("Hello");
    // Not same array reference
    expect(dup.subEls).not.toBe(origNode.subEls);
  });

  it("does not inherit variantGroupId", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    const origId = Object.keys(q.nodes)[0];
    q = createVariant(q, origId); // now origId has variantGroupId
    const next = duplicateStep(q, origId);
    // Should be 3 nodes total: orig, variant, duplicate
    expect(Object.keys(next.nodes)).toHaveLength(3);
    const dupId = Object.keys(next.nodes).find((id) => id !== origId && next.nodes[id].id !== Object.values(q.nodes).find((n) => n.id !== origId)?.id);
    // The duplicate should have no variantGroupId
    const allIds = Object.keys(next.nodes);
    const origVariantId = Object.keys(q.nodes).find((id) => id !== origId)!;
    const dupNodeId = allIds.find((id) => id !== origId && id !== origVariantId)!;
    const dupNode = next.nodes[dupNodeId];
    if (dupNode.kind !== "step") throw new Error("not step");
    expect(dupNode.variantGroupId).toBeUndefined();
    expect(dupNode.trafficPct).toBeUndefined();
  });

  it("is a no-op for a non-existent node", () => {
    const q = emptyQuiz();
    const result = duplicateStep(q, "nonexistent");
    expect(result).toBe(q);
  });
});

describe("promoteVariant", () => {
  it("removes siblings and clears variant fields on winner", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    const origId = Object.keys(q.nodes)[0];
    q = createVariant(q, origId);
    const variantId = Object.keys(q.nodes).find((id) => id !== origId)!;

    const next = promoteVariant(q, origId);
    expect(Object.keys(next.nodes)).toHaveLength(1);
    expect(next.nodes[origId]).toBeDefined();
    expect(next.nodes[variantId]).toBeUndefined();
    const winner = next.nodes[origId];
    if (winner.kind !== "step") throw new Error("not step");
    expect(winner.variantGroupId).toBeUndefined();
    expect(winner.trafficPct).toBeUndefined();
  });

  it("is a no-op for a node with no variantGroupId", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    const stepId = Object.keys(q.nodes)[0];
    const result = promoteVariant(q, stepId);
    expect(result).toBe(q);
  });
});

describe("deleteVariant", () => {
  it("removes the variant node", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    const origId = Object.keys(q.nodes)[0];
    q = createVariant(q, origId);
    const variantId = Object.keys(q.nodes).find((id) => id !== origId)!;

    const next = deleteVariant(q, variantId);
    expect(next.nodes[variantId]).toBeUndefined();
  });

  it("clears variant fields on the sole remaining member", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    const origId = Object.keys(q.nodes)[0];
    q = createVariant(q, origId);
    const variantId = Object.keys(q.nodes).find((id) => id !== origId)!;

    const next = deleteVariant(q, variantId);
    const sole = next.nodes[origId];
    if (sole.kind !== "step") throw new Error("not step");
    expect(sole.variantGroupId).toBeUndefined();
    expect(sole.trafficPct).toBeUndefined();
  });

  it("keeps variant fields when two or more remain after deletion", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    const origId = Object.keys(q.nodes)[0];
    q = createVariant(q, origId); // 2 variants
    q = createVariant(q, origId); // 3 variants
    const allIds = Object.keys(q.nodes);
    const idToDelete = allIds.find((id) => id !== origId)!;
    const next = deleteVariant(q, idToDelete);
    // 2 remaining - both should keep variantGroupId
    const remaining = Object.values(next.nodes).filter((n): n is StepNode => n.kind === "step");
    expect(remaining).toHaveLength(2);
    for (const r of remaining) {
      expect(r.variantGroupId).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// setOptionRoute tests
// ---------------------------------------------------------------------------

describe("setOptionRoute", () => {
  it("creates a new conditional edge when none exists", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    q = addStepNode(q, { position: { x: 300, y: 0 }, name: "B" });
    const [stepId, targetId] = Object.keys(q.nodes);
    const next = setOptionRoute(q, stepId, "qel_1", "opt_1", targetId);
    const edges = Object.values(next.edges);
    expect(edges).toHaveLength(1);
    expect(edges[0].from).toBe(stepId);
    expect(edges[0].to).toBe(targetId);
    expect(edges[0].condition).toEqual({ kind: "option", questionElId: "qel_1", optionId: "opt_1" });
  });

  it("updates target when a conditional edge for the same option already exists", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    q = addStepNode(q, { position: { x: 300, y: 0 }, name: "B" });
    q = addStepNode(q, { position: { x: 600, y: 0 }, name: "C" });
    const [stepId, bId, cId] = Object.keys(q.nodes);
    // Create initial conditional edge to B
    q = setOptionRoute(q, stepId, "qel_1", "opt_1", bId);
    // Now reroute the same option to C
    const next = setOptionRoute(q, stepId, "qel_1", "opt_1", cId);
    const edges = Object.values(next.edges);
    // Should still be 1 conditional edge (updated, not duplicated)
    expect(edges).toHaveLength(1);
    expect(edges[0].to).toBe(cId);
    expect(edges[0].condition).toEqual({ kind: "option", questionElId: "qel_1", optionId: "opt_1" });
  });

  it("removes the conditional edge when targetId is null", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    q = addStepNode(q, { position: { x: 300, y: 0 }, name: "B" });
    const [stepId, targetId] = Object.keys(q.nodes);
    q = setOptionRoute(q, stepId, "qel_1", "opt_1", targetId);
    const next = setOptionRoute(q, stepId, "qel_1", "opt_1", null);
    expect(Object.values(next.edges)).toHaveLength(0);
  });

  it("is a no-op when removing a non-existent conditional edge", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    const stepId = Object.keys(q.nodes)[0];
    const result = setOptionRoute(q, stepId, "qel_1", "opt_1", null);
    expect(result).toBe(q);
  });

  it("does not remove default edges when removing a conditional edge", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    q = addStepNode(q, { position: { x: 300, y: 0 }, name: "B" });
    q = addStepNode(q, { position: { x: 600, y: 0 }, name: "C" });
    const [stepId, bId, cId] = Object.keys(q.nodes);
    q = connectNodes(q, { from: stepId, to: bId }); // default edge
    q = setOptionRoute(q, stepId, "qel_1", "opt_1", cId);
    // Remove the conditional route
    const next = setOptionRoute(q, stepId, "qel_1", "opt_1", null);
    // Default edge should remain
    const remaining = Object.values(next.edges);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].condition).toEqual({ kind: "default" });
  });

  it("keeps other option routes when removing one", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    q = addStepNode(q, { position: { x: 300, y: 0 }, name: "B" });
    q = addStepNode(q, { position: { x: 600, y: 0 }, name: "C" });
    const [stepId, bId, cId] = Object.keys(q.nodes);
    q = setOptionRoute(q, stepId, "qel_1", "opt_A", bId);
    q = setOptionRoute(q, stepId, "qel_1", "opt_B", cId);
    const next = setOptionRoute(q, stepId, "qel_1", "opt_A", null);
    const edges = Object.values(next.edges);
    expect(edges).toHaveLength(1);
    expect(edges[0].condition).toEqual({ kind: "option", questionElId: "qel_1", optionId: "opt_B" });
  });
});

// ---------------------------------------------------------------------------
// ensureDefaultEdge tests
// ---------------------------------------------------------------------------

describe("ensureDefaultEdge", () => {
  it("creates a default edge when none exists", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    q = addStepNode(q, { position: { x: 300, y: 0 }, name: "B" });
    const [fromId, toId] = Object.keys(q.nodes);
    const next = ensureDefaultEdge(q, fromId, toId);
    const edges = Object.values(next.edges);
    expect(edges).toHaveLength(1);
    expect(edges[0].from).toBe(fromId);
    expect(edges[0].to).toBe(toId);
    expect(edges[0].condition).toEqual({ kind: "default" });
  });

  it("does not create a duplicate when a default edge already exists", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    q = addStepNode(q, { position: { x: 300, y: 0 }, name: "B" });
    q = addStepNode(q, { position: { x: 600, y: 0 }, name: "C" });
    const [fromId, bId, cId] = Object.keys(q.nodes);
    q = connectNodes(q, { from: fromId, to: bId }); // existing default to B
    const result = ensureDefaultEdge(q, fromId, cId); // should NOT create another default
    expect(result).toBe(q);
    // Original edge still points to B
    const edges = Object.values(result.edges);
    expect(edges).toHaveLength(1);
    expect(edges[0].to).toBe(bId);
  });

  it("creates a default edge even when conditional edges exist", () => {
    let q = emptyQuiz();
    q = addStepNode(q, { position: { x: 0, y: 0 }, name: "A" });
    q = addStepNode(q, { position: { x: 300, y: 0 }, name: "B" });
    q = addStepNode(q, { position: { x: 600, y: 0 }, name: "C" });
    const [fromId, bId, cId] = Object.keys(q.nodes);
    q = setOptionRoute(q, fromId, "qel_1", "opt_1", bId); // conditional only
    const next = ensureDefaultEdge(q, fromId, cId);
    const edges = Object.values(next.edges);
    expect(edges).toHaveLength(2);
    const defaultEdge = edges.find((e) => !e.condition || e.condition.kind === "default");
    expect(defaultEdge).toBeDefined();
    expect(defaultEdge!.to).toBe(cId);
  });
});

describe("removeOption", () => {
  it("removes the matching option from a question subEl", () => {
    const { q, stepId } = quizWithSubEls();
    const step = q.nodes[stepId];
    if (step.kind !== "step") throw new Error("not step");
    const questionEl = step.subEls.find((e) => e.kind === "question");
    if (!questionEl || questionEl.kind !== "question") throw new Error("not question");
    const optId = questionEl.options[0].id;
    const next = removeOption(q, stepId, questionEl.id, optId);
    const nextStep = next.nodes[stepId];
    if (nextStep.kind !== "step") throw new Error("not step");
    const nextQ = nextStep.subEls.find((e) => e.kind === "question");
    if (!nextQ || nextQ.kind !== "question") throw new Error("not question");
    expect(nextQ.options).toHaveLength(1);
    expect(nextQ.options[0].label).toBe("Option B");
  });

  it("is a no-op for an unknown optionId", () => {
    const { q, stepId } = quizWithSubEls();
    const step = q.nodes[stepId];
    if (step.kind !== "step") throw new Error("not step");
    const questionEl = step.subEls.find((e) => e.kind === "question");
    if (!questionEl || questionEl.kind !== "question") throw new Error("not question");
    const result = removeOption(q, stepId, questionEl.id, "bogus");
    const resultStep = result.nodes[stepId];
    if (resultStep.kind !== "step") throw new Error("not step");
    const resultQ = resultStep.subEls.find((e) => e.kind === "question");
    if (!resultQ || resultQ.kind !== "question") throw new Error("not question");
    expect(resultQ.options).toHaveLength(2);
  });
});
