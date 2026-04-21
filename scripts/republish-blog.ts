// Usage: npx tsx scripts/republish-blog.ts
// Republishes all blog articles with latest HTML fixes + regenerates homepage/sitemap/RSS.
// Requires .env.local with Supabase + Cloudflare creds.

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
  // Dynamic imports after env is loaded
  const { createServerSupabase } = await import("../src/lib/supabase-admin");
  const {
    extractArticleBody,
    extractFirstImage,
    extractMetaDescription,
    autoFillAltText,
    injectBlogUTMs,
    wrapInBlogShell,
    fixMetaImageUrls,
    getDefaultBlogConfig,
    slugifyCategory,
  } = await import("../src/lib/blog-shell");
  type BlogConfig = Awaited<ReturnType<typeof getDefaultBlogConfig>>;
  const {
    publishPage,
    getProjectCustomDomain,
    deploySitemapAndRobots,
  } = await import("../src/lib/cloudflare-pages");
  type PageAnalyticsConfig = Parameters<typeof publishPage>[5] & {};
  type DeployFile = Parameters<typeof publishPage>[3] extends (infer T)[] | undefined ? T : never;
  const {
    getPublishedBlogArticles,
    deployBlogHomepage,
    deployBlogRssFeed,
  } = await import("../src/lib/blog-deploy");

  // Usage: npx tsx scripts/republish-blog.ts [language] [workspace_id]
  // Defaults to HappySleep Swedish if omitted.
  const LANGUAGE = (process.argv[2] || "sv") as "sv" | "da" | "no";
  const WORKSPACE_ID = process.argv[3] || "c40221e2-96fb-4774-92db-74ec0227b262";
  const db = createServerSupabase();

  const { data: workspace } = await db
    .from("workspaces")
    .select("settings")
    .eq("id", WORKSPACE_ID)
    .single();
  const settings = (workspace?.settings ?? {}) as Record<string, unknown>;
  const blogConfig = (settings.blog_config as BlogConfig) ?? getDefaultBlogConfig();
  const domain = getProjectCustomDomain(LANGUAGE);
  const baseUrl = domain ? `https://${domain}` : "";

  const { data: translations } = await db
    .from("translations")
    .select("id, slug, seo_title, seo_description, translated_html, created_at, status, pages!inner(id, blog_category, content_type, workspace_id)")
    .eq("language", LANGUAGE)
    .eq("status", "published")
    .eq("pages.content_type", "seo_blog")
    .eq("pages.workspace_id", WORKSPACE_ID);

  if (!translations?.length) {
    console.log("No published blog articles found");
    return;
  }

  console.log(`Found ${translations.length} articles to republish\n`);

  const ga4Ids = (settings.ga4_measurement_ids as Record<string, string>) ?? {};
  const analytics: PageAnalyticsConfig = {
    ga4MeasurementId: ga4Ids[LANGUAGE] || undefined,
    clarityProjectId:
      (settings.clarity_project_ids as Record<string, string>)?.[LANGUAGE] ||
      (settings.clarity_project_id as string) ||
      undefined,
    shopifyDomains: ((settings.shopify_domains as string) || "")
      .split(",").map((d: string) => d.trim()).filter(Boolean),
    metaPixelId: (settings.meta_pixel_id as string) || undefined,
    hubUrl: process.env.APP_URL || undefined,
    contentType: "seo_blog" as const,
  };

  for (const trans of translations) {
    const page = trans.pages as unknown as { blog_category?: string };
    const category = page?.blog_category || "";
    const categorySlug = slugifyCategory(category);
    const deploySlug = categorySlug ? `${categorySlug}/${trans.slug}` : trans.slug;

    console.log(`Republishing: ${trans.slug} (${category})`);

    const { bodyHtml: rawBodyHtml, headHtml } = extractArticleBody(trans.translated_html);
    const bodyHtmlAlt = autoFillAltText(rawBodyHtml, trans.seo_title || trans.slug);
    const bodyHtml = injectBlogUTMs(bodyHtmlAlt, trans.slug);
    const relatedArticles = await getPublishedBlogArticles(LANGUAGE, trans.slug);
    const featuredImage = extractFirstImage(bodyHtml);

    const wrappedHtml = wrapInBlogShell({
      articleBodyHtml: bodyHtml,
      articleHeadHtml: headHtml,
      seoTitle: trans.seo_title || trans.slug,
      seoDescription: trans.seo_description || extractMetaDescription(bodyHtml),
      slug: trans.slug,
      language: LANGUAGE,
      blogConfig,
      relatedArticles,
      featuredImageUrl: featuredImage,
      blogCategory: category,
      publishedAt: trans.created_at,
      updatedAt: new Date().toISOString(),
      baseUrl,
    });

    let finalHtml = wrappedHtml;
    const deployFiles: DeployFile[] = [];
    try {
      const { optimizeImages, enhanceImageTags } = await import("../src/lib/image-optimizer");
      const imgResult = await optimizeImages(wrappedHtml, deploySlug);
      if (imgResult.stats.optimized > 0) {
        finalHtml = wrappedHtml;
        for (const [originalUrl, deployPath] of imgResult.urlMap) {
          finalHtml = finalHtml.split(originalUrl).join(deployPath);
        }
        for (const img of imgResult.images) {
          deployFiles.push({ path: img.deployPath, sha1: img.sha1, body: new Uint8Array(img.buffer) });
        }
        finalHtml = enhanceImageTags(finalHtml, imgResult.images);
        console.log(`  Images: ${imgResult.stats.optimized} optimized`);
      }
    } catch (err) {
      console.warn(`  Image optimization failed:`, err);
    }

    // Fix OG/Twitter/JSON-LD image URLs that image optimizer made relative
    finalHtml = fixMetaImageUrls(finalHtml, baseUrl);

    const result = await publishPage(finalHtml, deploySlug, LANGUAGE, deployFiles, undefined, analytics);
    console.log(`  Published: ${result.url}`);
  }

  console.log("\nRegenerating homepage...");
  await deployBlogHomepage(LANGUAGE);
  console.log("Regenerating RSS feed...");
  await deployBlogRssFeed(LANGUAGE);
  console.log("Regenerating sitemap...");
  await deploySitemapAndRobots(LANGUAGE);

  console.log("\nDone! All articles republished with fixes.");
}

main().catch(console.error);
