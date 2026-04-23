# Quiz Funnel Builder — Editor MVP Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the quiz funnel editor in content-hub: data model, list page, logic canvas, and step editor that reuses the existing Page Builder for per-step content — with A/B variants as sibling step nodes.

**Architecture:** New `/quizzes` section in the hub. Quiz data lives in one Supabase row (`quizzes.data` JSONB) structured as a node/edge graph (nodes: `start` | `step` | `exit`; edges for flow + per-option conditional routing). A/B variants are sibling step nodes sharing a `variantGroupId`, stacked vertically on the canvas. The editor is a three-column overlay (steps tree / logic canvas / step content) where the step content panel embeds the existing Page Builder.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase (PostgreSQL JSONB), React Flow v12 (new dep: `@xyflow/react`), Tailwind CSS, Vitest (jsdom) for tests.

**Spec:** `docs/superpowers/specs/2026-04-23-quiz-funnel-builder-design.md`

**Out of scope for this plan (future plans):**
- Runtime bundle + Cloudflare Pages publishing (Phase 3 in spec)
- Analytics dashboard + canvas overlay + events APIs (Phase 4)
- Quiz Swiper (Phase 5)
- Hydro13 migration + launch (Phase 6)

This plan produces a working editor where you can create a quiz, lay out nodes, write content in each step using the existing Page Builder, add per-option branching, and split-test variants. Drafts save to Supabase; nothing publishes yet.

---

## File Structure

### New files

**Types & pure logic:**
- `src/types/quiz.ts` — all quiz-related TypeScript types (`QuizData`, `QuizNode`, `QuizEdge`, `SubEl`, `QuizSettings`, etc.)
- `src/lib/quiz-graph.ts` — pure graph helpers (topo sort, add/remove node, connect, variants)
- `src/lib/quiz-graph.test.ts` — tests for graph helpers
- `src/lib/quiz-defaults.ts` — factories for a new quiz and default settings
- `src/lib/quiz-defaults.test.ts` — tests for factories
- `src/lib/quiz-subel-html.ts` — round-trip serializer between `SubEl[]` and HTML (for Page Builder integration)
- `src/lib/quiz-subel-html.test.ts` — round-trip tests

**API routes:**
- `src/app/api/quiz/route.ts` — `POST` create quiz, `GET` list by workspace+market
- `src/app/api/quiz/[id]/route.ts` — `GET` load, `PATCH` autosave, `DELETE` archive
- `src/app/api/quiz/[id]/duplicate/route.ts` — `POST` clone

**Pages:**
- `src/app/quizzes/page.tsx` — server component, loads list
- `src/app/quizzes/page.client.tsx` — client, grid + create buttons
- `src/app/quizzes/[id]/edit/page.tsx` — server wrapper that fetches the quiz row
- `src/app/quizzes/[id]/edit/QuizEditorClient.tsx` — client, mounts `QuizShell`

**Editor components:**
- `src/components/quiz-builder/QuizShell.tsx` — top-level layout, owns `QuizProvider`
- `src/components/quiz-builder/QuizContext.tsx` — React Context, state, autosave
- `src/components/quiz-builder/QuizTopBar.tsx` — name, Editor/Settings tabs, Saved indicator
- `src/components/quiz-builder/StepsTree.tsx` — left sidebar tree
- `src/components/quiz-builder/LogicCanvas.tsx` — React Flow canvas
- `src/components/quiz-builder/nodes/StartNode.tsx` — start node renderer
- `src/components/quiz-builder/nodes/StepNode.tsx` — step node renderer (preview + toolbar)
- `src/components/quiz-builder/nodes/ExitNode.tsx` — exit node renderer
- `src/components/quiz-builder/StepEditor.tsx` — right panel; wraps Page Builder around the selected step's serialized HTML
- `src/components/quiz-builder/ElementPalette.tsx` — drag-in Title/Text/Question/Image/Custom HTML/Loading
- `src/components/quiz-builder/VariantControls.tsx` — variant badge popover with traffic slider + promote/delete

### Modified files

- `src/components/layout/Sidebar.tsx` — add `Quizzes` nav item between Pages and Ads
- `package.json` — add `@xyflow/react` dependency
- `src/app/globals.css` (or equivalent global entry) — import `@xyflow/react/dist/style.css`

---

## Chunk 1: Database + core types

This chunk creates the Supabase schema, TypeScript types, and pure graph helpers with full test coverage. No UI yet.

### Task 1.1: Create Supabase `quizzes` table

**Files:**
- Run DDL via Supabase Management API (no file)

- [ ] **Step 1: Run the DDL**

Token + project-ref are in memory (`sbp_111fc4cc2f2e45d01f036c3f8487f9115c436c94`, `fbpefeqqqfrcmfmjmeij`).

```bash
curl -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_111fc4cc2f2e45d01f036c3f8487f9115c436c94" \
  -H "Content-Type: application/json" \
  -d '{"query": "create table if not exists quizzes (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces(id) on delete cascade, market text not null, slug text not null, name text not null, status text not null default '\''draft'\'', data jsonb not null default '\''{}'\''::jsonb, settings jsonb not null default '\''{}'\''::jsonb, published_url text, published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (market, slug)); create index if not exists quizzes_workspace_idx on quizzes(workspace_id, market, status); create index if not exists quizzes_updated_idx on quizzes(updated_at desc);"}'
```

Expected: `{}`.

- [ ] **Step 2: Verify**

