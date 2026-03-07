import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { script } = body as { script: string };

  if (!script) {
    return NextResponse.json({ error: "script is required" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Fetch job + shots
  const { data: job, error: jobError } = await db
    .from("video_jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (jobError || !job) return safeError(jobError, "Video job not found", 404);

  const { data: shots, error: shotsError } = await db
    .from("video_shots")
    .select("*")
    .eq("video_job_id", id)
    .order("shot_number");

  if (shotsError) return safeError(shotsError, "Failed to fetch shots");

  // Parse script into per-shot dialogues
  // Format: [Shot 1: character]\nDialogue text\n\n[Shot 2: character]\n...
  const shotDialogues = parseScriptDialogues(script);

  // Update each shot's veo_prompt with the new dialogue
  const updated: number[] = [];
  for (const shot of shots || []) {
    const newDialogue = shotDialogues.get(shot.shot_number);
    if (newDialogue !== undefined && shot.veo_prompt) {
      const updatedPrompt = replaceDialogueInVeoPrompt(shot.veo_prompt, newDialogue);
      if (updatedPrompt !== shot.veo_prompt) {
        await db.from("video_shots").update({ veo_prompt: updatedPrompt }).eq("id", shot.id);
        updated.push(shot.shot_number);
      }
    }
  }

  // Save script to job
  await db.from("video_jobs").update({ script, updated_at: new Date().toISOString() }).eq("id", id);

  return NextResponse.json({ ok: true, updated_shots: updated });
}

/**
 * Parse script text into a map of shot_number -> dialogue text
 * Handles format like:
 *   [Shot 1: neck]
 *   Jag är din nacke...
 *
 *   [Shot 2: pillow]
 *   Jag vet att jag...
 */
function parseScriptDialogues(script: string): Map<number, string> {
  const result = new Map<number, string>();
  const shotPattern = /\[Shot\s+(\d+):[^\]]*\]\s*\n/gi;
  const matches = [...script.matchAll(shotPattern)];

  for (let i = 0; i < matches.length; i++) {
    const shotNum = parseInt(matches[i][1], 10);
    const startIdx = matches[i].index! + matches[i][0].length;
    const endIdx = i + 1 < matches.length ? matches[i + 1].index! : script.length;
    const dialogue = script.slice(startIdx, endIdx).trim();
    if (dialogue) {
      result.set(shotNum, dialogue);
    }
  }

  return result;
}

/**
 * Replace the dialogue portion in a VEO prompt.
 * VEO prompts end with: says: "dialogue here"
 * We replace everything after the last `says: "` up to the closing `"`
 */
function replaceDialogueInVeoPrompt(veoPrompt: string, newDialogue: string): string {
  // Match the last occurrence of says: "..."
  const saysPattern = /says:\s*"[^"]*"\s*$/;
  if (saysPattern.test(veoPrompt)) {
    return veoPrompt.replace(saysPattern, `says: "${newDialogue}"`);
  }
  // Fallback: if no says: "..." found, return unchanged
  return veoPrompt;
}
