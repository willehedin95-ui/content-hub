#!/usr/bin/env npx tsx
/**
 * Publish a test blog article to Cloudflare Pages.
 * Bypasses Next.js cookie/workspace requirements.
 */
import * as fs from "fs";
import * as path from "path";

// Load .env.local manually
const envPath = path.join(__dirname, "..", ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=][^=]*)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const val = match[2].trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const {
    extractArticleBody,
    extractFirstImage,
    extractMetaDescription,
    autoFillAltText,
    wrapInBlogShell,
    getDefaultBlogConfig,
    slugifyCategory,
  } = await import("../src/lib/blog-shell");
  const {
    publishPage,
    getProjectCustomDomain,
  } = await import("../src/lib/cloudflare-pages");
  const {
    deployBlogHomepage,
    deployBlogRssFeed,
  } = await import("../src/lib/blog-deploy");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch the test article
  const translationId = "0d29ae07-9ea3-4249-a661-269f6ca8f19d";
  const { data: t, error } = await supabase
    .from("translations")
    .select("*, pages!inner(content_type, blog_category, blog_featured_image_url, slug)")
    .eq("id", translationId)
    .single();

  if (error || !t) {
    console.error("Failed to fetch translation:", error);
    process.exit(1);
  }

  console.log("Publishing:", t.seo_title);
  console.log("Slug:", t.slug);
  console.log("Language:", t.language);
  console.log("Status:", t.status);

  const language = t.language as "sv" | "da" | "no";
  const slug = t.slug || (t.pages as any).slug;
  const blogConfig = getDefaultBlogConfig();
  const domain = getProjectCustomDomain(language);
  const baseUrl = domain ? "https://" + domain : "";

  let html = t.translated_html;
  if (!html) {
    console.error("No translated_html found!");
    process.exit(1);
  }

  // Extract and process the article body
  const { bodyHtml: rawBodyHtml, headHtml } = extractArticleBody(html);
  const articleTitle = t.seo_title || slug;
  const bodyHtml = autoFillAltText(rawBodyHtml, articleTitle);

  const page = t.pages as any;
  const featuredImage = page.blog_featured_image_url || extractFirstImage(bodyHtml);
  const blogCategory = page.blog_category || undefined;
  const categorySlug = blogCategory ? slugifyCategory(blogCategory) : undefined;
  const deploySlug = categorySlug ? categorySlug + "/" + slug : slug;

  // No related articles yet (first article published)
  const relatedArticles: any[] = [];

  const wrappedHtml = wrapInBlogShell({
    articleBodyHtml: bodyHtml,
    articleHeadHtml: headHtml,
    seoTitle: articleTitle,
    seoDescription: t.seo_description || extractMetaDescription(bodyHtml),
    slug,
    language,
    blogConfig,
    relatedArticles,
    featuredImageUrl: featuredImage,
    blogCategory,
    publishedAt: t.created_at,
    updatedAt: t.updated_at || new Date().toISOString(),
    baseUrl,
  });

  console.log("\nWrapped HTML:", wrappedHtml.length, "chars");
  console.log("Deploy slug:", deploySlug);
  console.log("Domain:", domain);
  console.log("Base URL:", baseUrl);

  // Deploy to Cloudflare Pages
  console.log("\nDeploying to Cloudflare Pages...");
  const result = await publishPage(wrappedHtml, deploySlug, language, []);
  console.log("Published:", result.url);

  // Update DB status to published
  const { error: updateError } = await supabase
    .from("translations")
    .update({ status: "published", published_url: result.url.trim() })
    .eq("id", translationId);

  if (updateError) {
    console.error("Failed to update status:", updateError);
  } else {
    console.log("DB status updated to 'published'");
  }

  // Redeploy homepage and RSS with the new article
  console.log("\nRedeploying blog homepage...");
  const hp = await deployBlogHomepage(language);
  console.log("Homepage:", hp.url);

  console.log("\nRedeploying RSS feed...");
  const rss = await deployBlogRssFeed(language);
  console.log("RSS feed:", rss.url);

  console.log("\n=== DONE ===");
  console.log("Article URL:", result.url);
  console.log("Homepage URL:", hp.url);
  console.log("RSS URL:", rss.url);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
