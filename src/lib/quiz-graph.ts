// src/lib/quiz-graph.ts
import type { QuizData, QuizNode, StepNode, QuizEdge, RouteCondition, SubEl, QuestionOption } from "@/types/quiz";

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
  // Group variant siblings so we can place them adjacently when one is reached
  // via BFS. Without this, variant_group siblings whose only inbound edge is
  // the runtime variant-resolution swap (not a real graph edge) end up at the
  // tail via the unreachable-steps fallback (visually disconnected from their
  // sibling in funnel charts and editor lists).
  const siblingsByGroup = new Map<string, StepNode[]>();
  for (const s of steps) {
    if (!s.variantGroupId) continue;
    const arr = siblingsByGroup.get(s.variantGroupId) ?? [];
    arr.push(s);
    siblingsByGroup.set(s.variantGroupId, arr);
  }
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
    if (node && node.kind === "step") {
      order.push(node);
      if (node.variantGroupId) {
        const sibs = siblingsByGroup.get(node.variantGroupId) ?? [];
        for (let i = sibs.length - 1; i >= 0; i--) {
          const sib = sibs[i];
          if (sib.id !== id && !visited.has(sib.id)) queue.unshift(sib.id);
        }
      }
    }
    for (const e of Object.values(q.edges)) {
      if (e.from === id && stepIds.has(e.to) && !visited.has(e.to)) queue.push(e.to);
    }
  }
  for (const s of steps) if (!visited.has(s.id)) order.push(s);
  return order;
}

// ---------------------------------------------------------------------------
// computeAutoLayout — derive tidy node positions from the graph
// ---------------------------------------------------------------------------

export type NodePositions = Record<string, { x: number; y: number }>;

/** Layout spacing (grid units). Exported so the canvas can reuse them. */
export const AUTO_LAYOUT = { ROW_H: 280, COL_W: 340 } as const;

/**
 * Computes a clean top-to-bottom layered layout from the quiz graph so the
 * canvas always mirrors the real flow order and can never drift into a mess.
 *
 *  - The default-edge spine (start → … → exit) runs dead straight down column 0.
 *  - Branch targets (conditional edges) and A/B variant siblings fork out to
 *    the right on the same row, then rejoin lower down.
 *  - Truly detached nodes (unreachable, no variant group) are parked in a
 *    left-side lane so they never disturb the main flow.
 *
 * Positions are DERIVED, not persisted — the editor recomputes on every change,
 * which is what makes the layout impossible to mess up by dragging.
 */
