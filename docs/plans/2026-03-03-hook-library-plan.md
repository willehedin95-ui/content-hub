# Hook Library Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a curated hook/headline bank that feeds proven hooks into brainstorm prompts, enables quick headline AB test variations in the page editor, and supports manual collection via hub UI + Telegram.

**Architecture:** New `hook_library` Supabase table as central store. Hooks flow in from 3 sources (auto from approved concepts, Telegram bot, hub UI). Hooks flow out to 2 consumers (brainstorm prompt injection, page editor "generate variation"). All AI generation uses existing Claude/OpenAI integrations.

**Tech Stack:** Next.js App Router, Supabase (PostgREST), Tailwind CSS, Anthropic Claude SDK, Vitest

---

### Task 1: Database Table

**Files:**
- Create: `supabase/schema/hook_library.sql`

**Step 1: Create schema file**

```sql
-- Hook Library — curated hooks and headlines for AI inspiration + AB test variations
CREATE TABLE hook_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hook_text TEXT NOT NULL,
  hook_type TEXT NOT NULL DEFAULT 'hook'
    CHECK (hook_type IN ('hook', 'headline', 'native_headline')),
  product TEXT CHECK (product IS NULL OR product IN ('happysleep', 'hydro13')),
  awareness_level TEXT,
  angle TEXT,
  tags TEXT[] DEFAULT '{}',
  source TEXT NOT NULL CHECK (source IN ('manual', 'telegram', 'concept_auto', 'spy_ad')),
  source_concept_id UUID REFERENCES pipeline_concepts(id) ON DELETE SET NULL,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (status IN ('unreviewed', 'approved', 'archived')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_hook_library_product ON hook_library(product);
CREATE INDEX idx_hook_library_status ON hook_library(status);
CREATE UNIQUE INDEX idx_hook_library_dedup ON hook_library(hook_text, COALESCE(product, '__universal__'));
```

**Step 2: Run migration via Supabase Management API**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "<SQL from step 1>"}'
```

Expected: `200 OK` with empty result.

**Step 3: Verify table exists**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '\''hook_library'\'' ORDER BY ordinal_position"}'
```

Expected: JSON listing all columns.

**Step 4: Commit**

```bash
git add supabase/schema/hook_library.sql
git commit -m "feat: add hook_library table schema"
```

---

### Task 2: TypeScript Types

**Files:**
- Modify: `src/types/index.ts` (add after `CashDna` interface ~line 198)

**Step 1: Add HookLibrary type**

Add after the `CashDna` interface (around line 198):

```typescript
// --- Hook Library Types ---

export type HookType = "hook" | "headline" | "native_headline";
export type HookSource = "manual" | "telegram" | "concept_auto" | "spy_ad";
export type HookStatus = "unreviewed" | "approved" | "archived";

export interface HookLibraryEntry {
  id: string;
  hook_text: string;
  hook_type: HookType;
  product: Product | null;
  awareness_level: AwarenessLevel | null;
  angle: Angle | null;
  tags: string[];
  source: HookSource;
  source_concept_id: string | null;
  source_url: string | null;
  status: HookStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
```

**Step 2: Verify build**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No new errors.

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add HookLibraryEntry type"
```

---

### Task 3: CRUD API Routes

**Files:**
- Create: `src/app/api/hooks/route.ts`

**Step 1: Write test for hook creation**

Create `src/lib/__tests__/hooks-api.test.ts`:

```typescript
import { describe, test, expect } from "vitest";

describe("hook library validation", () => {
  test("valid hook types are accepted", () => {
    const validTypes = ["hook", "headline", "native_headline"];
    validTypes.forEach(t => {
      expect(["hook", "headline", "native_headline"].includes(t)).toBe(true);
    });
  });

  test("valid sources are accepted", () => {
    const validSources = ["manual", "telegram", "concept_auto", "spy_ad"];
    validSources.forEach(s => {
      expect(["manual", "telegram", "concept_auto", "spy_ad"].includes(s)).toBe(true);
    });
  });

  test("valid statuses are accepted", () => {
    const validStatuses = ["unreviewed", "approved", "archived"];
    validStatuses.forEach(s => {
      expect(["unreviewed", "approved", "archived"].includes(s)).toBe(true);
    });
  });
});
```

**Step 2: Run test to verify it passes**

```bash
npx vitest run src/lib/__tests__/hooks-api.test.ts
```

Expected: PASS

**Step 3: Create GET + POST route**

Create `src/app/api/hooks/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

