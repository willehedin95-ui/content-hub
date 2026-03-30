/**
 * Lightweight cron run tracker. Records start/complete/error for each cron job
 * so the UI can show "Last sync: 2h ago" or "Sync failed".
 */

import { createServerSupabase } from "@/lib/supabase-admin";

export async function startCronRun(cronName: string, workspaceId?: string): Promise<string> {
  const db = createServerSupabase();
  const { data } = await db
    .from("cron_runs")
    .insert({ cron_name: cronName, status: "running", workspace_id: workspaceId ?? null })
    .select("id")
    .single();
  return data?.id ?? "";
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
