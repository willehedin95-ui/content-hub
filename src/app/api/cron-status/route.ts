import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";

/**
 * GET /api/cron-status
 * Returns the most recent run for each key cron job.
 */
export async function GET() {
  const db = createServerSupabase();

  const cronNames = ["autopilot-execute", "pipeline-push", "ad-performance-sync"];

  const results: Record<string, { status: string; completed_at: string | null; result_summary: string | null; error_message: string | null }> = {};

  for (const name of cronNames) {
    const { data } = await db
      .from("cron_runs")
      .select("status, completed_at, result_summary, error_message")
      .eq("cron_name", name)
      .order("started_at", { ascending: false })
      .limit(1)
      .single();

    if (data) {
      results[name] = data;
    }
  }

  return NextResponse.json(results);
}