// GET /api/hooks — list hooks with filters
export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const url = new URL(req.url);
  const product = url.searchParams.get("product"); // "happysleep" | "hydro13" | "universal"
  const status = url.searchParams.get("status");
  const hookType = url.searchParams.get("hook_type");
  const awareness = url.searchParams.get("awareness_level");
  const source = url.searchParams.get("source");

  let query = db.from("hook_library").select("*").order("created_at", { ascending: false });

  if (product === "universal") {
    query = query.is("product", null);
  } else if (product) {
    query = query.eq("product", product);
  }
  if (status) query = query.eq("status", status);
  if (hookType) query = query.eq("hook_type", hookType);
  if (awareness) query = query.eq("awareness_level", awareness);
  if (source) query = query.eq("source", source);

  const { data, error } = await query.limit(200);

  if (error) return safeError(error, "Failed to fetch hooks");
  return NextResponse.json({ hooks: data });
}

// POST /api/hooks — create a hook
export async function POST(req: NextRequest) {
  const db = createServerSupabase();
  const body = await req.json();

  const { hook_text, hook_type, product, awareness_level, angle, tags, source, source_url, notes } = body;

  if (!hook_text?.trim()) {
    return NextResponse.json({ error: "hook_text is required" }, { status: 400 });
  }

  const { data, error } = await db
    .from("hook_library")
    .insert({
      hook_text: hook_text.trim(),
      hook_type: hook_type || "hook",
      product: product || null,
      awareness_level: awareness_level || null,
      angle: angle || null,
      tags: tags || [],
      source: source || "manual",
      source_url: source_url || null,
      notes: notes || null,
      status: source === "concept_auto" ? "unreviewed" : "approved",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "This hook already exists for this product" }, { status: 409 });
    }
    return safeError(error, "Failed to create hook");
  }

  return NextResponse.json(data, { status: 201 });
}
```

**Step 4: Create PATCH + DELETE route**

Create `src/app/api/hooks/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

// PATCH /api/hooks/[id] — update a hook
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();
  const body = await req.json();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const allowed = ["hook_text", "hook_type", "product", "awareness_level", "angle", "tags", "status", "notes"];
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await db
    .from("hook_library")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return safeError(error, "Failed to update hook");
  return NextResponse.json(data);
}

// DELETE /api/hooks/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  const { error } = await db.from("hook_library").delete().eq("id", id);
  if (error) return safeError(error, "Failed to delete hook");
  return NextResponse.json({ success: true });
}
```

**Step 5: Create bulk action route**

Create `src/app/api/hooks/bulk/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