export function computeAutoLayout(q: QuizData): NodePositions {
  const { ROW_H, COL_W } = AUTO_LAYOUT;
  const DETACHED_X = -COL_W * 2; // parking lane, left of the spine

  const nodes = Object.values(q.nodes);
  const edges = Object.values(q.edges);
  const start = nodes.find((n) => n.kind === "start");

  // First default (non-option) edge out of each node = the main-flow successor.
  const defaultTarget: Record<string, string> = {};
  for (const e of edges) {
    const isDefault = !e.condition || e.condition.kind === "default";
    if (isDefault && defaultTarget[e.from] === undefined) defaultTarget[e.from] = e.to;
  }

  // rank = longest path from start (Bellman-Ford style relaxation; the
  // iteration cap doubles as a cycle guard so a stray loop can't spin forever).
  const rank: Record<string, number> = {};
  if (start) rank[start.id] = 0;
  const maxPasses = nodes.length + 2;
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (const e of edges) {
      const rf = rank[e.from];
      if (rf === undefined) continue;
      if (rank[e.to] === undefined || rank[e.to] < rf + 1) {
        rank[e.to] = rf + 1;
        changed = true;
      }
    }
    if (!changed) break;
  }

  // A/B variant siblings are only "reached" via runtime swap, not a graph edge.
  // Pin each unranked sibling onto its group's earliest ranked member so the
  // whole group sits on one row, side by side.
  const groups = new Map<string, StepNode[]>();
  for (const n of nodes) {
    if (n.kind !== "step" || !n.variantGroupId) continue;
    const arr = groups.get(n.variantGroupId) ?? [];
    arr.push(n);
    groups.set(n.variantGroupId, arr);
  }
  for (const members of groups.values()) {
    const ranks = members
      .map((m) => rank[m.id])
      .filter((r): r is number => r !== undefined);
    if (ranks.length === 0) continue;
    const groupRank = Math.min(...ranks);
    for (const m of members) if (rank[m.id] === undefined) rank[m.id] = groupRank;
  }

  // spine = the default-edge chain from start, kept dead straight at column 0.
  const spine = new Set<string>();
  if (start) {
    let cur: string | undefined = start.id;
    const guard = new Set<string>();
    while (cur && !guard.has(cur)) {
      guard.add(cur);
      spine.add(cur);
      cur = defaultTarget[cur];
    }
  }

  const byRank = new Map<number, QuizNode[]>();
  const detached: QuizNode[] = [];
  for (const n of nodes) {
    const r = rank[n.id];
    if (r === undefined) {
      detached.push(n);
      continue;
    }
    const arr = byRank.get(r) ?? [];
    arr.push(n);
    byRank.set(r, arr);
  }

  const positions: NodePositions = {};
  for (const [r, group] of byRank) {
    // Column 0 is reserved for the spine so the main line stays dead straight.
    // Everything else (branch targets, variant siblings) fans out to columns
    // 1, 2, … on the right — even when no spine node shares their row — so a
    // fork is always visibly off the central axis.
    const spineNodes = group.filter((n) => spine.has(n.id));
    const others = group.filter((n) => !spine.has(n.id));
    spineNodes.forEach((n, i) => {
      positions[n.id] = { x: i * COL_W, y: r * ROW_H };
    });
    others.forEach((n, i) => {
      positions[n.id] = { x: (i + 1) * COL_W, y: r * ROW_H };
    });
  }
  // detached / unreachable nodes: stack vertically in the left parking lane.
  detached.forEach((n, i) => {
    positions[n.id] = { x: DETACHED_X, y: i * ROW_H };
  });

  return positions;
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
  // Clone the original's outgoing edges (same targets + conditions) so the
  // new variant is not a dead end for its share of traffic. Option-condition
  // edges stay valid because subEls are deep-cloned with the SAME el/option
  // ids above.
  const edges = { ...q.edges };
  for (const e of Object.values(q.edges)) {
    if (e.from !== originalId) continue;
    const id = newId("edge");
    edges[id] = {
      id,
      from: variantId,
      to: e.to,
      condition: e.condition
        ? (JSON.parse(JSON.stringify(e.condition)) as RouteCondition)
        : undefined,
    };
  }
  return { ...q, nodes: { ...q.nodes, [originalId]: updatedOrig, [variantId]: variant }, edges };
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
  | { kind: "question"; kindOf?: "single" | "multi"; layout?: "list" | "cards" | "image_cards" | "chips" | "dropdown" }
  | { kind: "image"; url?: string; alt?: string }
  | { kind: "custom_html"; html?: string }
  | { kind: "loading"; text?: string; seconds?: number }
  | { kind: "range_slider"; variable?: string; min?: number; max?: number }
  | { kind: "text_input"; variable?: string; inputType?: "text" | "number" | "date" }
  | { kind: "testimonial_slider" };

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

// ---------------------------------------------------------------------------
// duplicateStep — deep-clone a step node with new ids, offset position
// ---------------------------------------------------------------------------

/**
 * Deep-clones a step, generating new ids for the node and all subEls.
 * Position is offset by +40,+40. Name gets "(copy)" suffix.
 * The duplicate does NOT inherit variantGroupId or trafficPct.
 */
export function duplicateStep(q: QuizData, stepId: string): QuizData {
  const src = q.nodes[stepId];
  if (!src || src.kind !== "step") return q;

  const newNodeId = newId("step");
  // Deep-clone subEls with fresh ids
  const clonedSubEls: StepNode["subEls"] = (JSON.parse(JSON.stringify(src.subEls)) as StepNode["subEls"]).map((el) => ({
    ...el,
    id: newId("el"),
  }));

  const duplicate: StepNode = {
    id: newNodeId,
    kind: "step",
    name: `${src.name} (copy)`,
    size: { ...src.size },
    position: { x: src.position.x + 40, y: src.position.y + 40 },
    rotation: src.rotation,
    subEls: clonedSubEls,
    // intentionally omits variantGroupId and trafficPct
  };

  return { ...q, nodes: { ...q.nodes, [newNodeId]: duplicate } };
}

