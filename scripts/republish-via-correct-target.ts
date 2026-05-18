/**
 * Republish a blog article through the publish flow that routes Shopify-target
 * workspaces (e.g. Doginwork, Hydro13) to their Shopify Admin API instead of
 * Cloudflare Pages. Use this to recover articles published to the wrong target
 * (e.g. Doginwork articles that ended up on halsobladet.com because
 * blog_publish_target wasn't set at the time of original publish).
 *
 * Usage:
 *   npx tsx scripts/republish-via-correct-target.ts <translation_id>
 *
 * After republishing it updates translations.published_url with the new URL.
 * The OLD URL on the wrong domain still serves the page (we can't easily
 * delete from CF Pages without redeploying the entire project), but
 * canonical now points to the correct URL and Google will gradually
 * deindex the orphan over weeks.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  let value = trimmed.slice(eqIdx + 1);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = value;
}

async function main() {
  const translationId = process.argv[2];
  if (!translationId) {
    console.error("Usage: npx tsx scripts/republish-via-correct-target.ts <translation_id>");
    process.exit(1);
  }

  const { createServerSupabase } = await import("../src/lib/supabase-admin");
  const { publishBlogArticle } = await import("../src/lib/blog-autopilot");

  const db = createServerSupabase();
  const { data: trans } = await db
    .from("translations")
    .select(
      "id, slug, seo_title, seo_description, translated_html, created_at, language, published_url, pages!inner(id, workspace_id, blog_category, content_type)"
    )
    .eq("id", translationId)
    .single();

  if (!trans) {
    console.error(`Translation ${translationId} not found`);
    process.exit(1);
  }

  const page = trans.pages as unknown as {
    id: string;
    workspace_id: string;
    blog_category: string;
    content_type: string;
  };

  if (page.content_type !== "seo_blog") {
    console.error(`Not a seo_blog translation (content_type=${page.content_type})`);
    process.exit(1);
  }

  if (!trans.translated_html) {
    console.error("Translation has no HTML to publish");
    process.exit(1);
  }

  console.log(`[republish] slug=${trans.slug}`);
  console.log(`[republish] workspace=${page.workspace_id}`);
  console.log(`[republish] category=${page.blog_category}`);
  console.log(`[republish] current URL: ${trans.published_url}`);

  const newUrl = await publishBlogArticle(
    trans.translated_html as string,
    trans.slug as string,
    page.blog_category,
    trans.seo_title as string,
    (trans.seo_description as string) || "",
    trans.language as "sv" | "da" | "no",
    page.workspace_id,
    trans.id as string,
    trans.created_at as string
  );

  console.log(`[republish] New URL: ${newUrl}`);

  if (newUrl !== trans.published_url) {
    await db
      .from("translations")
      .update({
        published_url: newUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", trans.id);
    console.log(`[republish] Updated translations.published_url`);
  } else {
    console.log(`[republish] URL unchanged - already at correct target`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