```bash
curl -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_111fc4cc2f2e45d01f036c3f8487f9115c436c94" \
  -H "Content-Type: application/json" \
  -d '{"query": "select column_name, data_type from information_schema.columns where table_name = '\''quizzes'\'' order by ordinal_position;"}'
```

Expected: 12 columns ending in `updated_at`.

Note: `quiz_sessions` and `quiz_events` are deferred to the Analytics plan.

### Task 1.2: Add React Flow

**Files:** `package.json`, global CSS

- [ ] **Step 1: Install**

```bash
cd "/Users/williamhedin/Claude Code/content-hub" && npm install @xyflow/react
```

- [ ] **Step 2: Import the stylesheet globally**

Locate the global CSS entry (`src/app/globals.css` per Tailwind conventions). Add a `@import` at the top:

```css
@import "@xyflow/react/dist/style.css";
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json src/app/globals.css
git commit -m "deps: add @xyflow/react for quiz logic canvas"
```

### Task 1.3: Define quiz types

**Files:** `src/types/quiz.ts`

- [ ] **Step 1: Create the file with these types**

```ts
// src/types/quiz.ts
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

export type StartNode = { id: string; kind: "start"; size: Size; position: Point };
export type StepNode = {
  id: string;
  kind: "step";
  name: string;
  size: Size;
  position: Point;
  rotation: number;
  subEls: SubEl[];
  variantGroupId?: string;
  trafficPct?: number;
};
export type ExitNode = {
  id: string;
  kind: "exit";
  name: string;
  size: Size;
  position: Point;
  redirectUrl: string;
};
export type QuizNode = StartNode | StepNode | ExitNode;

export type RouteCondition =
  | { kind: "default" }
  | { kind: "option"; questionElId: string; optionId: string };

export type QuizEdge = { id: string; from: string; to: string; condition?: RouteCondition };

export type QuestionOption = {
  id: string;
  label: string;
  emoji?: string;
  imageUrl?: string;
  value?: string;
};

export type SubEl =
  | { id: string; kind: "title"; text: string; isRichText: true; contentFormat: "html" }
  | { id: string; kind: "text"; text: string; isRichText: true; contentFormat: "html" }
  | {
      id: string;
      kind: "question";
      kindOf: "single" | "multi";
      layout: "list" | "cards" | "image_cards";
      options: QuestionOption[];
    }
  | { id: string; kind: "image"; url: string; alt: string }
  | { id: string; kind: "custom_html"; html: string }
  | { id: string; kind: "loading"; text: string; style: string; seconds: number };

export type QuizData = {
  id: string;
  nodes: Record<string, QuizNode>;
  edges: Record<string, QuizEdge>;
  camera: { x: number; y: number; z: number };
};

export type QuizSettings = {
  brandLogo?: { url: string; enabled: boolean };
  brandColors: {
    background: string;
    textPrimary: string;
    textSecondary: string;
    primaryBrand: string;
    optionBackground: string;
  };
  fontSettings: { enabled: boolean; fontFamily: string };
  progressBar: boolean;
  stepProgressCount: boolean;
  backNavigation: boolean;
  metadata: { title: string; description: string; ogImage?: string; favicon?: string };
  providers: {
    klaviyo?: { listId: string; captureAtStepId?: string };
    metaPixel?: { pixelId: string };
    ga4?: { measurementId: string };
  };
  redirectUrl: string;
  customCode?: { head?: string; bodyEnd?: string };
};

export type QuizRow = {
  id: string;
  workspace_id: string;
  market: "se" | "dk" | "no";
  slug: string;
  name: string;
  status: "draft" | "published" | "archived";
  data: QuizData;
  settings: QuizSettings;
  published_url: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/quiz.ts
git commit -m "feat(quiz): add QuizData/Node/Edge/SubEl types"
```

### Task 1.4: Graph helper — `newId` (TDD)

**Files:** `src/lib/quiz-graph.ts`, `src/lib/quiz-graph.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/lib/quiz-graph.test.ts
import { describe, it, expect } from "vitest";
import { newId } from "./quiz-graph";

describe("newId", () => {
  it("produces prefixed ids with timestamp + random suffix", () => {
    expect(newId("step")).toMatch(/^step_\d+_[a-z0-9]+$/);
  });
  it("produces distinct ids", () => {
    expect(newId("step")).not.toBe(newId("step"));
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

```bash
npx vitest run src/lib/quiz-graph.test.ts
```

- [ ] **Step 3: Implement**

```ts
// src/lib/quiz-graph.ts
export function newId(prefix: "step" | "edge" | "exit" | "start" | "el" | "opt" | "vg"): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${ts}_${rand}`;
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/quiz-graph.ts src/lib/quiz-graph.test.ts
git commit -m "feat(quiz): add newId helper"
```

### Task 1.5: Graph helper — `addStepNode` + `removeNode` (TDD)

**Files:** `src/lib/quiz-graph.ts`, `src/lib/quiz-graph.test.ts`

- [ ] **Step 1: Failing tests**

Append:

```ts
import { addStepNode, removeNode } from "./quiz-graph";
import type { QuizData, StepNode } from "@/types/quiz";

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
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

Append to `src/lib/quiz-graph.ts`:

```ts
import type { QuizData, StepNode } from "@/types/quiz";

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
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "feat(quiz): add addStepNode and removeNode helpers"
```

### Task 1.6: Graph helper — `connectNodes` + `setEdgeCondition` (TDD)

**Files:** `src/lib/quiz-graph.ts`, `src/lib/quiz-graph.test.ts`

- [ ] **Step 1: Failing tests** (covering edge creation, dedup, condition update) — append to test file, same pattern as above.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
import type { QuizEdge, RouteCondition } from "@/types/quiz";

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
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "feat(quiz): add connectNodes and setEdgeCondition helpers"
```