// POST /api/hooks/bulk — bulk approve/archive
export async function POST(req: NextRequest) {
  const db = createServerSupabase();
  const { ids, action } = await req.json();

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }
  if (!["approve", "archive"].includes(action)) {
    return NextResponse.json({ error: "action must be 'approve' or 'archive'" }, { status: 400 });
  }

  const status = action === "approve" ? "approved" : "archived";
  const { error } = await db
    .from("hook_library")
    .update({ status, updated_at: new Date().toISOString() })
    .in("id", ids);

  if (error) return safeError(error, "Bulk update failed");
  return NextResponse.json({ success: true, updated: ids.length });
}
```

**Step 6: Commit**

```bash
git add src/app/api/hooks/ src/lib/__tests__/hooks-api.test.ts
git commit -m "feat: add hook library CRUD API routes"
```

---

### Task 4: Hook Bank UI Page

**Files:**
- Create: `src/app/hooks/page.tsx`

**Step 1: Create the hook bank page**

Create `src/app/hooks/page.tsx` — a client component with:

- Quick-add form at top (text input, product select, type select, "Add" button)
- Filter chips row (product, type, status, awareness level, source)
- Hook list as cards with: hook text, chips (product, type, source, awareness), status badge
- Per-card actions: Approve (if unreviewed), Archive, Edit (inline), Delete
- Bulk select + bulk approve/archive bar
- Use `useState` for filters, `useEffect` + fetch for data loading
- Follows existing page patterns (e.g. `/saved-ads`, `/images`)

Key UI details:
- Status colors: unreviewed=amber, approved=emerald, archived=gray
- Source colors: manual=blue, telegram=purple, concept_auto=indigo, spy_ad=orange
- Product: happysleep=sky, hydro13=emerald, universal=gray
- Filter "All" option resets that filter
- Empty state: "No hooks yet. Add your first hook above or send one via Telegram."

**Step 2: Add to sidebar**

Modify `src/components/layout/Sidebar.tsx`:
- Line 6: Add `Library` to the lucide-react import
- Line 51: Add `{ href: "/hooks", label: "Hook Bank", icon: Library }` after Saved Ads in the Ads group

**Step 3: Verify dev server**

```bash
npm run dev
```

Navigate to `/hooks`. Verify page loads, add a hook manually, filters work.

**Step 4: Commit**

```bash
git add src/app/hooks/page.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: add hook bank UI page with sidebar nav"
```

---

### Task 5: Auto-Population from Approved Concepts

**Files:**
- Modify: `src/app/api/pipeline/concepts/[id]/approve/route.ts` (~line 66, after concept update)

**Step 1: Add hook extraction logic**

After the concept status update succeeds (after line 66), add:

```typescript
// Auto-populate hook library from approved concept
const cashDna = typedConcept.cash_dna as { hooks?: string[]; awareness_level?: string; angle?: string } | null;
const hooks = cashDna?.hooks || [];
const headlines = typedConcept.ad_copy_headline || [];

const hookRows = [
  ...hooks.map(h => ({
    hook_text: h.trim(),
    hook_type: "hook" as const,
    product: typedConcept.product,
    awareness_level: cashDna?.awareness_level || null,
    angle: cashDna?.angle || null,
    source: "concept_auto" as const,
    source_concept_id: typedConcept.id,
    status: "unreviewed" as const,
  })),
  ...headlines.map(h => ({
    hook_text: h.trim(),
    hook_type: "headline" as const,
    product: typedConcept.product,
    awareness_level: cashDna?.awareness_level || null,
    angle: cashDna?.angle || null,
    source: "concept_auto" as const,
    source_concept_id: typedConcept.id,
    status: "unreviewed" as const,
  })),
];

if (hookRows.length > 0) {
  // upsert with ON CONFLICT DO NOTHING to skip duplicates
  await supabase.from("hook_library").upsert(hookRows, { onConflict: "hook_text,product", ignoreDuplicates: true });
}
```

Note: The `onConflict` string for the unique index uses the composite. Since Supabase JS `upsert` doesn't support `COALESCE` in onConflict natively, we use `ignoreDuplicates: true` which maps to `ON CONFLICT DO NOTHING` — the unique index `idx_hook_library_dedup` handles dedup at DB level.

**Step 2: Verify by approving a concept in the UI**

Navigate to `/pipeline`, find a pending concept, approve it. Then check `/hooks` — new hooks should appear with status "unreviewed".

**Step 3: Commit**

```bash
git add src/app/api/pipeline/concepts/[id]/approve/route.ts
git commit -m "feat: auto-populate hook library on concept approval"
```

---

### Task 6: Telegram Hook Collection

**Files:**
- Modify: `src/app/api/telegram/webhook/route.ts` (~line 267, the "No URL and no photo" fallback)

**Step 1: Replace the fallback handler**

Replace lines 267-272 (the "No URL and no photo" section) with:

```typescript
// --- Plain text (no URL, no photo) → Save as hook ---
const plainText = (message.text || "").trim();
if (plainText.length > 0 && plainText.length <= 500) {
  // Save hook with product TBD
  const { data: hook, error: hookErr } = await db
    .from("hook_library")
    .insert({
      hook_text: plainText,
      hook_type: "hook",
      source: "telegram",
      status: "approved",
      telegram_message_id: messageId,
    })
    .select()
    .single();

  if (hookErr) {
    // Duplicate check
    if (hookErr.code === "23505") {
      await sendMessage(chatId, "This hook is already in your bank!");
      return NextResponse.json({ ok: true });
    }
    console.error("[Telegram] Hook insert failed:", hookErr);
    await sendMessage(chatId, "Failed to save hook. Try again.");
    return NextResponse.json({ ok: true });
  }

  // Ask for product tagging
  await sendMessageWithInlineKeyboard(
    chatId,
    `💡 Saved to hook bank!\n\n"${plainText.slice(0, 100)}${plainText.length > 100 ? "…" : ""}"\n\nWhich product?`,
    [
      [
        { text: "🛏 HappySleep", callback_data: `hook_product:${hook.id}:happysleep` },
        { text: "💧 Hydro13", callback_data: `hook_product:${hook.id}:hydro13` },
        { text: "🌐 Universal", callback_data: `hook_product:${hook.id}:universal` },
      ],
    ]
  );
  return NextResponse.json({ ok: true });
}

