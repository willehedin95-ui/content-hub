/**
 * Generate images for a blog article that has placeholder images.
 * Usage: npx tsx scripts/gen-blog-images.ts <slug>
 */
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  const value = trimmed.slice(eqIdx + 1);
  if (!process.env[key]) process.env[key] = value;
}

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: npx tsx scripts/gen-blog-images.ts <slug>");
    process.exit(1);
  }

  const { generateBlogImagesAndRepublish } = await import("../src/lib/blog-autopilot");
  const { createServerSupabase } = await import("../src/lib/supabase-admin");

  const db = createServerSupabase();

  // Get article data
  const { data: page } = await db
    .from("pages")
    .select("id, slug, blog_category, workspace_id")
    .eq("slug", slug)
    .single();

  if (!page) {
    console.error(`Page not found: ${slug}`);
    process.exit(1);
  }

  const { data: trans } = await db
    .from("translations")
    .select("id, translated_html, language")
    .eq("page_id", page.id)
    .single();

  if (!trans) {
    console.error(`Translation not found for page: ${slug}`);
    process.exit(1);
  }

  // Get content plan data
  const { data: plan } = await db
    .from("blog_content_plan")
    .select("primary_keyword, content_brief")
    .eq("page_id", page.id)
    .single();

  console.log(`Generating images for "${slug}"...`);
  console.log(`  Category: ${page.blog_category}`);
  console.log(`  Keyword: ${plan?.primary_keyword || "unknown"}`);

  await generateBlogImagesAndRepublish({
    translationId: trans.id,
    pageId: page.id,
    articleTitle: slug,
    primaryKeyword: plan?.primary_keyword || slug,
    contentBrief: plan?.content_brief || "",
    category: page.blog_category || "Kollagen",
    slug: slug,
    language: trans.language,
    workspaceId: page.workspace_id,
    articleHtml: trans.translated_html,
  });

  console.log("Done!");
}

main().catch(console.error);
