/**
 * Concept numbers are per-workspace sequential, guarded by the unique partial
 * index image_jobs_workspace_concept_number_uq (workspace_id, concept_number).
 * Concurrent creators (Genesis, brainstorm, autopilot cron) can race the
 * read-max-then-insert pattern, so inserts retry with a re-read number on
 * unique violation instead of failing the whole concept.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const UNIQUE_VIOLATION = "23505";
const MAX_INSERT_ATTEMPTS = 3;

export type InsertedImageJob = { id: string } & Record<string, unknown>;

export async function nextConceptNumber(
  db: SupabaseClient,
  workspaceId: string
): Promise<number> {
  const { data } = await db
    .from("image_jobs")
    .select("concept_number")
    .eq("workspace_id", workspaceId)
    .not("concept_number", "is", null)
    .order("concept_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.concept_number ?? 0) + 1;
}

/**
 * Insert an image_jobs row with the next free concept_number. `row` must not
 * contain concept_number or workspace_id (both are set here). Pass
 * `firstNumber` when the caller already read the max (saves one query).
 */
export async function insertJobWithConceptNumber(
  db: SupabaseClient,
  workspaceId: string,
  row: Record<string, unknown>,
  firstNumber?: number
): Promise<{
  job: InsertedImageJob | null;
  conceptNumber: number;
  error: { code?: string; message?: string } | null;
}> {
  let conceptNumber = firstNumber ?? (await nextConceptNumber(db, workspaceId));
  let lastError: { code?: string; message?: string } | null = null;

  for (let attempt = 1; attempt <= MAX_INSERT_ATTEMPTS; attempt++) {
    const { data, error } = await db
      .from("image_jobs")
      .insert({ ...row, workspace_id: workspaceId, concept_number: conceptNumber })
      .select()
      .single();

    if (!error && data) {
      return { job: data as InsertedImageJob, conceptNumber, error: null };
    }

    lastError = error;
    if (error?.code !== UNIQUE_VIOLATION || attempt === MAX_INSERT_ATTEMPTS) break;

    console.warn(
      `[concept-number] concept_number ${conceptNumber} taken in workspace ${workspaceId}, re-reading (attempt ${attempt}/${MAX_INSERT_ATTEMPTS})`
    );
    conceptNumber = await nextConceptNumber(db, workspaceId);
  }

  return { job: null, conceptNumber, error: lastError };
}
