import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Product reference photos for Swipe Image. With no choice the product's hero
 * images are used, as before. The user can pick other photos from the product
 * bank instead - e.g. a pouring shot, because the model copies the reference
 * so closely that a standing packshot gives a label that never turns with a
 * tilted bottle (2026-10-01: 0 of 3 right with the packshot, 3 of 3 with a
 * pouring photo). Ids are checked against the product, so only its own
 * photos can be sent.
 */
export async function resolveSwipeReferences(db: SupabaseClient, productId: string, referenceIds?: unknown): Promise<string[]> {
  const ids = Array.isArray(referenceIds) ? referenceIds.filter((x): x is string => typeof x === "string") : [];
  if (ids.length > 0) {
    const { data } = await db.from("product_images").select("id,url").eq("product_id", productId).in("id", ids);
    const byId = new Map((data ?? []).map((r: { id: string; url: string }) => [r.id, r.url]));
    const urls = ids.map((id) => byId.get(id)).filter((u): u is string => !!u);
    if (urls.length > 0) return urls;
  }
  const { data } = await db.from("product_images").select("url").eq("product_id", productId).eq("category", "hero").order("sort_order", { ascending: true });
  return (data ?? []).map((r: { url: string }) => r.url);
}
