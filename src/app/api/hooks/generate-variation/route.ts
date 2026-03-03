import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "@/lib/constants";

export const maxDuration = 30;

// POST /api/hooks/generate-variation — generate a headline rewrite or hook-inspired variation
export async function POST(req: NextRequest) {
  const { text, language, product, mode } = await req.json();

  if (!text?.trim() || !language) {
    return NextResponse.json(
      { error: "text and language required" },
      { status: 400 }
    );
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  let systemPrompt: string;
  let userPrompt: string;

  if (mode === "hook_inspired") {
    const db = createServerSupabase();
    const { data: hooks } = await db
      .from("hook_library")
      .select("hook_text, hook_type, awareness_level, angle")
      .eq("status", "approved")
      .or(product ? `product.eq.${product},product.is.null` : "product.is.null")
      .order("created_at", { ascending: false })
      .limit(20);

    const hookList =
      (hooks || []).map((h) => `- "${h.hook_text}"`).join("\n") ||
      "(No hooks in bank yet)";

    systemPrompt = `You are a senior direct-response copywriter for Scandinavian health & wellness ecommerce. You create scroll-stopping headlines and hooks.

Your task: Generate a COMPLETELY DIFFERENT headline inspired by the proven hooks below. Do NOT rewrite the original — create something with a different angle, emotional trigger, or pattern entirely.

Output the headline directly in ${language} (not English). No explanation, just the headline text.

## Proven hooks for inspiration:
${hookList}`;

    userPrompt = `Current headline (in ${language}): "${text}"

Generate a completely different headline — different angle, different emotional trigger. Output in ${language} only.`;
  } else {
    systemPrompt = `You are a senior native ${language} copywriter for Scandinavian health & wellness ecommerce.

Your task: Rewrite the given headline with different words and phrasing while preserving the core meaning and emotional impact. Make it sound natural and compelling in ${language}.

Output the rewritten headline only. No explanation.`;

    userPrompt = `Rewrite this headline (keep same meaning, change the words): "${text}"`;
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const variation = (
      response.content[0] as { type: "text"; text: string }
    ).text.trim();

    // Strip surrounding quotes if present
    const clean = variation.replace(/^["'""]|["'""]$/g, "");

    return NextResponse.json({ variation: clean });
  } catch (err) {
    return safeError(err, "Failed to generate variation");
  }
}
