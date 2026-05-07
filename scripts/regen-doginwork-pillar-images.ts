/**
 * One-off: generate images for the live doginwork pillar article using the
 * new puppy-aware Haiku prompt.
 *
 * Run: ANTHROPIC_API_KEY=sk-ant-... npx --yes -p dotenv-cli@7 dotenv \
 *      -e .env.local -- npx tsx scripts/regen-doginwork-pillar-images.ts
 */
import { createServerSupabase } from "../src/lib/supabase-admin";
import { generateBlogImagesAndRepublish } from "../src/lib/blog-autopilot";

const SLUG = "valps-vanligaste-beteendeproblem";
const WORKSPACE_ID = "0150243c-c33c-40d9-a780-dc41291d18f9";
const LANGUAGE = "sv";

async function main() {
  const db = createServerSupabase();

  // Get the published translation + plan row to reconstruct the imageJob shape
  const { data: trans } = await db
    .from("translations")
    .select("id, slug, seo_title, translated_html, page_id")
    .eq("slug", SLUG)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!trans) throw new Error("Published translation not found");

  const { data: plan } = await db
    .from("blog_content_plan")
    .select("primary_keyword, content_brief, category, product_slug")
    .eq("workspace_id", WORKSPACE_ID)
    .eq("language", LANGUAGE)
    .eq("slug", SLUG)
    .single();

  if (!plan) throw new Error("Content plan row not found");

  console.log(`Triggering image generation for ${SLUG}...`);
  await generateBlogImagesAndRepublish({
    translationId: trans.id as string,
    pageId: trans.page_id as string,
    articleTitle: trans.seo_title as string,
    primaryKeyword: plan.primary_keyword as string,
    contentBrief: plan.content_brief as string,
    category: plan.category as string,
    articleHtml: trans.translated_html as string,
    slug: trans.slug as string,
    language: LANGUAGE,
    workspaceId: WORKSPACE_ID,
    productSlug: plan.product_slug as string,
  });
  console.log("Done.");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
