import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "0", 10);

  const db = createServerSupabase();

  let query = db
    .from("usage_logs")
    .select("*, pages(name)")
    .order("created_at", { ascending: false });

  if (days > 0) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    query = query.gte("created_at", since.toISOString());
  }

  const { data: logs, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Compute summary
  let totalCostUsd = 0;
  let translationCount = 0;
  let imageCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const log of logs || []) {
    totalCostUsd += Number(log.cost_usd);
    totalInputTokens += log.input_tokens;
    totalOutputTokens += log.output_tokens;
    if (log.type === "translation") translationCount++;
    if (log.type === "image_generation") imageCount++;
  }

  return NextResponse.json({
    logs: logs || [],
    summary: {
      total_cost_usd: totalCostUsd,
      translation_count: translationCount,
      image_count: imageCount,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
    },
  });
}
