# A/B Test Creation Modes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a mode selector to the A/B test creation form: "Compare two pages" (existing) vs "Test variation of one page" (duplicates a translation and opens the editor).

**Architecture:** The `translations` table already has a `variant` column, and the page editor already handles `?variant=b`. We add a mode toggle to the creation form, a duplicate endpoint on the API, and modify the POST handler to support variation mode.

**Tech Stack:** Next.js (App Router), React, Supabase, Tailwind CSS, Lucide icons.

---

### Task 1: Add duplicate translation API endpoint

**Files:**
- Create: `src/app/api/translations/[id]/duplicate/route.ts`

**Step 1: Create the duplicate endpoint**

```typescript
// src/app/api/translations/[id]/duplicate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  // Fetch source translation
  const { data: source, error: fetchErr } = await db
    .from("translations")
    .select("page_id, language, translated_html, seo_title, seo_description, slug")
    .eq("id", id)
    .single();

  if (fetchErr || !source) {
    return NextResponse.json({ error: "Translation not found" }, { status: 404 });
  }

  if (!source.translated_html) {
    return NextResponse.json({ error: "Translation has no HTML content" }, { status: 400 });
  }

  // Create duplicate as variant "b"
  const { data: duplicate, error: insertErr } = await db
    .from("translations")
    .insert({
      page_id: source.page_id,
      language: source.language,
      variant: "b",
      translated_html: source.translated_html,
      seo_title: source.seo_title,
      seo_description: source.seo_description,
      slug: source.slug,
      status: "draft",
    })
    .select("id, page_id, language")
    .single();

  if (insertErr || !duplicate) {
    return safeError(insertErr, "Failed to duplicate translation");
  }

  return NextResponse.json(duplicate, { status: 201 });
}
```

**Step 2: Verify the endpoint works**

Run: `npm run build` (or test via dev server manually)
Expected: No build errors

**Step 3: Commit**

```bash
git add src/app/api/translations/[id]/duplicate/route.ts
git commit -m "feat: add POST /api/translations/[id]/duplicate endpoint"
```

---

### Task 2: Modify POST /api/ab-tests to support variation mode

**Files:**
- Modify: `src/app/api/ab-tests/route.ts` (the POST handler)

**Step 1: Update the POST handler**

In `src/app/api/ab-tests/route.ts`, modify the POST function to accept an optional `mode` field. When `mode === "variation"`, `variant_id` is not required — instead we duplicate the control translation and use that as variant B.

Changes to the POST handler:

1. Destructure `mode` from the request body (default `"compare"`)
2. When `mode === "variation"`:
   - Skip `variant_id` requirement
   - Skip the `control_id === variant_id` check
   - After validating the control translation, duplicate it (insert a new row with `variant: "b"`)
   - Use the new duplicate's ID as `variant_id`
3. Return the `variant_translation_id` in the response (so the UI can redirect to the editor)

