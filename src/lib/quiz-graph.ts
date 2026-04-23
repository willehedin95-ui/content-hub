// src/lib/quiz-graph.ts
import type { QuizData, StepNode, QuizEdge, RouteCondition, SubEl, QuestionOption } from "@/types/quiz";

export function newId(prefix: "step" | "edge" | "exit" | "start" | "el" | "opt" | "vg"): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${ts}_${rand}`;
}

const DEFAULT_STEP_SIZE = { width: 280, height: 360 };

export function addStepNode(
  q: QuizData,
  opts: { position: { x: number; y: number }; name: string },
): QuizData {
  const id = newId("step");
  const node: StepNode = {
    id,
    kind: "step",
    name: opts.name,
    size: DEFAULT_STEP_SIZE,
    position: opts.position,
    rotation: 0,
    subEls: [],
  };
  return { ...q, nodes: { ...q.nodes, [id]: node } };
}

export function removeNode(q: QuizData, nodeId: string): QuizData {
  const nodes = { ...q.nodes };
  delete nodes[nodeId];
  const edges = Object.fromEntries(
    Object.entries(q.edges).filter(([, e]) => e.from !== nodeId && e.to !== nodeId),
  );
  return { ...q, nodes, edges };
}

export function connectNodes(
  q: QuizData,
  opts: { from: string; to: string; condition?: RouteCondition },
): QuizData {
  const condition = opts.condition ?? { kind: "default" as const };
  const key = (c: RouteCondition | undefined) => JSON.stringify(c ?? { kind: "default" });
  const exists = Object.values(q.edges).some(
    (e) => e.from === opts.from && e.to === opts.to && key(e.condition) === key(condition),
  );
  if (exists) return q;
  const id = newId("edge");
  const edge: QuizEdge = { id, from: opts.from, to: opts.to, condition };
  return { ...q, edges: { ...q.edges, [id]: edge } };
}

export function setEdgeCondition(q: QuizData, edgeId: string, condition: RouteCondition): QuizData {
  const edge = q.edges[edgeId];
  if (!edge) return q;
  return { ...q, edges: { ...q.edges, [edgeId]: { ...edge, condition } } };
}

export function topoOrderSteps(q: QuizData): StepNode[] {
  const steps = Object.values(q.nodes).filter((n): n is StepNode => n.kind === "step");
  const stepIds = new Set(steps.map((s) => s.id));
  const start = Object.values(q.nodes).find((n) => n.kind === "start");
  const queue: string[] = [];
  if (start) {
    for (const e of Object.values(q.edges)) {
      if (e.from === start.id && stepIds.has(e.to)) queue.push(e.to);
    }
  } else {
    for (const s of steps) queue.push(s.id);
  }
  const visited = new Set<string>();
  const order: StepNode[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = q.nodes[id];
    if (node && node.kind === "step") order.push(node);
    for (const e of Object.values(q.edges)) {
      if (e.from === id && stepIds.has(e.to) && !visited.has(e.to)) queue.push(e.to);
    }
  }
  for (const s of steps) if (!visited.has(s.id)) order.push(s);
  return order;
}

export function createVariant(q: QuizData, originalId: string): QuizData {
  const orig = q.nodes[originalId];
  if (!orig || orig.kind !== "step") return q;
  const groupId = orig.variantGroupId ?? newId("vg");
  const variantId = newId("step");
  const variant: StepNode = {
    id: variantId,
    kind: "step",
    name: `${orig.name} (variant)`,
    size: orig.size,
    position: { x: orig.position.x, y: orig.position.y + orig.size.height + 24 },
    rotation: 0,
    subEls: JSON.parse(JSON.stringify(orig.subEls)) as StepNode["subEls"],
    variantGroupId: groupId,
    trafficPct: 50,
  };
  const updatedOrig: StepNode = { ...orig, variantGroupId: groupId, trafficPct: 50 };
  return { ...q, nodes: { ...q.nodes, [originalId]: updatedOrig, [variantId]: variant } };
}

export function getVariantGroup(q: QuizData, anyMemberId: string): StepNode[] {
  const member = q.nodes[anyMemberId];
  if (!member || member.kind !== "step" || !member.variantGroupId) {
    return member && member.kind === "step" ? [member] : [];
  }
  return Object.values(q.nodes).filter(
    (n): n is StepNode => n.kind === "step" && n.variantGroupId === member.variantGroupId,
  );
}

export function setTrafficSplit(q: QuizData, updates: Record<string, number>): QuizData {
  const nodes = { ...q.nodes };
  for (const [id, pct] of Object.entries(updates)) {
    const n = nodes[id];
    if (n && n.kind === "step") nodes[id] = { ...n, trafficPct: pct };
  }
  return { ...q, nodes };
}

// ---------------------------------------------------------------------------
// updateStepSubEls — replace a step's subEls immutably
// ---------------------------------------------------------------------------

/**
 * Returns a new QuizData with the given step's subEls replaced.
 * No-op if the step doesn't exist or is not a step node.
 */
export function updateStepSubEls(q: QuizData, stepId: string, subEls: SubEl[]): QuizData {
  const node = q.nodes[stepId];
  if (!node || node.kind !== "step") return q;
  return { ...q, nodes: { ...q.nodes, [stepId]: { ...node, subEls } } };
}

// ---------------------------------------------------------------------------
// addSubEl — append a new SubEl to a step
// ---------------------------------------------------------------------------

type AddSubElInput =
  | { kind: "title"; text?: string }
  | { kind: "text"; text?: string }
  | { kind: "question"; kindOf?: "single" | "multi"; layout?: "list" | "cards" | "image_cards" }
  | { kind: "image"; url?: string; alt?: string }
  | { kind: "custom_html"; html?: string }
  | { kind: "loading"; text?: string; seconds?: number };

// ---------------------------------------------------------------------------
// updateSubEl — merge a partial patch into a single subEl (immutable)
// ---------------------------------------------------------------------------

/**
 * Returns a new QuizData with the given subEl patched. No-op if the step or el
 * is missing. Patch is merged shallowly — just the fields you pass are updated.
 */
export function updateSubEl(
  q: QuizData,
  stepId: string,
  elId: string,
  patch: Partial<SubEl>,
): QuizData {
  const node = q.nodes[stepId];
  if (!node || node.kind !== "step") return q;
  const idx = node.subEls.findIndex((e) => e.id === elId);
  if (idx === -1) return q;
  const updated = node.subEls.map((e, i) =>
    i === idx ? ({ ...e, ...patch } as SubEl) : e,
  );
  return { ...q, nodes: { ...q.nodes, [stepId]: { ...node, subEls: updated } } };
}

// ---------------------------------------------------------------------------
// removeSubEl — drop a subEl from a step (immutable)
// ---------------------------------------------------------------------------

/**
 * Returns a new QuizData without the given subEl. No-op if step/el missing.
 */
export function removeSubEl(q: QuizData, stepId: string, elId: string): QuizData {
  const node = q.nodes[stepId];
  if (!node || node.kind !== "step") return q;
  const filtered = node.subEls.filter((e) => e.id !== elId);
  if (filtered.length === node.subEls.length) return q; // not found — no-op
  return { ...q, nodes: { ...q.nodes, [stepId]: { ...node, subEls: filtered } } };
}

// ---------------------------------------------------------------------------
// Option helpers — operate on a question subEl's options array (immutable)
// ---------------------------------------------------------------------------

/**
 * Appends a new option to a question subEl. No-op if the el is not a question.
 */
export function addOption(
  q: QuizData,
  stepId: string,
  questionElId: string,
  label?: string,
): QuizData {
  const node = q.nodes[stepId];
  if (!node || node.kind !== "step") return q;
  const el = node.subEls.find((e) => e.id === questionElId);
  if (!el || el.kind !== "question") return q;
  const newOpt: QuestionOption = { id: newId("opt"), label: label ?? "" };
  const updatedEl: SubEl = { ...el, options: [...el.options, newOpt] };
  const subEls = node.subEls.map((e) => (e.id === questionElId ? updatedEl : e));
  return { ...q, nodes: { ...q.nodes, [stepId]: { ...node, subEls } } };
}

/**
 * Merges a patch into a specific option of a question subEl. No-op if not found.
 */
export function updateOption(
  q: QuizData,
  stepId: string,
  questionElId: string,
  optionId: string,
  patch: Partial<QuestionOption>,
): QuizData {
  const node = q.nodes[stepId];
  if (!node || node.kind !== "step") return q;
  const el = node.subEls.find((e) => e.id === questionElId);
  if (!el || el.kind !== "question") return q;
  const optIdx = el.options.findIndex((o) => o.id === optionId);
  if (optIdx === -1) return q;
  const updatedOptions = el.options.map((o, i) =>
    i === optIdx ? { ...o, ...patch } : o,
  );
  const updatedEl: SubEl = { ...el, options: updatedOptions };
  const subEls = node.subEls.map((e) => (e.id === questionElId ? updatedEl : e));
  return { ...q, nodes: { ...q.nodes, [stepId]: { ...node, subEls } } };
}

/**
 * Removes a specific option from a question subEl. No-op if not found.
 */
export function removeOption(
  q: QuizData,
  stepId: string,
  questionElId: string,
  optionId: string,
): QuizData {
  const node = q.nodes[stepId];
  if (!node || node.kind !== "step") return q;
  const el = node.subEls.find((e) => e.id === questionElId);
  if (!el || el.kind !== "question") return q;
  const filteredOptions = el.options.filter((o) => o.id !== optionId);
  if (filteredOptions.length === el.options.length) return q; // not found — no-op
  const updatedEl: SubEl = { ...el, options: filteredOptions };
  const subEls = node.subEls.map((e) => (e.id === questionElId ? updatedEl : e));
  return { ...q, nodes: { ...q.nodes, [stepId]: { ...node, subEls } } };
}

export function addSubEl(q: QuizData, stepId: string, input: AddSubElInput): QuizData {
  const node = q.nodes[stepId];
  if (!node || node.kind !== "step") return q;

  const id = newId("el");
  let el: SubEl;

  switch (input.kind) {
    case "title":
      el = { id, kind: "title", text: input.text ?? "New title", isRichText: true, contentFormat: "html" };
      break;
    case "text":
      el = { id, kind: "text", text: input.text ?? "New text", isRichText: true, contentFormat: "html" };
      break;
    case "question": {
      const optA: QuestionOption = { id: newId("opt"), label: "Option A" };
      const optB: QuestionOption = { id: newId("opt"), label: "Option B" };
      el = {
        id,
        kind: "question",
        kindOf: input.kindOf ?? "single",
        layout: input.layout ?? "list",
        options: [optA, optB],
      };
      break;
    }
    case "image":
      el = { id, kind: "image", url: input.url ?? "", alt: input.alt ?? "" };
      break;
    case "custom_html":
      el = { id, kind: "custom_html", html: input.html ?? "" };
      break;
    case "loading":
      el = { id, kind: "loading", text: input.text ?? "Loading...", style: "dots", seconds: input.seconds ?? 3 };
      break;
  }

  const updated: StepNode = { ...node, subEls: [...node.subEls, el] };
  return { ...q, nodes: { ...q.nodes, [stepId]: updated } };
}
