/**
 * Lightweight cron run tracker. Records start/complete/error for each cron job
 * so the UI can show "Last sync: 2h ago" or "Sync failed".
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";

export async function startCronRun(
  cronName: string,
  workspaceId?: string,
  startedAt?: string
): Promise<string> {
  const db = createServerSupabase();
  const { data } = await db
    .from("cron_runs")
    .insert({
      cron_name: cronName,
      status: "running",
      workspace_id: workspaceId ?? null,
      ...(startedAt ? { started_at: startedAt } : {}),
    })
    .select("id")
    .single();
  return data?.id ?? "";
}

/**
 * Wrap a cron route handler with cron_runs logging (audit 2026-07-07, I1).
 *
 * Usage in a route file:
 *   async function handleCron(req: NextRequest) { ...existing handler... }
 *   export const GET = trackedCronRoute("my-cron", handleCron);
 *
 * The cron_runs row is written AFTER the handler finishes (with the real
 * start time preserved via startedAt) so that:
 *   - unauthorized probes (401/403 on the public /api/cron/* paths) never
 *     pollute cron_runs, regardless of the route's own auth scheme
 *     (Bearer CRON_SECRET and/or ?manual=true);
 *   - a row in cron_runs always means "the run actually finished". A hard
 *     platform kill (maxDuration) logs nothing - the dead-man watchdog in
 *     reconcile-stuck-jobs catches that case via "no recent run" instead.
 *
 * Any 4xx/5xx response or thrown error fails the run (failCronRun); the
 * response JSON body is stored as result_summary either way.
 */
export function trackedCronRoute(
  cronName: string,
  handler: (req: NextRequest) => Promise<NextResponse>
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest): Promise<NextResponse> => {
    const startedAt = new Date().toISOString();

    let res: NextResponse;
    try {
      res = await handler(req);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      try {
        const runId = await startCronRun(cronName, undefined, startedAt);
        await failCronRun(runId, msg.slice(0, 1000));
      } catch (trackErr) {
        console.error(`[cron-tracker] Failed to record crash for ${cronName}:`, trackErr);
      }
      throw err;
    }

    if (res.status === 401 || res.status === 403) return res;

    let summary: string | undefined;
    try {
      const body = await res.clone().json();
      summary = JSON.stringify(body).slice(0, 1000);
    } catch {
      // Non-JSON response - no summary
    }

    try {
      const runId = await startCronRun(cronName, undefined, startedAt);
      if (res.status >= 400) {
        await failCronRun(runId, summary ?? `HTTP ${res.status}`);
      } else {
        await completeCronRun(runId, summary);
      }
    } catch (trackErr) {
      // Tracking must never break the cron itself
      console.error(`[cron-tracker] Failed to record run for ${cronName}:`, trackErr);
    }

    return res;
  };
}

export async function completeCronRun(runId: string, summary?: string): Promise<void> {
  if (!runId) return;
  const db = createServerSupabase();
  await db
    .from("cron_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      result_summary: summary ?? null,
    })
    .eq("id", runId);
}

export async function failCronRun(runId: string, error: string): Promise<void> {
  if (!runId) return;
  const db = createServerSupabase();
  await db
    .from("cron_runs")
    .update({
      status: "error",
      completed_at: new Date().toISOString(),
      error_message: error,
    })
    .eq("id", runId);
}