// --- Truly empty or too long ---
await sendMessage(
  chatId,
  "Send me a screenshot of an ad, a URL, or a hook/headline to save."
);
return NextResponse.json({ ok: true });
```

**Step 2: Add callback handler for product selection**

In `handleCallbackQuery()` (around line 300), add a new `else if` branch before the final `else`:

```typescript
} else if (data.startsWith("hook_product:")) {
  const parts = data.split(":");
  const hookId = parts[1];
  const product = parts[2] === "universal" ? null : parts[2];

  await answerCallbackQuery(query.id, "Product set!");

  const db = createServerSupabase();
  await db.from("hook_library").update({ product }).eq("id", hookId);

  const productLabel = parts[2] === "universal" ? "Universal" : parts[2] === "happysleep" ? "HappySleep" : "Hydro13";
  await editMessageText(chatId, messageId, `💡 Hook saved → ${productLabel}\n\nView: ${process.env.NEXT_PUBLIC_APP_URL || "https://content-hub-nine-theta.vercel.app"}/hooks`);
```

**Step 3: Test via Telegram**

Send a plain text message to the bot (not a URL). Verify:
1. Bot replies with product selection keyboard
2. Tapping a product updates the hook and confirms
3. Hook appears on `/hooks` page

**Step 4: Commit**

```bash
git add src/app/api/telegram/webhook/route.ts
git commit -m "feat: telegram bot saves plain text as hooks with product tagging"
```

---

### Task 7: Brainstorm Prompt Injection

**Files:**
- Modify: `src/lib/brainstorm.ts`

**Step 1: Add hook library query helper**

Add a new function near `buildProductContext()` (around line 426):

```typescript
async function buildHookInspiration(product: string): Promise<string> {
  const { createServerSupabase } = await import("@/lib/supabase");
  const db = createServerSupabase();

  const { data: hooks } = await db
    .from("hook_library")
    .select("hook_text, hook_type, awareness_level, angle")
    .eq("status", "approved")
    .or(`product.eq.${product},product.is.null`)
    .order("created_at", { ascending: false })
    .limit(25);

  if (!hooks || hooks.length === 0) return "";

  const productHooks = hooks.filter(h => h.hook_type === "hook");
  const productHeadlines = hooks.filter(h => h.hook_type === "headline");

  const lines: string[] = [
    "\n---\n",
    "## PROVEN HOOKS — USE AS INSPIRATION (DO NOT COPY)",
    "These hooks and headlines have been curated from winning concepts. Study the TONE, PATTERN, and EMOTIONAL TRIGGERS — then create ORIGINAL hooks that are equally compelling but completely different in content.\n",
  ];

  if (productHooks.length > 0) {
    lines.push("### Hooks (scroll-stopping openers):");
    productHooks.slice(0, 15).forEach(h => {
      const meta = [h.awareness_level, h.angle].filter(Boolean).join(" / ");
      lines.push(`- "${h.hook_text}"${meta ? ` (${meta})` : ""}`);
    });
    lines.push("");
  }

  if (productHeadlines.length > 0) {
    lines.push("### Headlines (short, benefit-focused):");
    productHeadlines.slice(0, 10).forEach(h => {
      lines.push(`- "${h.hook_text}"`);
    });
    lines.push("");
  }

  return lines.join("\n");
}
```

**Step 2: Inject into system prompts**

The `buildFromScratchSystem()` function and siblings all follow the same pattern — they call `buildProductContext()` and then append `OUTPUT_INSTRUCTIONS`. We need to inject hooks between those two.

The simplest approach: modify `buildProductContext()` to accept an optional `hookInspiration` string parameter and append it. This way all brainstorm modes get hooks automatically.

At the end of `buildProductContext()` (line 425, before `return`), add:

```typescript
// hookInspiration is passed in from the caller
```

Actually, cleaner approach: modify each `build*System()` function to accept and inject the hook string. Since they all share the same pattern, add a `hookInspiration` parameter to `buildProductContext`:

Change the function signature (line 381):

```typescript
function buildProductContext(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[],
  hookInspiration?: string
): string {
```

And at the end before the return (line 425):

```typescript
  if (hookInspiration) {
    parts.push(hookInspiration);
  }

  return parts.join("\n\n");
```

**Step 3: Call buildHookInspiration in the brainstorm API route**

Find the API route that calls the brainstorm functions. It needs to call `buildHookInspiration(product)` and pass the result through. Look at `src/app/api/brainstorm/route.ts` or wherever the brainstorm is triggered — the hook inspiration string should be fetched once and passed to whichever `build*System()` function is used.

The key change: wherever `buildProductContext()` is called, pass the hook inspiration as the last argument.

**Step 4: Verify by running a brainstorm**

Navigate to `/brainstorm`, generate concepts. Check the API logs — the system prompt should now include the "PROVEN HOOKS" section (if any approved hooks exist in the DB).

**Step 5: Commit**

```bash
git add src/lib/brainstorm.ts src/app/api/brainstorm/route.ts
git commit -m "feat: inject approved hooks into brainstorm prompts as inspiration"
```

---

### Task 8: Generate Variation API

**Files:**
- Create: `src/app/api/hooks/generate-variation/route.ts`

**Step 1: Create the generate-variation endpoint**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { text, language, product, mode } = await req.json();

  if (!text?.trim() || !language) {
    return NextResponse.json({ error: "text and language required" }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  let systemPrompt: string;
  let userPrompt: string;

  if (mode === "hook_inspired") {
    // Fetch approved hooks for inspiration
    const db = createServerSupabase();
    const { data: hooks } = await db
      .from("hook_library")
      .select("hook_text, hook_type, awareness_level, angle")
      .eq("status", "approved")
      .or(product ? `product.eq.${product},product.is.null` : "product.is.null")
      .order("created_at", { ascending: false })
      .limit(20);

    const hookList = (hooks || []).map(h => `- "${h.hook_text}"`).join("\n");

    systemPrompt = `You are a senior direct-response copywriter for Scandinavian health & wellness ecommerce. You create scroll-stopping headlines and hooks.

Your task: Generate a COMPLETELY DIFFERENT headline inspired by the proven hooks below. Do NOT rewrite the original — create something with a different angle, emotional trigger, or pattern entirely.

Output the headline directly in ${language} (not English). No explanation, just the headline text.

## Proven hooks for inspiration:
${hookList || "(No hooks in bank yet — use your best creative judgment)"}`;

    userPrompt = `Current headline (in ${language}): "${text}"

Generate a completely different headline — different angle, different emotional trigger. Output in ${language} only.`;
  } else {
    // Rewrite mode — same meaning, different words
    systemPrompt = `You are a senior native ${language} copywriter for Scandinavian health & wellness ecommerce.

Your task: Rewrite the given headline with different words and phrasing while preserving the core meaning and emotional impact. Make it sound natural and compelling in ${language}.

Output the rewritten headline only. No explanation.`;

    userPrompt = `Rewrite this headline (keep same meaning, change the words): "${text}"`;
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const variation = (response.content[0] as { type: "text"; text: string }).text.trim();

    // Strip surrounding quotes if present
    const clean = variation.replace(/^["']|["']$/g, "");

    return NextResponse.json({ variation: clean });
  } catch (err) {
    return safeError(err, "Failed to generate variation");
  }
}
```

**Step 2: Test via curl**

```bash
curl -X POST http://localhost:3000/api/hooks/generate-variation \
  -H "Content-Type: application/json" \
  -d '{"text": "Søvnproblemer efter 40?", "language": "da", "product": "happysleep", "mode": "rewrite"}'
```

Expected: JSON with `{ "variation": "..." }` in Danish.

**Step 3: Commit**

```bash
git add src/app/api/hooks/generate-variation/route.ts
git commit -m "feat: add generate-variation API for headline rewrites and hook-inspired variations"
```

---

### Task 9: Page Editor "Generate Variation" Button

**Files:**
- Modify: `src/app/pages/[id]/edit/[language]/EditPageClient.tsx`

**Step 1: Add state and handler**

Near the top of the component (around line 92, with the other state declarations), add:

```typescript
const [generatingVariation, setGeneratingVariation] = useState(false);
const [variationMode, setVariationMode] = useState<"rewrite" | "hook_inspired" | null>(null);
```

Add a handler function (near the other handlers, ~line 280):

```typescript
async function handleGenerateVariation(mode: "rewrite" | "hook_inspired") {
  const el = selectedElRef.current;
  if (!el) return;
  const originalText = el.textContent?.trim();
  if (!originalText) return;

  setGeneratingVariation(true);
  setVariationMode(null);

  try {
    const res = await fetch("/api/hooks/generate-variation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: originalText,
        language: isSource ? "en" : language.code,
        product: product,
        mode,
      }),
    });
    const data = await res.json();
    if (data.variation && el) {
      el.textContent = data.variation;
      markDirty();
    }
  } catch (err) {
    console.error("Variation generation failed:", err);
  } finally {
    setGeneratingVariation(false);
  }
}
```

**Step 2: Add UI button in element controls panel**

In the element controls section (`hasSelectedEl` block, around line 1326, just before the "Hide Element" button), add:

```tsx
{/* Generate Variation */}
<div className="relative">
  <button
    onClick={() => setVariationMode(variationMode ? null : "rewrite")}
    disabled={generatingVariation}
    className="w-full flex items-center justify-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded-md border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
  >
    {generatingVariation ? (
      <><Loader2 className="w-3 h-3 animate-spin" /> Generating…</>
    ) : (
      <><Sparkles className="w-3 h-3" /> Generate Variation</>
    )}
  </button>
  {variationMode !== null && !generatingVariation && (
    <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
      <button
        onClick={() => handleGenerateVariation("rewrite")}
        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium text-gray-900">Rewrite</span>
        <p className="text-gray-500 mt-0.5">Same meaning, different words</p>
      </button>
      <div className="border-t border-gray-100" />
      <button
        onClick={() => handleGenerateVariation("hook_inspired")}
        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium text-gray-900">Hook bank inspired</span>
        <p className="text-gray-500 mt-0.5">Different angle from proven hooks</p>
      </button>
    </div>
  )}
</div>
```

Add `Sparkles` to the lucide-react import at the top of the file.

**Step 3: Close popover on outside click**

Add an effect to close the variation popover when clicking outside:

```typescript
useEffect(() => {
  if (variationMode === null) return;
  const handler = () => setVariationMode(null);
  document.addEventListener("click", handler);
  return () => document.removeEventListener("click", handler);
}, [variationMode]);
```

**Step 4: Test in the page editor**

1. Open any page translation in the editor
2. Click on a headline text element
3. In the right sidebar, "Generate Variation" button should appear
4. Click it → popover with Rewrite / Hook bank inspired
5. Click Rewrite → headline should change, autosave triggers

**Step 5: Commit**

```bash
git add src/app/pages/[id]/edit/[language]/EditPageClient.tsx
git commit -m "feat: add Generate Variation button to page editor for headline AB testing"
```

---

### Task 10: Final Integration Test & Polish

**Step 1: End-to-end smoke test**

Verify all 5 features work together:

1. **Hook Bank UI**: Navigate to `/hooks`, add a hook manually. Verify it appears with status "approved".
2. **Auto-populate**: Approve a concept in `/pipeline`. Check `/hooks` — new hooks appear as "unreviewed".
3. **Bulk actions**: Select the unreviewed hooks, bulk approve them.
4. **Brainstorm injection**: Run a brainstorm from `/brainstorm`. Verify the AI output references or was influenced by the hook bank (check API request payload if possible).
5. **Page editor variation**: Open a translated page, select a headline, click Generate Variation → Rewrite. Then try Hook bank inspired.

**Step 2: Telegram test** (if bot is deployed)

Send a plain text hook to the Telegram bot. Verify product selection keyboard appears and hook is saved.

**Step 3: Final commit**

Any remaining polish fixes.

```bash
git add -A
git commit -m "chore: polish hook library integration"
```