```typescript
export async function POST(req: NextRequest) {
  const { name, slug, language, control_id, variant_id, split, description, mode } = await req.json();

  const isVariation = mode === "variation";

  // Validate required fields
  if (!name || !slug || !language || !control_id) {
    return NextResponse.json(
      { error: "name, slug, language, and control_id are required" },
      { status: 400 }
    );
  }

  if (!isVariation && !variant_id) {
    return NextResponse.json(
      { error: "variant_id is required for compare mode" },
      { status: 400 }
    );
  }

  if (!isVariation && control_id === variant_id) {
    return NextResponse.json(
      { error: "Variant A and Variant B must be different translations" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();

  // Validate control translation
  const { data: controlT } = await db
    .from("translations")
    .select("id, translated_html, language, page_id, seo_title, seo_description, slug")
    .eq("id", control_id)
    .single();

  if (!controlT) {
    return NextResponse.json({ error: "Control translation not found" }, { status: 404 });
  }
  if (!controlT.translated_html) {
    return NextResponse.json({ error: "Control translation must have HTML content" }, { status: 400 });
  }
  if (controlT.language !== language) {
    return NextResponse.json({ error: "Control translation must match the selected language" }, { status: 400 });
  }

  let finalVariantId = variant_id;

  if (isVariation) {
    // Duplicate control as variant "b"
    const { data: dup, error: dupErr } = await db
      .from("translations")
      .insert({
        page_id: controlT.page_id,
        language: controlT.language,
        variant: "b",
        translated_html: controlT.translated_html,
        seo_title: controlT.seo_title,
        seo_description: controlT.seo_description,
        slug: controlT.slug,
        status: "draft",
      })
      .select("id")
      .single();

    if (dupErr || !dup) {
      return safeError(dupErr, "Failed to duplicate translation");
    }
    finalVariantId = dup.id;
  } else {
    // Validate variant translation (existing compare mode logic)
    const { data: variantT } = await db
      .from("translations")
      .select("id, translated_html, language")
      .eq("id", variant_id)
      .single();

    if (!variantT) {
      return NextResponse.json({ error: "Variant translation not found" }, { status: 404 });
    }
    if (!variantT.translated_html) {
      return NextResponse.json({ error: "Variant translation must have HTML content" }, { status: 400 });
    }
    if (variantT.language !== language) {
      return NextResponse.json({ error: "Variant translation must match the selected language" }, { status: 400 });
    }
  }

  // Check slug uniqueness
  const { data: existing } = await db
    .from("ab_tests")
    .select("id")
    .eq("slug", slug)
    .eq("language", language)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "A test with this slug already exists for this language" },
      { status: 409 }
    );
  }

  // Create the A/B test
  const { data: test, error: tErr } = await db
    .from("ab_tests")
    .insert({
      name,
      slug,
      language,
      description: description || null,
      control_id,
      variant_id: finalVariantId,
      split: split ?? 50,
      status: "draft",
    })
    .select()
    .single();

  if (tErr || !test) {
    return safeError(tErr, "Failed to create A/B test");
  }

  return NextResponse.json({
    ...test,
    // Include info needed for variation mode redirect
    ...(isVariation && {
      variant_translation_id: finalVariantId,
      variant_page_id: controlT.page_id,
      variant_language: controlT.language,
    }),
  }, { status: 201 });
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: No build errors

**Step 3: Commit**

```bash
git add src/app/api/ab-tests/route.ts
git commit -m "feat: support variation mode in POST /api/ab-tests"
```

---

### Task 3: Add mode selector UI to the creation form

**Files:**
- Modify: `src/app/ab-tests/new/NewABTestClient.tsx`

**Step 1: Add mode state and mode selector cards**

Add a `mode` state (`"compare" | "variation"`, default `"compare"`). Render two clickable cards above the form fields:

- **Compare Two Pages** card — icon: `ArrowLeftRight` from lucide. Description: "Test two completely different pages against each other"
- **Test Variation** card — icon: `Copy` from lucide. Description: "Duplicate a page and tweak elements like headline or hero image"

Selected card gets indigo border/bg styling (matching the existing language selector pattern). Unselected gets gray border with hover.

**Step 2: Conditionally render Variant B section**

- When `mode === "compare"`: show both Variant A and Variant B dropdowns (existing behavior)
- When `mode === "variation"`: show only Variant A dropdown. Replace Variant B dropdown with a styled info box: "Variant B will be a copy of Variant A. You'll edit it after creating the test."

**Step 3: Update form validation and submission**

- When `mode === "variation"`:
  - Remove `variantId` from required check (only need `controlId`)
  - Remove `controlId === variantId` check
  - Send `mode: "variation"` in the POST body (no `variant_id`)
  - On success: redirect to `/pages/${data.variant_page_id}/edit/${data.variant_language}?variant=b` instead of the test detail page
- When `mode === "compare"`: existing behavior unchanged
- Update submit button text: "Create Test" for compare, "Create & Edit Variant" for variation

**Step 4: Full updated component**

The key changes to `NewABTestClient.tsx`:

```tsx
import { ArrowLeftRight, Copy } from "lucide-react"; // add to imports