// ---------------------------------------------------------------------------
// promoteVariant — promote a winning variant, removing its siblings
// ---------------------------------------------------------------------------

/**
 * Removes all sibling nodes in the variant group and clears
 * variantGroupId + trafficPct on the winner.
 *
 * Graph integrity: before removing siblings, all inbound edges pointing at a
 * sibling (typically the old primary) are repointed to the winner, and if the
 * winner has no outgoing edges of its own it inherits the old primary's
 * outgoing edges. Without this, promoting a variant left the previous step
 * with zero outgoing edges - clicks silently did nothing in the runtime.
 */
export function promoteVariant(q: QuizData, winnerId: string): QuizData {
  const winner = q.nodes[winnerId];
  if (!winner || winner.kind !== "step" || !winner.variantGroupId) return q;

  const groupId = winner.variantGroupId;
  const siblings = Object.values(q.nodes).filter(
    (n): n is StepNode => n.kind === "step" && n.variantGroupId === groupId && n.id !== winnerId,
  );
  const siblingIds = new Set(siblings.map((s) => s.id));
  const condKey = (c: RouteCondition | undefined) => JSON.stringify(c ?? { kind: "default" });

  // 1. Repoint inbound edges that target a sibling to the winner instead.
  //    Skip edges that would become self-loops and edges that would duplicate
  //    an existing (from, condition) edge already pointing at the winner.
  const existingToWinner = new Set(
    Object.values(q.edges)
      .filter((e) => e.to === winnerId)
      .map((e) => `${e.from}|${condKey(e.condition)}`),
  );
  const edges: Record<string, QuizEdge> = {};
  for (const [id, e] of Object.entries(q.edges)) {
    if (siblingIds.has(e.to) && !siblingIds.has(e.from)) {
      if (e.from === winnerId) continue; // would become a self-loop - drop
      const key = `${e.from}|${condKey(e.condition)}`;
      if (existingToWinner.has(key)) continue; // duplicate route - drop
      existingToWinner.add(key);
      edges[id] = { ...e, to: winnerId };
    } else {
      edges[id] = e;
    }
  }

  // 2. If the winner lacks outgoing edges, inherit the old primary's
  //    (= the first sibling that actually has outgoing edges; variants
  //    created before edge-cloning existed have none of their own).
  const winnerHasOutgoing = Object.values(edges).some((e) => e.from === winnerId);
  if (!winnerHasOutgoing) {
    const donor = siblings.find((s) =>
      Object.values(q.edges).some((e) => e.from === s.id),
    );
    if (donor) {
      for (const e of Object.values(q.edges)) {
        if (e.from !== donor.id) continue;
        if (e.to === winnerId || siblingIds.has(e.to)) continue; // avoid self/sibling loops
        const id = newId("edge");
        edges[id] = {
          id,
          from: winnerId,
          to: e.to,
          condition: e.condition
            ? (JSON.parse(JSON.stringify(e.condition)) as RouteCondition)
            : undefined,
        };
      }
    }
  }

  // 3. Remove all sibling nodes (and any remaining edges touching them)
  let updated: QuizData = { ...q, edges };
  for (const sibling of siblings) {
    updated = removeNode(updated, sibling.id);
  }

  // 4. Clear variant fields on winner
  const promotedWinner: StepNode = { ...updated.nodes[winnerId] } as StepNode;
  delete promotedWinner.variantGroupId;
  delete promotedWinner.trafficPct;

  return { ...updated, nodes: { ...updated.nodes, [winnerId]: promotedWinner } };
}

// ---------------------------------------------------------------------------
// deleteVariant — delete a variant from a group
// ---------------------------------------------------------------------------

/**
 * Removes the variant. If only one member remains after deletion,
 * clears that member's variantGroupId and trafficPct too.
 */
