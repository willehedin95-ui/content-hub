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
    const storedNode = stored ? data.nodes[stored] : null;
    // Re-pick when the stored variant has been disabled (trafficPct === 0).
    // Without this check, returning visitors stay on a variant the operator
    // has explicitly turned off, contaminating the active test.
    const storedPct =
      storedNode && storedNode.kind === "step"
        ? (storedNode as StepNode).trafficPct ?? 0
        : 0;
    if (storedNode && storedPct > 0) {
      assignments[groupId] = stored!;
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
  variables: Record<string, string> = {},
): QuizNode | null {
  const outgoing = getOutgoingEdges(data, fromId);
  if (outgoing.length === 0) return null;

  // Resolve the immediate target: a matching conditional edge wins, else the
  // default edge.
  let toId: string | null = null;
  if (answerId !== null) {
    const match = outgoing.find((e) =>
      conditionMatches(e.condition, answerId, questionElId),
    );
    if (match) toId = match.to;
  }
  if (toId === null) {
    const defaultEdge =
      outgoing.find((e) => !e.condition || e.condition.kind === "default") ??
      outgoing[0];
    toId = defaultEdge.to;
  }

  // Transparently step over gated nodes (skipAlways / skipIfVarSet) by
  // following their default edge, so a variant can opt out of a slot or a
  // question placed at two positions fires exactly once. Cycle-guarded.
  let target = resolveNode(data, toId, variantAssignments);
  const seen = new Set<string>();
  while (
    target &&
    target.kind === "step" &&
    shouldSkipStep(target as StepNode, variables) &&
    !seen.has(target.id)
  ) {
    seen.add(target.id);
    const outs = getOutgoingEdges(data, target.id);
    if (outs.length === 0) break;
    const def =
      outs.find((e) => !e.condition || e.condition.kind === "default") ??
      outs[0];
    target = resolveNode(data, def.to, variantAssignments);
  }
  return target;
}

/** A step the flow resolves to is skipped when it opts out of its slot
 *  (skipAlways) or when its captured variable is already set (skipIfVarSet). */
function shouldSkipStep(
  node: StepNode,
  variables: Record<string, string>,
): boolean {
  if (node.skipAlways) return true;
  if (node.skipIfVarSet && (variables[node.skipIfVarSet] ?? "") !== "") {
    return true;
  }
  return false;
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

// The hub's /api/quiz/events endpoint caps events[] at 50 per request and
// silently truncates larger batches. Always send in chunks of at most 50 so
// an offline-accumulated buffer never loses its tail.
const MAX_EVENTS_PER_REQUEST = 50;

export class EventBuffer {
  private buf: QuizEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private apiEventsUrl: string;

  /**
   * `sessionId` may be null at construction: the buffer is created
   * synchronously at mount so events (first step_view, fast answers) are
   * captured even while startSession is still in flight / retrying. Nothing
   * is sent until setSessionId() provides the id - events just accumulate.
   */
  constructor(
    private sessionId: string | null,
    private flushFn: (sessionId: string, events: QuizEvent[]) => Promise<void>,
    apiBaseUrl: string,
  ) {
    this.apiEventsUrl = `${apiBaseUrl}/api/quiz/events`;
    this.flushTimer = setInterval(() => void this.flush(), 2000);
    // Use both visibilitychange (tab switch / app background) and pagehide
    // (actual unload). Beacon-flush guarantees delivery even after tab
    // close - regular fetch (even with keepalive) gets cancelled on
    // synchronous tab teardown.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.flushBeacon();
    });
    window.addEventListener("pagehide", () => this.flushBeacon());
  }

  /** Attach the resolved session id and immediately flush buffered events. */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
    void this.flush();
  }

  push(event: Omit<QuizEvent, "ts">): void {
    this.buf.push({ ...event, ts: Date.now() });
  }

  /**
   * Normal flush via fetch+keepalive. Used by the 2s interval and
   * explicit calls. Returns events to buffer on failure. No-op while the
   * session id is still unknown - events keep buffering.
   */
  async flush(): Promise<void> {
    if (!this.sessionId) return;
    if (this.buf.length === 0) return;
    const sid = this.sessionId;
    const toSend = this.buf.splice(0);
    // Chunked send: the server caps events[] per request, so oversized
    // buffers go out as sequential batches instead of being truncated.
    for (let i = 0; i < toSend.length; i += MAX_EVENTS_PER_REQUEST) {
      const chunk = toSend.slice(i, i + MAX_EVENTS_PER_REQUEST);
      try {
        await this.flushFn(sid, chunk);
      } catch {
        // Put this chunk + all unsent chunks back - best effort
        this.buf.unshift(...toSend.slice(i));
        return;
      }
    }
  }

  /**
   * Synchronous flush for unload-time delivery. Uses navigator.sendBeacon
   * which the browser guarantees to deliver even after tab close. Falls
   * back to fetch+keepalive if Beacon API is unavailable. Drains the
   * buffer immediately so unload isn't blocked.
   *
   * The beacon payload is sent as text/plain: application/json beacons
   * trigger a CORS preflight, and at unload time the browser may kill the
   * page before the OPTIONS round-trip completes - the event silently
   * never arrives. text/plain is a "simple request" (no preflight); the
   * hub API parses the body as JSON regardless of content type.
   */
  flushBeacon(): void {
    if (!this.sessionId) return; // can't attribute events without a session
    if (this.buf.length === 0) return;
    const sid = this.sessionId;
    const toSend = this.buf.splice(0);
    // Chunked like flush(): multiple sendBeacon calls are fine - the browser
    // queues them all for delivery even after tab close.
    for (let i = 0; i < toSend.length; i += MAX_EVENTS_PER_REQUEST) {
      const chunk = toSend.slice(i, i + MAX_EVENTS_PER_REQUEST);
      const payload = JSON.stringify({
        session_id: sid,
        events: chunk.map((e) => ({
          event_type: e.event_type,
          step_id: e.step_id,
          variant_group_id: e.variant_group_id,
          option_id: e.option_id,
          meta: e.meta,
        })),
      });
      let sent = false;
      try {
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
          const blob = new Blob([payload], { type: "text/plain" });
          sent = navigator.sendBeacon(this.apiEventsUrl, blob);
        }
      } catch {
        sent = false;
      }
      if (!sent) {
        // Last-resort: fire-and-forget keepalive fetch
        try {
          void fetch(this.apiEventsUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
          });
        } catch {
          // give up - put remaining events back so a future flush() still
          // has a chance
          this.buf.unshift(...toSend.slice(i));
          return;
        }
      }
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
