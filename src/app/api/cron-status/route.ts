import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";

/**
 * GET /api/cron-status
 * Returns the most recent run for each cron scheduled in vercel.json,
 * with a stale flag when the last run is older than 2x the expected
 * interval (audit 2026-07-07, I2). Unscheduled-but-existing cron routes
 * are listed separately as disabled so nobody "monitors" crons that
 * cannot run.
 */

// HARDCODED MIRROR of vercel.json (2026-07-07) - expected max interval in
// hours per scheduled cron. Update together with vercel.json and the
// watchdog table in reconcile-stuck-jobs.
const SCHEDULED_CRONS: Record<string, number> = {
  "invoice-check": 24,
  "gsc-sync": 168,
  "gsc-gap-refresh": 168,
  "blog-link-depth-audit": 168,
  "blog-decay-check": 168,
  "blog-sunset-check": 744,
  "blog-update-low-rank": 168,
  "research-scan": 24,
  "research-themes": 168,
  "deliverability-sync": 24,
  "reconcile-stuck-jobs": 0.5,
  "ad-performance-sync": 12,
  "daily-snapshot": 24,
  "zero-spend-alert": 24,
};

// Cron routes that exist in the codebase but are deliberately NOT scheduled
// (manual trigger only). Blog autopilot + images-retry unscheduled 2026-07-07
// (no auto blog may run or spend); the Meta guards were unscheduled 2026-04-27.
const DISABLED_CRONS = [
  "blog-autopilot",
  "blog-images-retry",
  "autopilot-execute",
  "autopilot-concepts",
  "pipeline-push",
  "auto-pause-bleeders",
  "cleanup-empty-adsets",
  "process-swipe-queue",
];

interface CronRunInfo {
  status: string;
  started_at: string | null;
  completed_at: string | null;
  result_summary: string | null;
  error_message: string | null;
  stale: boolean;
  expected_interval_hours: number;
}

export async function GET() {
  const db = createServerSupabase();
  const now = Date.now();

  const results: Record<string, CronRunInfo | { status: "never_run"; stale: true; expected_interval_hours: number }> = {};

  for (const [name, intervalHours] of Object.entries(SCHEDULED_CRONS)) {
    const { data } = await db
      .from("cron_runs")
      .select("status, started_at, completed_at, result_summary, error_message")
      .eq("cron_name", name)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) {
      results[name] = { status: "never_run", stale: true, expected_interval_hours: intervalHours };
      continue;
    }

    const ageMs = data.started_at ? now - new Date(data.started_at).getTime() : Infinity;
    results[name] = {
      ...data,
      stale: ageMs > intervalHours * 2 * 60 * 60 * 1000,
      expected_interval_hours: intervalHours,
    };
  }

  return NextResponse.json({
    scheduled: results,
    disabled: DISABLED_CRONS,
  });
}