export function deleteVariant(q: QuizData, variantId: string): QuizData {
  const variant = q.nodes[variantId];
  if (!variant || variant.kind !== "step") return q;

  const groupId = variant.variantGroupId;
  // Remove the variant node (and its edges)
  let updated = removeNode(q, variantId);

  if (!groupId) return updated;

  // Find remaining group members
  const remaining = Object.values(updated.nodes).filter(
    (n): n is StepNode => n.kind === "step" && n.variantGroupId === groupId,
  );

  // If only one member left, clear its variant fields
  if (remaining.length === 1) {
    const sole = remaining[0];
    const cleared: StepNode = { ...sole };
    delete cleared.variantGroupId;
    delete cleared.trafficPct;
    updated = { ...updated, nodes: { ...updated.nodes, [sole.id]: cleared } };
  }

  return updated;
}

// ---------------------------------------------------------------------------
// setOptionRoute — upsert/remove a conditional edge for a specific option
// ---------------------------------------------------------------------------

/**
 * Upserts a conditional edge from `stepId → targetId` with
 * `condition: { kind: "option", questionElId, optionId }`.
 * If `targetId` is null, removes any existing conditional edge for that option.
 * Does NOT touch default edges.
 */
export function setOptionRoute(
  q: QuizData,
  stepId: string,
  questionElId: string,
  optionId: string,
  targetId: string | null,
): QuizData {
  // Find any existing edge for this specific option condition
  const existingEntry = Object.entries(q.edges).find(
    ([, e]) =>
      e.from === stepId &&
      e.condition?.kind === "option" &&
      e.condition.questionElId === questionElId &&
      e.condition.optionId === optionId,
  );

  if (targetId === null) {
    // Remove the conditional edge if it exists
    if (!existingEntry) return q;
    const edges = { ...q.edges };
    delete edges[existingEntry[0]];
    return { ...q, edges };
  }

  if (existingEntry) {
    // Update target of existing conditional edge
    const [edgeId, existing] = existingEntry;
    return {
      ...q,
      edges: { ...q.edges, [edgeId]: { ...existing, to: targetId } },
    };
  }

  // Create new conditional edge
  const id = newId("edge");
  const edge: QuizEdge = {
    id,
    from: stepId,
    to: targetId,
    condition: { kind: "option", questionElId, optionId },
  };
  return { ...q, edges: { ...q.edges, [id]: edge } };
}

// ---------------------------------------------------------------------------
// ensureDefaultEdge — guarantee at least one default edge from a step
// ---------------------------------------------------------------------------

/**
 * If no default edge exists from `fromStepId`, creates one to `toStepId`.
 * If a default edge already exists (pointing anywhere), returns q unchanged.
 */
export function ensureDefaultEdge(
  q: QuizData,
  fromStepId: string,
  toStepId: string,
): QuizData {
  const hasDefault = Object.values(q.edges).some(
    (e) =>
      e.from === fromStepId &&
      (!e.condition || e.condition.kind === "default"),
  );
  if (hasDefault) return q;
  return connectNodes(q, {
    from: fromStepId,
    to: toStepId,
    condition: { kind: "default" },
  });
}

// ---------------------------------------------------------------------------
// validateQuizForPublish — graph integrity checks gating publish
// ---------------------------------------------------------------------------

/**
 * Validates a quiz graph before publish. Returns a list of human-readable
 * problems; an empty list means the quiz is publishable.
 *
 * Checks:
 *  (a) every REACHABLE step has >= 1 outgoing edge (exit nodes exempt)
 *  (b) all edge.from / edge.to reference existing nodes
 *  (c) at least one exit node is reachable from the start node
 *  (d) each variant group's trafficPct sums to 100
 *  (e) image_cards question options all have an imageUrl
 *
 * Reachability is variant-aware: reaching any member of a variant group makes
 * all siblings reachable (the runtime swaps to the assigned variant), so
 * sibling steps only reachable via variant resolution are still validated.
 */
