import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "@/lib/constants";
import type { CashDna, ProductSegment } from "@/types";

export const maxDuration = 60;

export interface IterationSuggestion {
  id: string; // client-generated for selection
  iteration_type: "segment_swap" | "mechanism_swap" | "cash_swap";
  title: string; // Short label e.g. "Fresh hook: 'Your pillow is the problem'"
  rationale: string; // Why this iteration (2-3 sentences)
  // Type-specific params (ready to POST to /iterate)
  params: {
    segment_id?: string;
    new_mechanism?: string;
    swap_element?: "hook" | "style" | "angle";
    new_value?: string;
  };
}

// POST /api/image-jobs/[id]/suggest-iterations
// Claude analyzes the concept's CASH DNA and suggests 2-3 ready-to-execute iterations
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const performanceContext = body.performance_context as string | undefined;
  const market = body.market as string | undefined;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const db = createServerSupabase();

  // Fetch concept with full CASH DNA
  const { data: job, error: jobErr } = await db
    .from("image_jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (jobErr || !job) {
    return safeError(jobErr ?? new Error("Not found"), "Concept not found", 404);
  }

  const cashDna = job.cash_dna as CashDna | null;
  if (!cashDna) {
    return NextResponse.json(
      { error: "This concept has no CASH DNA — cannot suggest iterations" },
      { status: 400 }
    );
  }

  // Fetch segments for the product (needed for segment_swap suggestions)
  const segments: ProductSegment[] = [];
  if (job.product) {
    const { data: segs } = await db
      .from("product_segments")
      .select("*")
      .eq("product_id", job.product);
    if (segs) segments.push(...(segs as ProductSegment[]));
  }

  // Build the prompt
  const system = `You are a senior performance marketer and creative strategist. Your job is to analyze a winning/fatiguing ad concept and suggest the BEST iteration strategies to refresh it while keeping the proven core.

You understand the C.A.S.H. framework deeply:
- Concept types: avatar_facts, market_facts, product_facts, psychology_toolkit
- Angles: Story, Contrarian, Expert Crossover, Root Cause, Accidental Discovery, Tribal, Conspiracy, Geographic, New Science, Symptom Reframe, Worldview, Case Study, Before/After, Comparison, Social Proof, Educational, Fear-Based, Aspirational, Curiosity, Problem-Agitate
- Styles: Product Shot, Lifestyle, UGC-style, Infographic, Before/After, Testimonial, Meme, Screenshot, Text Overlay, Collage, Comparison
- Awareness levels: Unaware, Problem Aware, Solution Aware, Product Aware, Most Aware

You know that iteration means KEEPING what works and changing ONE dimension strategically.

Return ONLY valid JSON. No markdown fences. No commentary.`;

  const segmentList = segments.length > 0
    ? segments.map((s) => `- ${s.name}: ${s.description ?? ""} (${s.demographics ?? ""})`).join("\n")
    : "No segments defined for this product.";

  const user = `## CONCEPT TO ITERATE: "${job.name}" (#${job.concept_number ?? "?"})

### CASH DNA
- Concept type: ${cashDna.concept_type ?? "unknown"}
- Angle: ${cashDna.angle ?? "unknown"}
- Style: ${cashDna.style ?? "unknown"}
- Awareness level: ${cashDna.awareness_level ?? "unknown"}
- Hooks: ${(cashDna.hooks ?? []).join(" | ") || "none"}
- Description: ${cashDna.concept_description ?? "none"}

### Current Ad Copy
Primary: ${(job.ad_copy_primary ?? []).slice(0, 2).join("\n---\n") || "none"}
Headlines: ${(job.ad_copy_headline ?? []).join(" | ") || "none"}

### Visual Direction
${job.visual_direction ?? "none"}

${performanceContext ? `### Performance Context\n${performanceContext}\n` : ""}${market ? `### Target Market\nThis iteration is specifically for the ${market} market. Tailor suggestions to this market's audience.\n\n` : ""}### Available Segments for Segment Swap
${segmentList}

---

Suggest exactly 3 iteration ideas. For each, choose the BEST iteration type and provide specific, ready-to-execute parameters.

Rules:
- Each suggestion must be a DIFFERENT approach (don't suggest 3 hook swaps)
- Suggestions should range from safe (small change, likely to maintain performance) to bold (bigger swing, higher potential upside)
- For hook swaps: Write the COMPLETE new hook text (scroll-stopping, 1-2 sentences)
- For angle swaps: Name the specific angle from the framework
- For mechanism swaps: Describe the specific new mechanism (2-3 sentences)
- For segment swaps: Use one of the available segment IDs listed above${segments.length === 0 ? "\n- Skip segment_swap since no segments are defined" : ""}
- The "title" should be SHORT (max 60 chars) and instantly convey what changes
- The "rationale" explains WHY this iteration has high potential (2-3 sentences)

Return JSON array:
[
  {
    "iteration_type": "cash_swap",
    "title": "Fresh hook: 'Your pillow is the problem'",
    "rationale": "The current hook has been running long enough to fatigue. This new hook reframes the problem from a different entry point while keeping the same angle and proof structure.",
    "params": {
      "swap_element": "hook",
      "new_value": "Your pillow is the problem — and it's costing you 2 hours of deep sleep every night."
    }
  },
  ...
]`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      temperature: 0.8,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    });

    const content =
      response.content[0]?.type === "text"
        ? response.content[0].text.trim()
        : "";

    if (!content) {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    // Parse JSON — strip markdown fences if present
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) {
      return NextResponse.json({ error: "AI returned invalid format" }, { status: 500 });
    }

    // Validate and enrich suggestions with client-side IDs
    const suggestions: IterationSuggestion[] = parsed
      .filter((s: Record<string, unknown>) =>
        s.iteration_type && s.title && s.rationale && s.params
      )
      .map((s: Record<string, unknown>, i: number) => ({
        id: `suggestion_${i}`,
        iteration_type: s.iteration_type as IterationSuggestion["iteration_type"],
        title: String(s.title).slice(0, 80),
        rationale: String(s.rationale),
        params: s.params as IterationSuggestion["params"],
      }));

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("[suggest-iterations] Error:", err);
    return safeError(err instanceof Error ? err : new Error(String(err)), "Failed to generate suggestions");
  }
}
