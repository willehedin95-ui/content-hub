/**
 * Shared slug helper - single source of truth for slug generation.
 *
 * Transliterates Scandinavian characters (å/ä→a, ö/ø→o, æ→ae) BEFORE the
 * catch-all replacement so they don't get collapsed into hyphens. This is
 * the same behavior as the pages-POST auto-slug path; translations-PUT and
 * the duplicate route previously accepted raw slugs which produced broken
 * live URLs (audit 2026-07-07, P2 LP).
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/[éèêë]/g, "e")
    .replace(/[üû]/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