### Task 1.7: Graph helper — `topoOrderSteps` (TDD)

**Files:** `src/lib/quiz-graph.ts`, `src/lib/quiz-graph.test.ts`

- [ ] **Step 1: Failing tests** — must cover:
  - start → a → b → exit returns `[a, b]`
  - cycle between a and b returns both in insertion order (no infinite loop)

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement with BFS from start, insertion-order fallback**

```ts
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
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "feat(quiz): add topoOrderSteps"
```

### Task 1.8: Graph helper — `createVariant` + `getVariantGroup` + `setTrafficSplit` (TDD)

**Files:** `src/lib/quiz-graph.ts`, `src/lib/quiz-graph.test.ts`

- [ ] **Step 1: Failing tests**

Cover:
- `createVariant` produces a sibling node, both get same `variantGroupId`, both get `trafficPct: 50`, subEls are deep-copied (not shared reference), variant is positioned below original.
- `getVariantGroup` returns all members of a group.
- `setTrafficSplit` updates pcts correctly.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
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
    subEls: JSON.parse(JSON.stringify(orig.subEls)),
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
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "feat(quiz): add createVariant/getVariantGroup/setTrafficSplit"
```

### Task 1.9: Quiz factories

**Files:** `src/lib/quiz-defaults.ts`, `src/lib/quiz-defaults.test.ts`

- [ ] **Step 1: Failing tests**

Cover `buildDefaultQuiz()` returns start + step + exit + two edges, and `buildDefaultSettings()` has `progressBar: true`.

- [ ] **Step 2: Implement**

```ts
// src/lib/quiz-defaults.ts
import type { QuizData, QuizSettings } from "@/types/quiz";
import { newId } from "./quiz-graph";

export function buildDefaultQuiz(): QuizData {
  const startId = newId("start");
  const stepId = newId("step");
  const exitId = newId("exit");
  const e1 = newId("edge");
  const e2 = newId("edge");
  return {
    id: `quiz_${Date.now().toString(36)}`,
    nodes: {
      [startId]: { id: startId, kind: "start", size: { width: 180, height: 80 }, position: { x: 0, y: 200 } },
      [stepId]: {
        id: stepId,
        kind: "step",
        name: "First Question",
        size: { width: 280, height: 360 },
        position: { x: 300, y: 100 },
        rotation: 0,
        subEls: [],
      },
      [exitId]: {
        id: exitId,
        kind: "exit",
        name: "Exit",
        size: { width: 180, height: 80 },
        position: { x: 700, y: 200 },
        redirectUrl: "",
      },
    },
    edges: {
      [e1]: { id: e1, from: startId, to: stepId, condition: { kind: "default" } },
      [e2]: { id: e2, from: stepId, to: exitId, condition: { kind: "default" } },
    },
    camera: { x: 0, y: 0, z: 1 },
  };
}

export function buildDefaultSettings(): QuizSettings {
  return {
    brandColors: {
      background: "#FFFFFF",
      textPrimary: "#1A1A1A",
      textSecondary: "#6B7280",
      primaryBrand: "#2563EB",
      optionBackground: "#F9FAFB",
    },
    fontSettings: { enabled: false, fontFamily: "Inter" },
    progressBar: true,
    stepProgressCount: false,
    backNavigation: true,
    metadata: { title: "Quiz", description: "" },
    providers: {},
    redirectUrl: "",
  };
}
```

- [ ] **Step 3: Run tests — expect PASS**

- [ ] **Step 4: Commit**

```bash
git add src/lib/quiz-defaults.ts src/lib/quiz-defaults.test.ts
git commit -m "feat(quiz): add buildDefaultQuiz and buildDefaultSettings"
```

---

## Chunk 2: API routes + list page

### Task 2.1: POST/GET `/api/quiz`

**Files:** `src/app/api/quiz/route.ts`

- [ ] **Step 1: Write it**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { buildDefaultQuiz, buildDefaultSettings } from "@/lib/quiz-defaults";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { workspace_id: string; market: "se" | "dk" | "no"; name: string };
  const { workspace_id, market, name } = body;
  if (!workspace_id || !market || !name) {
    return NextResponse.json({ error: "workspace_id, market, name required" }, { status: 400 });
  }
  const baseSlug =
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "quiz";
  const slug = `${baseSlug}-${Date.now().toString(36).slice(-4)}`;
  const db = createServerSupabase();
  const { data, error } = await db
    .from("quizzes")
    .insert({
      workspace_id,
      market,
      slug,
      name,
      status: "draft",
      data: buildDefaultQuiz(),
      settings: buildDefaultSettings(),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function GET(req: NextRequest) {
  const workspace_id = req.nextUrl.searchParams.get("workspace_id");
  const market = req.nextUrl.searchParams.get("market");
  const db = createServerSupabase();
  let query = db
    .from("quizzes")
    .select("*")
    .neq("status", "archived")
    .order("updated_at", { ascending: false });
  if (workspace_id) query = query.eq("workspace_id", workspace_id);
  if (market) query = query.eq("market", market);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
```

- [ ] **Step 2: Smoke-test**

Start `npm run dev`. Create a quiz with a real workspace id (from memory: `6a18a542-...` for hydro13, `c40221e2-...` for happysleep):