// New state
const [mode, setMode] = useState<"compare" | "variation">("compare");

// Mode selector (render after header, before form fields)
<div className="flex gap-3 mb-8">
  <button
    onClick={() => { setMode("compare"); setVariantId(""); }}
    className={`flex-1 p-4 rounded-xl border-2 text-left transition-all ${
      mode === "compare"
        ? "border-indigo-400 bg-indigo-50"
        : "border-gray-200 bg-white hover:border-gray-300"
    }`}
  >
    <ArrowLeftRight className={`w-5 h-5 mb-2 ${mode === "compare" ? "text-indigo-600" : "text-gray-400"}`} />
    <div className={`text-sm font-semibold ${mode === "compare" ? "text-indigo-900" : "text-gray-700"}`}>
      Compare Two Pages
    </div>
    <div className="text-xs text-gray-500 mt-0.5">
      Test two completely different pages against each other
    </div>
  </button>
  <button
    onClick={() => { setMode("variation"); setVariantId(""); }}
    className={`flex-1 p-4 rounded-xl border-2 text-left transition-all ${
      mode === "variation"
        ? "border-indigo-400 bg-indigo-50"
        : "border-gray-200 bg-white hover:border-gray-300"
    }`}
  >
    <Copy className={`w-5 h-5 mb-2 ${mode === "variation" ? "text-indigo-600" : "text-gray-400"}`} />
    <div className={`text-sm font-semibold ${mode === "variation" ? "text-indigo-900" : "text-gray-700"}`}>
      Test Variation
    </div>
    <div className="text-xs text-gray-500 mt-0.5">
      Duplicate a page and tweak headline, hero image, or other elements
    </div>
  </button>
</div>

// Variant B section — conditional rendering
{mode === "compare" ? (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      Variant B
    </label>
    <select ...existing dropdown... />
  </div>
) : (
  <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
    <p className="text-sm text-gray-600">
      <Copy className="w-4 h-4 inline mr-1.5 text-gray-400" />
      Variant B will be a copy of Variant A. You&apos;ll edit it after creating the test.
    </p>
  </div>
)}

// Updated handleCreate:
async function handleCreate() {
  const isVariation = mode === "variation";

  if (!name.trim() || !slug.trim() || !controlId) {
    setError("Please fill in all required fields");
    return;
  }
  if (!isVariation && !variantId) {
    setError("Please select Variant B");
    return;
  }
  if (!isVariation && controlId === variantId) {
    setError("Variant A and Variant B must be different pages");
    return;
  }

  setLoading(true);
  setError("");

  try {
    const body: Record<string, unknown> = {
      name: name.trim(),
      slug: slug.trim(),
      language,
      control_id: controlId,
      split,
      description: description.trim() || undefined,
    };

    if (isVariation) {
      body.mode = "variation";
    } else {
      body.variant_id = variantId;
    }

    const res = await fetch("/api/ab-tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Failed to create test");
      return;
    }

    if (isVariation && data.variant_page_id) {
      // Redirect to editor for the new duplicate
      router.push(`/pages/${data.variant_page_id}/edit/${data.variant_language}?variant=b`);
    } else {
      router.push(`/ab-tests/${data.id}`);
    }
  } catch {
    setError("Failed to create test");
  } finally {
    setLoading(false);
  }
}

// Updated submit button disabled logic
disabled={loading || !name.trim() || !slug.trim() || !controlId || (mode === "compare" && !variantId)}

// Updated submit button text
{loading ? "Creating..." : mode === "variation" ? "Create & Edit Variant" : "Create Test"}
```

**Step 5: Verify in dev server**

Run: `npm run dev`
Test: Navigate to `/ab-tests/new`, toggle between modes, verify UI changes correctly, create a variation test, confirm redirect to editor.

**Step 6: Commit**

```bash
git add src/app/ab-tests/new/NewABTestClient.tsx
git commit -m "feat: add mode selector to A/B test creation form (compare vs variation)"
```
