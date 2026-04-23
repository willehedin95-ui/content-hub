// Lightweight state machine for the quiz runtime. No external library.

import type {
  QuizData,
  QuizEdge,
  QuizNode,
  StepNode,
  ExitNode,
  RouteCondition,
  QuizEvent,
  UTMParams,
} from "./types";

// ---------------------------------------------------------------------------
// Variant assignment (weighted random, localStorage-persisted)
// ---------------------------------------------------------------------------

function weightedPick(nodes: StepNode[]): StepNode {
  const total = nodes.reduce((s, n) => s + (n.trafficPct ?? 0), 0);
  if (total <= 0) return nodes[0];
  let r = Math.random() * total;
  for (const n of nodes) {
    r -= n.trafficPct ?? 0;
    if (r <= 0) return n;
  }
  return nodes[nodes.length - 1];
}

export function resolveVariants(
  data: QuizData,
  quizId: string,
): Record<string, string> {
  // Group step nodes by variantGroupId
  const groups: Record<string, StepNode[]> = {};
  for (const node of Object.values(data.nodes)) {
    if (node.kind !== "step" || !node.variantGroupId) continue;
    const g = node.variantGroupId;
    if (!groups[g]) groups[g] = [];
    groups[g].push(node as StepNode);
  }

  const assignments: Record<string, string> = {};
  for (const [groupId, members] of Object.entries(groups)) {
    const key = `quiz_${quizId}_vg_${groupId}`;
    const stored = localStorage.getItem(key);
    if (stored && data.nodes[stored]) {
      assignments[groupId] = stored;
    } else {
      const picked = weightedPick(members);
      localStorage.setItem(key, picked.id);
      assignments[groupId] = picked.id;
    }
  }
  return assignments;
}

// ---------------------------------------------------------------------------
// Graph navigation
// ---------------------------------------------------------------------------

function getOutgoingEdges(data: QuizData, fromId: string): QuizEdge[] {
  return Object.values(data.edges).filter((e) => e.from === fromId);
}

function conditionMatches(
  cond: RouteCondition | undefined,
  answerId: string | null,
  questionElId: string | null,
): boolean {
  if (!cond || cond.kind === "default") return false;
  if (cond.kind === "option") {
    return cond.optionId === answerId && cond.questionElId === questionElId;
  }
  return false;
}

export function resolveNextNode(
  data: QuizData,
  fromId: string,
  answerId: string | null,
  questionElId: string | null,
  variantAssignments: Record<string, string>,
): QuizNode | null {
  const outgoing = getOutgoingEdges(data, fromId);
  if (outgoing.length === 0) return null;

  // Try conditional match first
  if (answerId !== null) {
    const match = outgoing.find((e) =>
      conditionMatches(e.condition, answerId, questionElId),
    );
    if (match) {
      return resolveNode(data, match.to, variantAssignments);
    }
  }

  // Fall back to default edge
  const defaultEdge =
    outgoing.find((e) => !e.condition || e.condition.kind === "default") ??
    outgoing[0];
  return resolveNode(data, defaultEdge.to, variantAssignments);
}

function resolveNode(
  data: QuizData,
  nodeId: string,
  variantAssignments: Record<string, string>,
): QuizNode | null {
  const node = data.nodes[nodeId];
  if (!node) return null;
  if (node.kind !== "step") return node;
  // If this node is in a variant group, resolve the assigned variant
  if (node.variantGroupId) {
    const assignedId = variantAssignments[node.variantGroupId];
    if (assignedId) {
      return data.nodes[assignedId] ?? node;
    }
  }
  return node;
}

export function findStartNode(data: QuizData): QuizNode | null {
  return Object.values(data.nodes).find((n) => n.kind === "start") ?? null;
}

// ---------------------------------------------------------------------------
// UTM extraction from current URL
// ---------------------------------------------------------------------------

export function extractUTM(): UTMParams {
  const p = new URLSearchParams(location.search);
  const utm: UTMParams = {};
  const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
  for (const k of keys) {
    const v = p.get(k);
    if (v) (utm as Record<string, string>)[k] = v;
  }
  return utm;
}

// ---------------------------------------------------------------------------
// Event buffer
// ---------------------------------------------------------------------------

export class EventBuffer {
  private buf: QuizEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private sessionId: string,
    private flushFn: (sessionId: string, events: QuizEvent[]) => Promise<void>,
  ) {
    this.flushTimer = setInterval(() => void this.flush(), 2000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void this.flush();
    });
  }

  push(event: Omit<QuizEvent, "ts">): void {
    this.buf.push({ ...event, ts: Date.now() });
  }

  async flush(): Promise<void> {
    if (this.buf.length === 0) return;
    const toSend = this.buf.splice(0);
    try {
      await this.flushFn(this.sessionId, toSend);
    } catch {
      // Put events back if flush fails - best effort
      this.buf.unshift(...toSend);
    }
  }

  destroy(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
  }
}

// ---------------------------------------------------------------------------
// Device type detection
// ---------------------------------------------------------------------------

export function detectDeviceType(): "mobile" | "tablet" | "desktop" {
  const ua = navigator.userAgent;
  if (/Mobi|Android|iPhone|iPod/.test(ua)) return "mobile";
  if (/iPad|Tablet/.test(ua)) return "tablet";
  return "desktop";
}