```bash
curl -X POST http://localhost:3000/api/quiz \
  -H "Content-Type: application/json" \
  -d '{"workspace_id":"6a18a542-...","market":"se","name":"Test"}'
```

Expect row with `data` populated. Clean up after:

```bash
curl -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_..." \
  -H "Content-Type: application/json" \
  -d '{"query": "delete from quizzes where name = '\''Test'\'';"}'
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/quiz/route.ts
git commit -m "feat(quiz): add POST/GET /api/quiz"
```

### Task 2.2: GET/PATCH/DELETE `/api/quiz/[id]`

**Files:** `src/app/api/quiz/[id]/route.ts`

- [ ] **Step 1: Write it**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = createServerSupabase();
  const { data, error } = await db.from("quizzes").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const allowed = ["name", "slug", "data", "settings", "status"] as const;
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) patch[k] = body[k];
  patch.updated_at = new Date().toISOString();
  const db = createServerSupabase();
  const { data, error } = await db.from("quizzes").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = createServerSupabase();
  const { error } = await db
    .from("quizzes")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/api/quiz/[id]/route.ts"
git commit -m "feat(quiz): add GET/PATCH/DELETE /api/quiz/[id]"
```

### Task 2.3: POST `/api/quiz/[id]/duplicate`

**Files:** `src/app/api/quiz/[id]/duplicate/route.ts`

- [ ] **Step 1: Write it** — copies the row, appends `-copy-<ts>` to slug, clears `published_*`, status `draft`.

- [ ] **Step 2: Commit**

```bash
git add "src/app/api/quiz/[id]/duplicate/route.ts"
git commit -m "feat(quiz): add POST /api/quiz/[id]/duplicate"
```

### Task 2.4: Quizzes list page

**Files:** `src/app/quizzes/page.tsx`, `src/app/quizzes/page.client.tsx`

- [ ] **Step 1: Server component**

Fetches rows for the workspace cookie (`ch-workspace`), passes to client. `export const dynamic = "force-dynamic"`. Refer to how existing pages read the workspace cookie — look at `src/app/pages/page.tsx` (or whichever existing list page reads it) for the pattern before writing this.

- [ ] **Step 2: Client component**

Grid of quiz tiles with market badge, status pill, name, updated date. Three create buttons (SE/DK/NO) that POST to `/api/quiz` and router.push to the editor. Duplicate + Archive buttons per tile.

- [ ] **Step 3: Build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/quizzes/
git commit -m "feat(quiz): add /quizzes list page"
```

### Task 2.5: Add Quizzes link to main sidebar

**Files:** `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Inspect the file for its nav-item pattern**

```bash
grep -n 'href=' src/components/layout/Sidebar.tsx | head -20
```

- [ ] **Step 2: Insert a new nav item** between Pages and Ads, using `ListChecks` from lucide-react, `href="/quizzes"`. Match the existing styling.

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add src/components/layout/Sidebar.tsx
git commit -m "feat(quiz): add Quizzes sidebar link"
```

---

## Chunk 3: Editor shell + context

### Task 3.1: QuizContext with debounced autosave

**Files:** `src/components/quiz-builder/QuizContext.tsx`

- [ ] **Step 1: Write it**

Ref shape from spec:

- `data`, `settings`, `selectedNodeId`, `saveState` (`idle|dirty|saving|saved|error`)
- `setData(next | updater)`, `setSettings`, `setName`, `setSelectedNodeId`
- Debounce saves with `setTimeout` 800ms; ref holds latest payload so the save sends the current state even if multiple setters fire in sequence.

Full implementation (already written in spec, reuse):

