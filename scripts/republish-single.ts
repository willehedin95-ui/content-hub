/**
 * Republish a single blog article.
 * Usage: npx tsx scripts/republish-single.ts <slug> [language]
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
  value = value.replace(/\\n/g, "").trim();
  if (!process.env[key]) process.env[key] = value;
}

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: npx tsx scripts/republish-single.ts <slug> [language]");
    process.exit(1);
  }
  const language = (process.argv[3] || "sv") as "sv" | "da" | "no";

  const { createServerSupabase } = await import("../src/lib/supabase-admin");
  const {
    extractArticleBody, extractFirstImage, extractMetaDescription,
    autoFillAltText, injectBlogUTMs, wrapInBlogShell, fixMetaImageUrls,
    getDefaultBlogConfig, slugifyCategory,
  } = await import("../src/lib/blog-shell");
  const { publishPage, getProjectCustomDomain } = await import("../src/lib/cloudflare-pages");
  const { getPublishedBlogArticles } = await import("../src/lib/blog-deploy");

  const db = createServerSupabase();

  // Get translation + page
  const { data: trans } = await db
    .from("translations")
    .select("id, slug, seo_title, seo_description, translated_html, created_at, pages!inner(id, blog_category, workspace_id)")
    .eq("slug", slug)
    .eq("language", language)
    .single();

  if (!trans) { console.error(`Translation not found: ${slug}`); process.exit(1); }

  const page = trans.pages as unknown as { id: string; blog_category?: string; workspace_id: string };

  // Get workspace settings
  const { data: workspace } = await db.from("workspaces").select("settings").eq("id", page.workspace_id).single();
  const settings = (workspace?.settings ?? {}) as Record<string, unknown>;
  type BlogConfig = Awaited<ReturnType<typeof getDefaultBlogConfig>>;
  const blogConfig = (settings.blog_config as BlogConfig) ?? getDefaultBlogConfig();
  const domain = getProjectCustomDomain(language);
  const baseUrl = domain ? `https://${domain}` : "";

  const category = page.blog_category || "";
  const categorySlug = slugifyCategory(category);
  const deploySlug = categorySlug ? `${categorySlug}/${trans.slug}` : trans.slug;

  console.log(`Republishing: ${slug} (category: ${category}, deploy: ${deploySlug})`);

  const { bodyHtml: rawBodyHtml, headHtml } = extractArticleBody(trans.translated_html);
  const bodyHtmlAlt = autoFillAltText(rawBodyHtml, trans.seo_title || slug);
  const bodyHtml = injectBlogUTMs(bodyHtmlAlt, slug);
  const relatedArticles = await getPublishedBlogArticles(language, slug);
  const featuredImage = extractFirstImage(bodyHtml);

  const wrappedHtml = wrapInBlogShell({
    articleBodyHtml: bodyHtml,
    articleHeadHtml: headHtml,
    seoTitle: trans.seo_title || slug,
    seoDescription: trans.seo_description || extractMetaDescription(bodyHtml),
    slug,
    language,
    blogConfig,
    relatedArticles,
    featuredImageUrl: featuredImage,
    blogCategory: category,
    publishedAt: trans.created_at,
    updatedAt: new Date().toISOString(),
    baseUrl,
  });

  // Optimize images
  type DeployFile = Parameters<typeof publishPage>[3] extends (infer T)[] | undefined ? T : never;
  const deployFiles: DeployFile[] = [];
  let finalHtml = wrappedHtml;
  try {
    const { optimizeImages } = await import("../src/lib/image-optimizer");
    const imgResult = await optimizeImages(wrappedHtml, deploySlug);
    if (imgResult.stats.optimized > 0) {
      for (const [originalUrl, deployPath] of imgResult.urlMap) {
        finalHtml = finalHtml.split(originalUrl).join(deployPath);
      }
      for (const img of imgResult.images) {
        deployFiles.push({ path: img.deployPath, sha1: img.sha1, body: new Uint8Array(img.buffer) });
      }
      console.log(`  Images: ${imgResult.stats.optimized} optimized, ${Math.round(imgResult.stats.savedBytes / 1024)}KB saved`);
    }
  } catch (err) {
    console.warn(`  Image optimization failed:`, err);
  }

  finalHtml = fixMetaImageUrls(finalHtml, baseUrl);

  const ga4Ids = (settings.ga4_measurement_ids as Record<string, string>) ?? {};
  const analytics = {
    ga4MeasurementId: ga4Ids[language] || undefined,
    clarityProjectId: (settings.clarity_project_ids as Record<string, string>)?.[language] || undefined,
    shopifyDomains: ((settings.shopify_domains as string) || "").split(",").map((d: string) => d.trim()).filter(Boolean),
    metaPixelId: (settings.meta_pixel_id as string) || undefined,
    hubUrl: process.env.APP_URL || undefined,
    contentType: "seo_blog" as const,
  };

  const result = await publishPage(finalHtml, deploySlug, language, deployFiles, undefined, analytics);
  console.log(`Published: ${result.url}`);
}

main().catch(console.error);
