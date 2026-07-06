/**
 * Version bookkeeping for image_translations.
 *
 * Every path that swaps translated_url outside the normal translate flow
 * (edit-image, qa-image passthrough sync, 9:16 sibling copies) must also
 * write a versions row and repoint active_version_id - otherwise version
 * history lies and a restore resurrects the wrong image (audit P2-2).
 */

import { createServerSupabase } from "@/lib/supabase-admin";

type DB = ReturnType<typeof createServerSupabase>;

/**
 * Record a new active version for an image translation and mark the
 * translation as completed with that URL. Mirrors the version dance in
 * the translate route: next version_number, deactivate old versions,
 * insert active row, update the translation with active_version_id.
 *
 * Returns the new version id, or null if the version insert failed
 * (the translation row is still updated so the URL is never lost).
 */
export async function recordActiveVersion(
  db: DB,
  translationId: string,
  translatedUrl: string,
  opts?: { visualInstructions?: string }
): Promise<string | null> {
  const { data: existingVersions } = await db
    .from("versions")
    .select("version_number")
    .eq("image_translation_id", translationId)
    .order("version_number", { ascending: false })
    .limit(1);

  const nextVersionNumber = (existingVersions?.[0]?.version_number ?? 0) + 1;

  // Deactivate previous versions
  await db
    .from("versions")
    .update({ is_active: false })
    .eq("image_translation_id", translationId);

  // Create new version row
  const { data: version, error: vError } = await db
    .from("versions")
    .insert({
      image_translation_id: translationId,
      version_number: nextVersionNumber,
      translated_url: translatedUrl,
      visual_instructions: opts?.visualInstructions ?? null,
      is_active: true,
    })
    .select("id")
    .single();

  if (vError || !version) {
    console.error(`[versions] Failed to create version for translation ${translationId}:`, vError?.message);
  }

  // Update the translation row (even if the version insert failed - the
  // new image must never be lost just because history bookkeeping broke)
  await db
    .from("image_translations")
    .update({
      status: "completed",
      translated_url: translatedUrl,
      active_version_id: version?.id ?? null,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", translationId);

  return version?.id ?? null;
}