```tsx
"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { QuizData, QuizRow, QuizSettings } from "@/types/quiz";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
export type QuizContextValue = {
  quiz: QuizRow;
  data: QuizData;
  settings: QuizSettings;
  selectedNodeId: string | null;
  saveState: SaveState;
  setData: (next: QuizData | ((prev: QuizData) => QuizData)) => void;
  setSettings: (next: QuizSettings | ((prev: QuizSettings) => QuizSettings)) => void;
  setName: (name: string) => void;
  setSelectedNodeId: (id: string | null) => void;
};

const Ctx = createContext<QuizContextValue | null>(null);
export function useQuiz() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useQuiz used outside QuizProvider");
  return v;
}

export function QuizProvider({
  initialQuiz,
  children,
}: {
  initialQuiz: QuizRow;
  children: React.ReactNode;
}) {
  const [quiz, setQuiz] = useState<QuizRow>(initialQuiz);
  const [data, setDataState] = useState<QuizData>(initialQuiz.data);
  const [settings, setSettingsState] = useState<QuizSettings>(initialQuiz.settings);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{ data: QuizData; settings: QuizSettings; name: string }>({
    data: initialQuiz.data,
    settings: initialQuiz.settings,
    name: initialQuiz.name,
  });

  const save = useCallback(async () => {
    setSaveState("saving");
    const res = await fetch(`/api/quiz/${initialQuiz.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(latest.current),
    });
    if (res.ok) {
      const updated = (await res.json()) as QuizRow;
      setQuiz(updated);
      setSaveState("saved");
    } else {
      setSaveState("error");
    }
  }, [initialQuiz.id]);

  const scheduleSave = useCallback(() => {
    setSaveState("dirty");
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = setTimeout(() => void save(), 800);
  }, [save]);

  const setData = useCallback(
    (next: QuizData | ((prev: QuizData) => QuizData)) => {
      setDataState((prev) => {
        const updated = typeof next === "function" ? (next as (p: QuizData) => QuizData)(prev) : next;
        latest.current = { ...latest.current, data: updated };
        scheduleSave();
        return updated;
      });
    },
    [scheduleSave],
  );

  const setSettings = useCallback(
    (next: QuizSettings | ((prev: QuizSettings) => QuizSettings)) => {
      setSettingsState((prev) => {
        const updated = typeof next === "function" ? (next as (p: QuizSettings) => QuizSettings)(prev) : next;
        latest.current = { ...latest.current, settings: updated };
        scheduleSave();
        return updated;
      });
    },
    [scheduleSave],
  );

  const setName = useCallback(
    (name: string) => {
      setQuiz((prev) => ({ ...prev, name }));
      latest.current = { ...latest.current, name };
      scheduleSave();
    },
    [scheduleSave],
  );

  useEffect(() => () => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
  }, []);

  const value = useMemo<QuizContextValue>(
    () => ({ quiz, data, settings, selectedNodeId, saveState, setData, setSettings, setName, setSelectedNodeId }),
    [quiz, data, settings, selectedNodeId, saveState, setData, setSettings, setName],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 2: Commit after task 3.3**

### Task 3.2: Editor server wrapper

**Files:** `src/app/quizzes/[id]/edit/page.tsx`

- [ ] **Step 1: Write it**

```tsx
import { createServerSupabase } from "@/lib/supabase-admin";
import { notFound } from "next/navigation";
import { QuizEditorClient } from "./QuizEditorClient";

export const dynamic = "force-dynamic";

export default async function QuizEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createServerSupabase();
  const { data, error } = await db.from("quizzes").select("*").eq("id", id).single();
  if (error || !data) notFound();
  return <QuizEditorClient initialQuiz={data} />;
}
```

### Task 3.3: Editor client shell + top bar

**Files:**
- `src/app/quizzes/[id]/edit/QuizEditorClient.tsx`
- `src/components/quiz-builder/QuizShell.tsx`
- `src/components/quiz-builder/QuizTopBar.tsx`

- [ ] **Step 1: Client mounts provider + shell**

```tsx
// QuizEditorClient.tsx
"use client";
import { QuizProvider } from "@/components/quiz-builder/QuizContext";
import { QuizShell } from "@/components/quiz-builder/QuizShell";
import type { QuizRow } from "@/types/quiz";

export function QuizEditorClient({ initialQuiz }: { initialQuiz: QuizRow }) {
  return (
    <QuizProvider initialQuiz={initialQuiz}>
      <QuizShell />
    </QuizProvider>
  );
}
```

- [ ] **Step 2: QuizShell 3-column placeholder**

```tsx
// QuizShell.tsx
"use client";
import { QuizTopBar } from "./QuizTopBar";

export function QuizShell() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
      <QuizTopBar />
      <div className="flex-1 flex min-h-0">
        <aside className="w-64 border-r border-gray-200 bg-white overflow-y-auto">
          <div className="p-4 text-sm text-gray-500">Steps tree (task 4.3)</div>
        </aside>
        <main className="flex-1 overflow-hidden bg-gray-100">
          <div className="h-full flex items-center justify-center text-gray-400">Canvas (task 4.1)</div>
        </main>
        <aside className="w-96 border-l border-gray-200 bg-white overflow-y-auto">
          <div className="p-4 text-sm text-gray-500">Step editor (chunk 5)</div>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: QuizTopBar with name input + save indicator**

```tsx
// QuizTopBar.tsx
"use client";
import Link from "next/link";
import { ArrowLeft, Check, AlertCircle } from "lucide-react";
import { useQuiz } from "./QuizContext";

export function QuizTopBar() {
  const { quiz, saveState, setName } = useQuiz();
  return (
    <div className="h-14 border-b border-gray-200 bg-white px-4 flex items-center gap-4">
      <Link href="/quizzes" className="p-1.5 hover:bg-gray-100 rounded" aria-label="Back">
        <ArrowLeft size={18} />
      </Link>
      <input
        value={quiz.name}
        onChange={(e) => setName(e.target.value)}
        className="font-medium text-lg bg-transparent border-0 outline-0 focus:bg-gray-50 rounded px-2 py-1"
      />
      <div className="flex-1" />
      {saveState === "saving" || saveState === "dirty" ? (
        <span className="text-xs text-gray-500">Saving...</span>
      ) : saveState === "saved" ? (
        <span className="text-xs text-green-600 flex items-center gap-1"><Check size={12}/> Saved</span>
      ) : saveState === "error" ? (
        <span className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12}/> Error</span>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Build + manual verify**

```bash
npm run build
npm run dev
```

Create a quiz from the list, click edit. Expect three-column overlay, name editable, "Saved" appears after typing.

- [ ] **Step 5: Commit**

```bash
git add src/app/quizzes src/components/quiz-builder
git commit -m "feat(quiz): add editor shell, context with autosave, top bar"
```

---

## Chunk 4: Logic canvas

### Task 4.1: Canvas + node renderers

**Files:**
- `src/components/quiz-builder/LogicCanvas.tsx`
- `src/components/quiz-builder/nodes/StartNode.tsx`
- `src/components/quiz-builder/nodes/StepNode.tsx`
- `src/components/quiz-builder/nodes/ExitNode.tsx`

- [ ] **Step 1: Node renderers**

StartNode (pill card, green). ExitNode (pill card, orange, shows redirect URL truncated). StepNode (white card, 280w, shows step name + first title preview + first 4 option labels; badge "A/B" when `variantGroupId` set).

Each node has `<Handle type="source" />` and/or `<Handle type="target" />` from `@xyflow/react` so edges can originate/terminate.

For StepNode title/HTML preview, use **plain text extraction** (don't inject HTML into the canvas): strip tags with a small helper like `text.replace(/<[^>]*>/g, "")`. The canvas preview only needs the first 40 characters.

- [ ] **Step 2: LogicCanvas**

```tsx
"use client";
import { useCallback, useMemo } from "react";
import {
  Background, Controls, MiniMap, ReactFlow, ReactFlowProvider,
  type Connection, type Edge, type Node, type NodeChange, applyNodeChanges,
} from "@xyflow/react";
import { useQuiz } from "./QuizContext";
import { StartNode } from "./nodes/StartNode";
import { StepNode } from "./nodes/StepNode";
import { ExitNode } from "./nodes/ExitNode";
import { connectNodes } from "@/lib/quiz-graph";

const nodeTypes = { start: StartNode, step: StepNode, exit: ExitNode };

function Inner() {
  const { data, setData, setSelectedNodeId } = useQuiz();
  const rfNodes: Node[] = useMemo(
    () => Object.values(data.nodes).map((n) => ({
      id: n.id,
      type: n.kind,
      position: n.position,
      data: { node: n },
    })),
    [data.nodes],
  );
  const rfEdges: Edge[] = useMemo(
    () => Object.values(data.edges).map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      label: e.condition?.kind === "option" ? `opt:${e.condition.optionId.slice(-4)}` : undefined,
    })),
    [data.edges],
  );
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const updated = applyNodeChanges(changes, rfNodes);
    setData((prev) => {
      const nodes = { ...prev.nodes };
      for (const n of updated) {
        const existing = nodes[n.id];
        if (existing) nodes[n.id] = { ...existing, position: n.position };
      }
      return { ...prev, nodes };
    });
  }, [rfNodes, setData]);
  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target) return;
    setData((prev) => connectNodes(prev, { from: c.source!, to: c.target! }));
  }, [setData]);
  return (
    <ReactFlow
      nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes}
      onNodesChange={onNodesChange} onConnect={onConnect}
      onNodeClick={(_, n) => setSelectedNodeId(n.id)}
      fitView
    >
      <Background />
      <Controls />
      <MiniMap pannable zoomable />
    </ReactFlow>
  );
}

export function LogicCanvas() {
  return <ReactFlowProvider><Inner /></ReactFlowProvider>;
}
```

- [ ] **Step 3: Wire into QuizShell** — replace center placeholder with `<LogicCanvas />`.

- [ ] **Step 4: Build + manual check**

Expect: three default nodes render, edges connect them, dragging a node persists, zoom/pan works.

- [ ] **Step 5: Commit**

```bash
git add src/components/quiz-builder/LogicCanvas.tsx src/components/quiz-builder/nodes src/components/quiz-builder/QuizShell.tsx
git commit -m "feat(quiz): logic canvas with start/step/exit nodes"
```

### Task 4.2: Add step button + keyboard delete

**Files:** `src/components/quiz-builder/LogicCanvas.tsx`

- [ ] **Step 1: Floating "+ Add step" button**

Bottom-center of canvas. Click drops a new step at `{selectedNode.position.x + 320, selectedNode.position.y}` using `addStepNode`, then auto-connects selected → new via `connectNodes`. If no selection, places at `{400, 200}`.

- [ ] **Step 2: Backspace/Delete key**

Effect listening for `keydown` on the canvas container: if key is Backspace or Delete and `selectedNodeId` points to a step, call `removeNode`. Never delete start/exit nodes.

- [ ] **Step 3: Manual check** — add 3 steps, delete one. Autosave should fire each time.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "feat(quiz): add step creation + keyboard delete"
```

### Task 4.3: Steps tree left sidebar

**Files:** `src/components/quiz-builder/StepsTree.tsx`, `src/components/quiz-builder/QuizShell.tsx`

- [ ] **Step 1: Tree component**

Renders `topoOrderSteps(data)`. Click selects node. Shows `A/B` badge when `variantGroupId` set.

- [ ] **Step 2: Wire into QuizShell** — replace left placeholder.

- [ ] **Step 3: Manual check** — expect steps listed, clicking selects the node on canvas and opens the right panel in later chunks.

- [ ] **Step 4: Commit**

```bash
git add src/components/quiz-builder/StepsTree.tsx src/components/quiz-builder/QuizShell.tsx
git commit -m "feat(quiz): add Steps tree sidebar"
```

---

## Chunk 5: Step editor (Page Builder integration)

### Task 5.1: SubEl ↔ HTML round-trip serializer (TDD)

**Files:** `src/lib/quiz-subel-html.ts`, `src/lib/quiz-subel-html.test.ts`

The Page Builder edits HTML in-place. We serialize `SubEl[]` to HTML with marker attributes (`data-quiz-el`, `data-quiz-el-id`, and kind-specific markers), mount in the builder, and on edit parse back to `SubEl[]`. The serializer MUST round-trip losslessly for all kinds.

- [ ] **Step 1: Failing tests**

Write one test per SubEl kind that constructs a `SubEl`, calls `subElsToHtml([el])`, then `htmlToSubEls(htmlString)`, and deep-equals the result. Plus one combined multi-element test.

Use jsdom (vitest env already set). Use `new DOMParser().parseFromString(...)`.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

`subElsToHtml(subEls)` wraps each `SubEl` in a matching tag:

| Kind          | Tag   | Markers                                                                 |
|---------------|-------|-------------------------------------------------------------------------|
| `title`       | h1    | `data-quiz-el="title" data-quiz-el-id="..."`                           |
| `text`        | div   | `data-quiz-el="text" data-quiz-el-id="..."`                            |
| `image`       | img   | `data-quiz-el="image" data-quiz-el-id="..." src alt`                   |
| `question`    | div   | `data-quiz-el="question" data-quiz-el-id=... data-quiz-options='<JSON>' data-quiz-kindof data-quiz-layout`, plus `<button>` per option with `data-quiz-opt-id` and label text |
| `custom_html` | div   | `data-quiz-el="custom_html" data-quiz-el-id="..."`                     |
| `loading`     | div   | `data-quiz-el="loading" data-quiz-el-id="..." data-quiz-seconds data-quiz-style` |

HTML escape `data-quiz-options` JSON: `JSON.stringify(options).replace(/'/g, "&#39;")`.

`htmlToSubEls(html)`:
1. `const doc = new DOMParser().parseFromString(\`<div>${html}</div>\`, "text/html")` — wrap so stray text nodes are preserved.
2. Iterate top-level children of the wrapper div's only child (or rebuild the wrapper if using `body`).
3. For each element read `data-quiz-el`, branch on kind, read markers, reconstruct the `SubEl`.
4. If `data-quiz-el` is missing, skip (or wrap in `custom_html` with its outerHTML — decide once and keep consistent with the test suite).

- [ ] **Step 4: Run tests — expect PASS for all kinds + round-trip**

- [ ] **Step 5: Commit**

```bash
git add src/lib/quiz-subel-html.ts src/lib/quiz-subel-html.test.ts
git commit -m "feat(quiz): subEl <-> HTML round-trip serializer"
```

### Task 5.2: StepEditor — render serialized HTML + basic palette

**Files:** `src/components/quiz-builder/StepEditor.tsx`, `src/components/quiz-builder/ElementPalette.tsx`, `src/lib/quiz-graph.ts` (add `addSubEl`), `src/lib/quiz-graph.test.ts`

- [ ] **Step 1: Add `addSubEl` helper (TDD)**

Failing test appending a `title` subEl with default text; implement with the `AddSubElInput` union similar to elsewhere in spec. Returns a new quiz with the element appended to the step's `subEls`.

- [ ] **Step 2: ElementPalette**

Buttons: Title, Text, Question, Image, Custom HTML, Loading. Each calls `setData((prev) => addSubEl(prev, selectedNodeId, { kind }))`.

- [ ] **Step 3: StepEditor skeleton (not yet Page Builder-integrated)**

Renders the selected step's subEls using a **native React tree**, not HTML injection. For now:

- Title: `<h3>` with the `.text` value shown as plain text (strip tags via `.replace(/<[^>]*>/g, "")`)
- Text: `<p>` with plain-text preview
- Image: `<img>`
- Question: list of buttons with each `option.label`
- Custom HTML: a gray box saying `"<custom HTML>"`
- Loading: a gray box saying `"loading for Ns"`

This is a visual stand-in; editing will be delegated to the Page Builder in task 5.3.

Below the preview, render `<ElementPalette />`.

- [ ] **Step 4: Wire into QuizShell** — replace right placeholder.

- [ ] **Step 5: Build + manual check**

Select the default step, click Title → header appears with default text. Refresh → persists.

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "feat(quiz): add StepEditor preview + element palette"
```

### Task 5.3: Embed Page Builder for in-place editing

**Files:** `src/components/quiz-builder/StepEditor.tsx`, possibly small refactor in `src/components/builder/`

This is the largest integration in the plan. The Page Builder at `src/components/builder/BuilderShell.tsx` is ~2500 lines of `BuilderContext` that currently assumes a full `pages` row. We reuse it by passing our serialized HTML as the initial content.

- [ ] **Step 1: Read `BuilderShell.tsx` and `BuilderContext.tsx`**

Goal: identify what inputs it requires. Look for:
- Where initial HTML is read
- Where saves are dispatched (what callback/effect writes back)
- Whether it requires a `pageId` for autosave or can run in "in-memory" mode

Write a short note in the commit msg summarizing which props/hooks are entry points.

- [ ] **Step 2: Pick the integration strategy based on that reading**

Two options, pick the lighter one after reading:

**a) If BuilderShell is general enough**: pass `initialHtml={serialized}` and `onSave={(html) => ...}` props. If these don't exist yet, add them as optional props that take precedence over the pageId-based flow.

**b) If BuilderShell is too coupled to `pages`**: extract the inner edit loop (Canvas + DesignTab + ConfigTab + AITab + LeftSidebar) into a new `src/components/builder/InlineBuilder.tsx` that accepts `initialHtml` and `onHtmlChange`. Leave `BuilderShell` untouched; it keeps using `InlineBuilder` plus its page-specific glue.

Either way, the public surface seen by `StepEditor` is:

```tsx
<InlineBuilder
  key={selectedNodeId}
  initialHtml={subElsToHtml(node.subEls)}
  onHtmlChange={(html) => {
    const newSubEls = htmlToSubEls(html);
    setData((prev) => updateStepSubEls(prev, selectedNodeId, newSubEls));
  }}
/>
```

- [ ] **Step 3: Add `updateStepSubEls` helper with a small test**

```ts
export function updateStepSubEls(q: QuizData, stepId: string, subEls: SubEl[]): QuizData {
  const node = q.nodes[stepId];
  if (!node || node.kind !== "step") return q;
  return { ...q, nodes: { ...q.nodes, [stepId]: { ...node, subEls } } };
}
```

- [ ] **Step 4: Replace StepEditor preview with `<InlineBuilder>`**

Key the component on `selectedNodeId` so switching steps remounts the builder with fresh HTML.

Debounce `onHtmlChange` (300ms) to avoid re-parsing on every keystroke; the outer autosave adds another 800ms.

- [ ] **Step 5: Build + manual check**

Select a step, add a Title via palette. The title should now be editable with the builder's rich text. Bold a word, change color, save. Refresh the page - style survives.

Known friction: the Page Builder's countdown/image-replace/etc. features work against HTML attributes that our serializer doesn't understand yet. Keep `custom_html` as a fallback: any element the serializer doesn't recognize gets wrapped as `custom_html` so the builder can still edit it. Update the tests from task 5.1 to assert this fallback.

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "feat(quiz): embed Page Builder in StepEditor with round-trip"
```

---

## Chunk 6: A/B variants in the editor

### Task 6.1: Branch button on StepNode toolbar

**Files:** `src/components/quiz-builder/nodes/StepNode.tsx`

- [ ] **Step 1: Render a floating toolbar above the selected step**

When `selectedNodeId === node.id`, show a small toolbar with icons: Edit (no-op, just the indicator), Duplicate (calls a new `duplicateStep` helper — same node minus `variantGroupId`), Delete, Branch (calls `createVariant`).

Add the two missing helpers via TDD in `quiz-graph.ts`:

```ts
export function duplicateStep(q: QuizData, stepId: string): QuizData { /* deep-copy node, new ids, offset position */ }
```

- [ ] **Step 2: Manual check** — click Branch on a step, expect a sibling node below with the "A/B" badge on both.

- [ ] **Step 3: Commit**

```bash
git add -u
git commit -m "feat(quiz): step toolbar with Branch (A/B variant)"
```

### Task 6.2: VariantControls popover (traffic slider + promote/delete)

**Files:** `src/components/quiz-builder/VariantControls.tsx`, `src/components/quiz-builder/nodes/StepNode.tsx`, `src/lib/quiz-graph.ts`, `src/lib/quiz-graph.test.ts`

- [ ] **Step 1: TDD `promoteVariant` + `deleteVariant`**

Cover:
- `promoteVariant(q, winnerId)` removes other nodes in the group and clears `variantGroupId` + `trafficPct` on the winner.
- `deleteVariant(q, variantId)` with exactly 2 members clears the group on the remaining node.
- `deleteVariant` with 3+ members just removes the variant.

Implement per the spec earlier in this plan.

- [ ] **Step 2: Popover component**

Clicking the "A/B" badge on a node opens a popover listing all group members. Per row: input number 0-100 (trafficPct), Promote button, Delete button.

Sliders auto-rebalance: when user sets one to N, the others split (100 - N) proportionally to their previous values.

Calls `setTrafficSplit`, `promoteVariant`, `deleteVariant` via `setData`.

- [ ] **Step 3: Manual check**

Create 3 variants, set 50/30/20, promote the 50. Expect the other two removed, badge gone.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "feat(quiz): variant popover with traffic split and promote/delete"
```

---

## Verification pass

### Task V.1: Full check

- [ ] **Step 1: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 new errors.

- [ ] **Step 2: Tests**

```bash
npm run test
```

Expected: all pass.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: clean build.

### Task V.2: End-to-end manual flow

- [ ] **Step 1: Dev server up**

```bash
npm run dev
```

- [ ] **Step 2: Exercise the editor**

At `http://localhost:3000/quizzes` with Hydro13 workspace selected:

1. Create a quiz via "+ SE"
2. Rename it in the top bar
3. Add 2 more steps via "+ Add step"
4. Connect START → step1 → step2 → step3 → EXIT
5. On step 2, add Title + Question via the palette
6. Edit the title text via the builder (bold a word)
7. On step 1, click Branch - variant appears
8. Click the A/B badge, adjust split 70/30
9. Promote the larger variant
10. Refresh the page - all state persists
11. Go to `/quizzes` - the quiz's updated `name` and `updated_at` show on its tile

If all 11 work, the editor MVP is done. Commit a closing journal entry if you keep one.

- [ ] **Step 3: Stop dev server** (Ctrl-C in that terminal)

---

## What's next (separate plans)

Write and execute these plans in order once this Editor MVP is verified:

1. **`2026-04-23-quiz-runtime-and-publishing.md`** — Preact runtime bundle, HTML shell generator, `publishQuiz` extension to `cloudflare-pages.ts`, events API stub, publish to halsobladet.com/quiz/test.
2. **`2026-04-23-quiz-analytics.md`** — `quiz_sessions` + `quiz_events` tables, event ingestion, Supabase RPC aggregates, `/quizzes/[id]/analytics` page, canvas overlay, Meta Pixel + Klaviyo wiring.
3. **`2026-04-23-quiz-swiper.md`** — Clarflow fast-path (read `window.__CLARFLOW_DATA__`), generic Playwright scraper, image re-hosting, `/quizzes/swipe` page.
4. **`2026-04-23-quiz-hydro13-migration.md`** — Swipe existing Hydro13 v2 from Clarflow, touch up, publish SE/DK/NO, flip Meta ads to the new URL, monitor.
