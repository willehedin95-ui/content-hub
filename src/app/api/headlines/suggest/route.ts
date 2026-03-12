import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";
import { safeError } from "@/lib/api-error";
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "@/lib/constants";
import { HEADLINE_FORMULAS } from "@/lib/brainstorm";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { text, language, product } = await req.json();

  if (!text?.trim() || !language) {
    return NextResponse.json(
      { error: "text and language required" },
      { status: 400 }
    );
  }

  // Fetch relevant hooks from hook bank
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const { data: hooks } = await db
    .from("hook_library")
    .select("hook_text, awareness_level, angle")
    .eq("status", "approved")
    .eq("workspace_id", workspaceId)
    .or(product ? `product.eq.${product},product.is.null` : "product.is.null")
    .order("created_at", { ascending: false })
    .limit(15);

  const hookList =
    (hooks || []).map((h) => {
      const meta = [h.awareness_level, h.angle].filter(Boolean).join(" / ");
      return `- "${h.hook_text}"${meta ? ` (${meta})` : ""}`;
    }).join("\n") || "(No hooks in bank yet)";

  const systemPrompt = `You are a senior direct-response copywriter for Scandinavian health & wellness ecommerce. You create scroll-stopping headlines using proven formula structures.

${HEADLINE_FORMULAS}

## PROVEN HOOKS FOR INSPIRATION (DO NOT COPY — study patterns only):
${hookList}

## TASK
Generate exactly 6 headline variations for the given headline. Each MUST use a DIFFERENT formula mechanism from the list above. Write all headlines in ${language}.

## OUTPUT FORMAT
Return a JSON array. Each item has "headline" (the text in ${language}) and "mechanism" (which formula mechanism you used, e.g. "Authority Reveal", "Unexpected Cause", "Named Mechanism", etc.).

Return ONLY the JSON array, no markdown fences, no explanation.

Example format:
[{"headline":"...","mechanism":"Authority Reveal"},{"headline":"...","mechanism":"Contrarian"}]`;

  const userPrompt = `Current headline (in ${language}): "${text}"
${product ? `Product: ${product}` : ""}

Generate 6 headline variations using different formula mechanisms. All in ${language}.`;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const raw = (response.content[0] as { type: "text"; text: string }).text.trim();

    // Parse JSON — handle possible markdown fences
    const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    let suggestions: { headline: string; mechanism: string }[];

    try {
      suggestions = JSON.parse(jsonStr);
    } catch {
      // Fallback: try to extract array from the response
      const match = jsonStr.match(/\[[\s\S]*\]/);
      if (match) {
        suggestions = JSON.parse(match[0]);
      } else {
        return NextResponse.json(
          { error: "Failed to parse suggestions" },
          { status: 500 }
        );
      }
    }

    // Clean quotes from headlines
    suggestions = suggestions.map((s) => ({
      headline: s.headline.replace(/^["'""]|["'""]$/g, ""),
      mechanism: s.mechanism,
    }));

    return NextResponse.json({ suggestions });
  } catch (err) {
    return safeError(err, "Failed to generate headline suggestions");
  }
}
