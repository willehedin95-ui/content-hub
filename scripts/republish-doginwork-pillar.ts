/**
 * One-off: republish the doginwork pillar article with current code.
 * Used to apply Horizon-theme hero fix (body-hero retention + CSS hide
 * of placeholder-image blocks) without regenerating the article HTML.
 *
 * Run: ANTHROPIC_API_KEY=... npx -p dotenv-cli@7 dotenv -e .env.local \
 *      -- npx tsx scripts/republish-doginwork-pillar.ts
 */
import { createServerSupabase } from "../src/lib/supabase-admin";
import { publishToShopify } from "../src/lib/shopify-blog-publish";
import type { Language } from "../src/types";

const SLUG = "valps-vanligaste-beteendeproblem";
const WORKSPACE_ID = "0150243c-c33c-40d9-a780-dc41291d18f9";
const LANGUAGE: Language = "sv";

async function main() {
  const db = createServerSupabase();

  const { data: trans } = await db
    .from("translations")
    .select("id, slug, seo_title, seo_description, translated_html, created_at")
    .eq("slug", SLUG)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!trans) throw new Error("Published translation not found");

  // Find any other already-published doginwork articles for internal-link
  // resolvability (probably just this one for now).
  const { data: others } = await db
    .from("translations")
    .select("slug, pages!inner(workspace_id, content_type, blog_category)")
    .eq("language", LANGUAGE)
    .eq("status", "published")
    .eq("pages.content_type", "seo_blog")
    .eq("pages.workspace_id", WORKSPACE_ID);
  const knownSlugs = (others ?? []).map((t) => t.slug as string);
  const blogCategory =
    (others?.[0]?.pages as unknown as { blog_category?: string } | undefined)
      ?.blog_category || "Valpträning";

  console.log(`Republishing ${SLUG}...`);
  const result = await publishToShopify({
    articleHtml: trans.translated_html as string,
    slug: trans.slug as string,
    category: blogCategory,
    seoTitle: trans.seo_title as string,
    seoDescription: trans.seo_description as string,
    language: LANGUAGE,
    workspaceId: WORKSPACE_ID,
    sourceBlogDomain: "doginwork.se",
    createdAt: trans.created_at as string,
    knownSlugs,
  });

  await db
    .from("translations")
    .update({
      published_url: result.url,
      updated_at: new Date().toISOString(),
    })
    .eq("id", trans.id);

  console.log("Republished:", result.url);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