export function validateQuizForPublish(q: QuizData): string[] {
  const problems: string[] = [];
  const nodes = q.nodes;

  // (b) edge references
  for (const e of Object.values(q.edges)) {
    if (!nodes[e.from]) problems.push(`Edge ${e.id} references a missing source node (${e.from})`);
    if (!nodes[e.to]) problems.push(`Edge ${e.id} references a missing target node (${e.to})`);
  }

  const start = Object.values(nodes).find((n) => n.kind === "start");
  if (!start) {
    problems.push("Quiz has no start node");
    return problems;
  }

  // Variant groups
  const groups = new Map<string, StepNode[]>();
  for (const n of Object.values(nodes)) {
    if (n.kind !== "step" || !n.variantGroupId) continue;
    const arr = groups.get(n.variantGroupId) ?? [];
    arr.push(n);
    groups.set(n.variantGroupId, arr);
  }

  // (d) trafficPct sums to 100 per group
  for (const [gid, members] of groups.entries()) {
    const total = members.reduce((s, m) => s + (m.trafficPct ?? 0), 0);
    if (Math.round(total) !== 100) {
      const label = members[0]?.name ?? gid;
      problems.push(
        `Variant group "${label}" traffic split sums to ${total}% (must be 100%)`,
      );
    }
  }

  // Reachability BFS from start (variant-group aware)
  const reachable = new Set<string>();
  const queue: string[] = [start.id];
  while (queue.length) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const node = nodes[id];
    if (node && node.kind === "step" && node.variantGroupId) {
      for (const sib of groups.get(node.variantGroupId) ?? []) {
        if (!reachable.has(sib.id)) queue.push(sib.id);
      }
    }
    for (const e of Object.values(q.edges)) {
      if (e.from === id && nodes[e.to] && !reachable.has(e.to)) queue.push(e.to);
    }
  }

  // (a) reachable steps must have an outgoing edge. Variant siblings with
  // trafficPct 0 are exempt - the runtime's weighted pick never selects
  // them, so a disabled legacy variant without edges strands no visitors.
  for (const n of Object.values(nodes)) {
    if (n.kind !== "step" || !reachable.has(n.id)) continue;
    if (
      n.variantGroupId &&
      (n.trafficPct ?? 0) === 0 &&
      (groups.get(n.variantGroupId)?.length ?? 0) > 1
    ) {
      continue;
    }
    const hasOutgoing = Object.values(q.edges).some((e) => e.from === n.id);
    if (!hasOutgoing) {
      problems.push(
        `Step "${n.name}" has no outgoing edge - visitors reaching it get stuck`,
      );
    }
  }

  // (c) at least one reachable exit
  const exitReachable = Object.values(nodes).some(
    (n) => n.kind === "exit" && reachable.has(n.id),
  );
  if (!exitReachable) {
    problems.push("No exit node is reachable from the start node");
  }

  // (e) image_cards options need images - reachable steps only, so a
  // scrapped draft step outside the graph can't block publish
  for (const n of Object.values(nodes)) {
    if (n.kind !== "step" || !reachable.has(n.id)) continue;
    for (const el of n.subEls) {
      if (el.kind !== "question" || el.layout !== "image_cards") continue;
      for (const o of el.options) {
        if (!o.imageUrl) {
          problems.push(
            `Step "${n.name}": image_cards option "${o.label || o.id}" is missing an image`,
          );
        }
      }
    }
  }

  return problems;
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
    case "range_slider":
      el = {
        id,
        kind: "range_slider",
        variable: input.variable ?? "score",
        min: input.min ?? 0,
        max: input.max ?? 100,
        step: 1,
        initial: 50,
        unit: "",
      };
      break;
    case "text_input":
      el = {
        id,
        kind: "text_input",
        variable: input.variable ?? "answer",
        inputType: input.inputType ?? "text",
        placeholder: "",
      };
      break;
    case "testimonial_slider":
      el = {
        id,
        kind: "testimonial_slider",
        items: [
          { name: "Customer", text: "Best product I've ever tried.", rating: 5 },
        ],
      };
      break;
  }

  const updated: StepNode = { ...node, subEls: [...node.subEls, el] };
  return { ...q, nodes: { ...q.nodes, [stepId]: updated } };
}
