import type { createServerSupabase } from "@/lib/supabase-admin";
import { STORAGE_BUCKET } from "@/lib/constants";

type Db = ReturnType<typeof createServerSupabase>;

const LIST_LIMIT = 100;
const MAX_PAGES = 50; // safety cap: 5000 files per prefix

/**
 * Remove ALL files under a storage prefix, paginating until the listing is
 * exhausted. The old inline cleanup used a single .list() call whose default
 * limit (100) silently left orphans behind (audit 2026-07-07, P2 LP storage).
 *
 * Best-effort: logs and returns on storage errors instead of throwing, so
 * row deletion is never blocked by storage hiccups.
 */
export async function removeAllUnderPrefix(db: Db, prefix: string): Promise<number> {
  let removed = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data: files, error } = await db.storage
      .from(STORAGE_BUCKET)
      .list(prefix, { limit: LIST_LIMIT });

    if (error) {
      console.error(`[storage-cleanup] list failed for prefix "${prefix}": ${error.message}`);
      return removed;
    }
    if (!files || files.length === 0) return removed;

    // Skip folder placeholders (id === null) - we only remove real objects.
    const paths = files
      .filter((f) => f.name && (f as { id?: string | null }).id !== null)
      .map((f) => `${prefix}/${f.name}`);

    if (paths.length === 0) return removed;

    const { error: rmError } = await db.storage.from(STORAGE_BUCKET).remove(paths);
    if (rmError) {
      console.error(`[storage-cleanup] remove failed for prefix "${prefix}": ${rmError.message}`);
      return removed;
    }
    removed += paths.length;

    // We delete what we list, so no offset needed - loop until a short page.
    if (files.length < LIST_LIMIT) return removed;
  }
  console.warn(`[storage-cleanup] hit page cap for prefix "${prefix}" - some files may remain`);
  return removed;
}

/**
 * Clean up BOTH storage prefixes a translation writes to:
 *   - `{translationId}/` (single-image translations, uploads)
 *   - `page-images/{translationId}/` (batch page-image translations)
 */
export async function cleanupTranslationStorage(db: Db, translationId: string): Promise<void> {
  await removeAllUnderPrefix(db, translationId);
  await removeAllUnderPrefix(db, `page-images/${translationId}`);
}
