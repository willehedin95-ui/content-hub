import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  // Default to 30 days when the param is missing/0/garbage - "days=0" used to
  // mean "the entire table with no limit", which only gets slower forever.
  const daysRaw = parseInt(searchParams.get("days") || "", 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 365) : 30;

  const db = createServerSupabase();

  const since = new Date();
  since.setDate(since.getDate() - days);

  const MAX_ROWS = 5000;
  const { data: logs, error } = await db
    .from("usage_logs")
    .select("*, pages(name)")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    return safeError(error, "Failed to fetch usage logs");
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
    // True when the row cap was hit - the summary is then computed on a
    // partial window and the UI should say so.
    truncated: (logs ?? []).length >= MAX_ROWS,
    summary: {
      total_cost_usd: totalCostUsd,
      translation_count: translationCount,
      image_count: imageCount,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
    },
  });
}
