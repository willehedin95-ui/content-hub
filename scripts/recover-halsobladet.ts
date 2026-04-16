/**
 * One-off recovery script: rebuilds the halsobladet.com CF Pages manifest
 * after a concurrency bug wiped it down to just /index.html.
 *
 * Usage: npx tsx scripts/recover-halsobladet.ts
 *
 * Runs SEQUENTIALLY (no parallelism) to avoid triggering the very bug we
 * just fixed. Order:
 *   1. Landing pages first (active Meta ads pointing there - highest priority)
 *   2. Blog articles
 *   3. Homepage + RSS + sitemap regeneration
 */
import fs from "fs";
import path from "path";

const envPath = path.join(__dirname, "..", ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=][^=]*)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const val = match[2].trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "");
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

type Language = "sv" | "da" | "no";

async function main() {
  const { createServerSupabase } = await import("../src/lib/supabase-admin");
  const { publishPage, getProjectCustomDomain } = await import("../src/lib/cloudflare-pages");
  const { optimizeImages } = await import("../src/lib/image-optimizer");
  const { replaceImageUrls } = await import("../src/lib/html-image-replacer");
  const {
    extractArticleBody, extractFirstImage, extractMetaDescription,
    autoFillAltText, injectBlogUTMs, wrapInBlogShell, fixMetaImageUrls,
    getDefaultBlogConfig, slugifyCategory,
  } = await import("../src/lib/blog-shell");
  const { getPublishedBlogArticles, deployBlogHomepage, deployBlogRssFeed } = await import("../src/lib/blog-deploy");
  const { deploySitemapAndRobots } = await import("../src/lib/cloudflare-pages");

  type BlogConfig = ReturnType<typeof getDefaultBlogConfig>;

  const db = createServerSupabase();
  const LANGUAGE: Language = "sv";

  // Fetch all SV published translations (landing pages + blogs)
  const { data: translations, error } = await db
    .from("translations")
    .select(`
      id, slug, seo_title, seo_description, translated_html, created_at, updated_at, page_id,
      pages!inner(id, slug, source_url, custom_head_code, workspace_id, content_type, blog_category, blog_featured_image_url)
    `)
    .eq("language", LANGUAGE)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error || !translations?.length) {
    console.error("No translations found:", error);
    process.exit(1);
  }

  // Sort: landing pages first (active ads), then blog articles
  const sorted = [...translations].sort((a, b) => {
    const aIsBlog = (a.pages as { content_type?: string }).content_type === "seo_blog";
    const bIsBlog = (b.pages as { content_type?: string }).content_type === "seo_blog";
    if (aIsBlog === bIsBlog) return 0;
    return aIsBlog ? 1 : -1; // non-blog (landing pages) first
  });

  console.log(`Found ${sorted.length} SV published translations to republish`);
  console.log(`  Landing pages: ${sorted.filter(t => (t.pages as { content_type?: string }).content_type !== "seo_blog").length}`);
  console.log(`  Blog articles: ${sorted.filter(t => (t.pages as { content_type?: string }).content_type === "seo_blog").length}`);
  console.log("");

  let ok = 0, failed = 0;
  const errors: string[] = [];

  for (const t of sorted) {
    const page = t.pages as unknown as {
      id: string;
      slug: string;
      source_url: string;
      custom_head_code?: string;
      workspace_id: string;
      content_type?: string;
      blog_category?: string;
      blog_featured_image_url?: string;
    };
    const slug = t.slug || page.slug;
    const isBlog = page.content_type === "seo_blog";
    const tag = isBlog ? "[blog]" : "[landing]";

    console.log(`${tag} ${slug} ("${t.seo_title?.slice(0, 60) ?? ""}")`);

    try {
      let html = t.translated_html as string;
      if (!html) {
        console.warn(`  SKIP: no HTML`);
        continue;
      }

      // Strip editor artifacts (same as publish route)
      html = html.replace(/font-display:\s*optional/g, "font-display: swap");
      html = html.replace(/<style[^>]*data-cc-exclude-mode[^>]*>[\s\S]*?<\/style>/gi, "");
      html = html.replace(/<style[^>]*data-cc-custom[^>]*>[\s\S]*?<\/style>/gi, (match) => {
        let css = match.replace(/\[data-cc-padded\](?::hover)?[^{]*\{[^}]*outline[^}]*\}/g, "");
        css = css.replace(/\[data-cc-pad-skip\][^{]*\{[^}]*\}/g, "");
        return css;
      });
      html = html.replace(/ data-cc-padded(?:="[^"]*")?/g, "");
      html = html.replace(/ data-cc-pad-skip(?:="[^"]*")?/g, "");
      html = html.replace(/ data-cc-editable(?:="[^"]*")?/g, "");
      html = html.replace(/ data-cc-hidden(?:="[^"]*")?/g, "");
      html = html.replace(/ contenteditable="[^"]*"/g, "");

      // Optimize images
      const imageResult = await optimizeImages(html, slug);
      if (imageResult.urlMap.size > 0) {
        html = replaceImageUrls(html, imageResult.urlMap);
      }
      const additionalFiles = imageResult.images.map((img) => ({
        path: img.deployPath,
        sha1: img.sha1,
        body: img.buffer,
      }));

      // Determine deploy slug (with category prefix for blogs)
      const blogCategorySlug = isBlog && page.blog_category ? slugifyCategory(page.blog_category) : undefined;
      const deploySlug = blogCategorySlug ? `${blogCategorySlug}/${slug}` : slug;

      // Workspace settings
      const { data: workspace } = await db
        .from("workspaces")
        .select("settings")
        .eq("id", page.workspace_id)
        .single();
      const settings = (workspace?.settings ?? {}) as Record<string, unknown>;

      // Wrap in blog shell if blog page
      if (isBlog) {
        const blogConfig = (settings.blog_config as BlogConfig) ?? getDefaultBlogConfig();
        const domain = getProjectCustomDomain(LANGUAGE);
        const baseUrl = domain ? `https://${domain}` : "";

        const { bodyHtml: rawBodyHtml, headHtml } = extractArticleBody(html);
        const articleTitle = t.seo_title || slug;
        const bodyHtmlAlt = autoFillAltText(rawBodyHtml, articleTitle);
        const bodyHtml = injectBlogUTMs(bodyHtmlAlt, slug);
        const relatedArticles = await getPublishedBlogArticles(LANGUAGE, slug);
        const featuredImage = page.blog_featured_image_url || extractFirstImage(bodyHtml);

        html = wrapInBlogShell({
          articleBodyHtml: bodyHtml,
          articleHeadHtml: headHtml,
          seoTitle: articleTitle,
          seoDescription: t.seo_description || extractMetaDescription(bodyHtml),
          slug,
          language: LANGUAGE,
          blogConfig,
          relatedArticles,
          featuredImageUrl: featuredImage,
          blogCategory: page.blog_category,
          publishedAt: t.created_at,
          updatedAt: t.updated_at || new Date().toISOString(),
          baseUrl,
        });

        html = fixMetaImageUrls(html, baseUrl);
      }

      // Analytics config
      const ga4Ids = (settings.ga4_measurement_ids as Record<string, string>) ?? {};
      const excludedIps = (settings.excluded_ips as string[]) ?? [];
      const analytics = {
        ga4MeasurementId: ga4Ids[LANGUAGE] || undefined,
        clarityProjectId:
          (settings.clarity_project_ids as Record<string, string>)?.[LANGUAGE] ||
          (settings.clarity_project_id as string) ||
          undefined,
        shopifyDomains: ((settings.shopify_domains as string) || "")
          .split(",").map(d => d.trim()).filter(Boolean),
        metaPixelId: (settings.meta_pixel_id as string) || undefined,
        hubUrl: process.env.APP_URL || undefined,
        excludedIps: excludedIps.length > 0 ? excludedIps : undefined,
        contentType: page.content_type,
      };

      const result = await publishPage(
        html,
        deploySlug,
        LANGUAGE,
        additionalFiles,
        undefined,
        analytics,
        page.custom_head_code,
      );

      await db.from("translations")
        .update({ published_url: result.url.trim() })
        .eq("id", t.id);

      console.log(`  OK: ${result.url}`);
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  FAIL: ${msg}`);
      errors.push(`${slug}: ${msg}`);
      failed++;
    }
  }

  console.log(`\n=== Individual pages done: ${ok} ok, ${failed} failed ===\n`);

  // Regenerate homepage + RSS + sitemap sequentially
  console.log("Regenerating blog homepage...");
  try {
    await deployBlogHomepage(LANGUAGE);
    console.log("  OK");
  } catch (err) {
    console.error("  FAIL:", err);
  }

  console.log("Regenerating RSS feed...");
  try {
    await deployBlogRssFeed(LANGUAGE);
    console.log("  OK");
  } catch (err) {
    console.error("  FAIL:", err);
  }

  console.log("Regenerating sitemap + robots.txt...");
  try {
    await deploySitemapAndRobots(LANGUAGE);
    console.log("  OK");
  } catch (err) {
    console.error("  FAIL:", err);
  }

  console.log(`\n=== RECOVERY DONE ===`);
  console.log(`Pages: ${ok} ok, ${failed} failed`);
  if (errors.length > 0) {
    console.log("\nErrors:");
    errors.forEach(e => console.log(`  - ${e}`));
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
