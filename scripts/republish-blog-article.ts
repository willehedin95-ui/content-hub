/**
 * Republish an existing blog article — updates HTML and redeploys to Cloudflare Pages.
 * Usage: npx tsx scripts/republish-blog-article.ts [slug]
 */
import fs from "fs";
import path from "path";

// Load .env.local
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
  const slug = process.argv[2] || "basta-kudden";

  const { createServerSupabase } = await import("../src/lib/supabase-admin");
  const { extractArticleBody, autoFillAltText, extractFirstImage, extractMetaDescription, wrapInBlogShell, getDefaultBlogConfig, slugifyCategory } = await import("../src/lib/blog-shell");
  const { publishPage } = await import("../src/lib/cloudflare-pages");
  const { injectProductImage } = await import("../src/lib/blog-images");

  type Language = "sv" | "da" | "no";
  type BlogConfig = ReturnType<typeof getDefaultBlogConfig>;

  const db = createServerSupabase();

  // Find the page
  const { data: page, error: pageError } = await db
    .from("pages")
    .select("id, slug, name, blog_category, product, workspace_id, created_at")
    .eq("slug", slug)
    .eq("content_type", "seo_blog")
    .single();

  if (pageError || !page) {
    console.error(`Page not found: ${slug}`, pageError);
    process.exit(1);
  }

  console.log(`[republish] Found page: "${page.name}" (${page.id})`);

  // Find the translation
  const { data: translation, error: tError } = await db
    .from("translations")
    .select("id, language, translated_html, seo_title, seo_description, created_at")
    .eq("page_id", page.id)
    .eq("language", "sv")
    .single();

  if (tError || !translation) {
    console.error(`Translation not found for page ${page.id}`, tError);
    process.exit(1);
  }

  console.log(`[republish] Translation: ${translation.id} (${translation.language})`);

  let html = translation.translated_html as string;

  // --- Fix 1: Ensure hero image is after H1 ---
  const heroImgRegex = /<img\s+class="hero-img"[^>]*>/i;
  const heroMatch = html.match(heroImgRegex);
  if (heroMatch) {
    const heroTag = heroMatch[0];
    const h1CloseIndex = html.indexOf("</h1>");
    const heroIndex = html.indexOf(heroTag);
    // Only move if hero is NOT already right after H1
    if (h1CloseIndex !== -1 && heroIndex > h1CloseIndex + 200) {
      html = html.replace(heroTag, "");
      const insertPos = html.indexOf("</h1>") + "</h1>".length;
      html = html.slice(0, insertPos) + "\n    " + heroTag + html.slice(insertPos);
      console.log("[republish] Moved hero image to after H1");
    } else {
      console.log("[republish] Hero image already in correct position");
    }
  }

  // --- Fix 2: Remove duplicate product images (keep only first) ---
  const productImgMatches = html.match(/<img\s+class="product-img"[^>]*>/gi);
  if (productImgMatches && productImgMatches.length > 1) {
    // Remove all but the first product image
    for (let i = 1; i < productImgMatches.length; i++) {
      html = html.replace(productImgMatches[i], "");
    }
    console.log(`[republish] Removed ${productImgMatches.length - 1} duplicate product image(s)`);
  }

  // --- Fix 3: Replace "TL;DR" with "Kort sammanfattning" ---
  html = html.replace(/Kort sammanfattning \(TL;DR\)/gi, "Kort sammanfattning");
  html = html.replace(/>TL;DR</gi, ">Kort sammanfattning<");
  console.log("[republish] Fixed TL;DR labels");

  // --- Fix 4: Ensure tables are in exactly one .table-wrap ---
  // Collapse any nested table-wraps to a single layer
  html = html.replace(/(<div class="table-wrap">\s*)+(<table[\s>])/g, '<div class="table-wrap">$2');
  html = html.replace(/<\/table>(\s*<\/div>)+/g, '</table></div>');
  // Wrap any bare tables that aren't inside a table-wrap
  html = html.replace(/(?<!<div class="table-wrap">[\s\S]{0,5})(<table[\s>])/g, '<div class="table-wrap">$1');
  // Ensure closing tags match (bare tables that got opening wrap need closing wrap)
  const openWraps = (html.match(/<div class="table-wrap">/g) || []).length;
  const closeAfterTable = (html.match(/<\/table>\s*<\/div>/g) || []).length;
  if (openWraps > closeAfterTable) {
    html = html.replace(/<\/table>(?!\s*<\/div>)/g, '</table></div>');
  }
  console.log("[republish] Ensured single .table-wrap around tables");

  // Inject product image if applicable (now idempotent — skips if already present)
  if (page.product) {
    html = await injectProductImage(html, page.product);
  }

  // Update translation record with fixed HTML
  const { error: updateError } = await db
    .from("translations")
    .update({ translated_html: html })
    .eq("id", translation.id);

  if (updateError) {
    console.error("[republish] Failed to update translation:", updateError);
    process.exit(1);
  }

  console.log("[republish] Updated translation HTML in DB");

  // Now republish
  const language: Language = translation.language as Language;
  const category = page.blog_category || "";

  const { data: workspace } = await db
    .from("workspaces")
    .select("settings")
    .eq("id", page.workspace_id)
    .single();

  const settings = (workspace?.settings ?? {}) as Record<string, unknown>;
  const blogConfig = (settings.blog_config as BlogConfig) ?? getDefaultBlogConfig();

  const domain = process.env[`CF_PAGES_DOMAIN_${language.toUpperCase()}`]?.trim();
  const baseUrl = domain ? `https://${domain}` : "";

  const { bodyHtml: rawBodyHtml, headHtml } = extractArticleBody(html);
  const bodyHtml = autoFillAltText(rawBodyHtml, translation.seo_title);

  // Get related articles
  const { data: relatedRows } = await db
    .from("translations")
    .select("slug, seo_title, seo_description, page_id")
    .eq("language", language)
    .eq("status", "published")
    .neq("page_id", page.id)
    .order("created_at", { ascending: false })
    .limit(4);

  // Get blog_category for related articles
  const relatedPageIds = (relatedRows || []).map(r => r.page_id);
  const { data: relatedPages } = relatedPageIds.length > 0
    ? await db.from("pages").select("id, blog_category, blog_featured_image_url").in("id", relatedPageIds)
    : { data: [] };

  const relatedMap = new Map((relatedPages || []).map(p => [p.id, p]));

  const relatedArticles = (relatedRows || []).map(r => {
    const rPage = relatedMap.get(r.page_id);
    const catSlug = rPage?.blog_category ? slugifyCategory(rPage.blog_category) : undefined;
    return {
      title: r.seo_title,
      slug: r.slug,
      categorySlug: catSlug,
      excerpt: (r.seo_description || "").slice(0, 120),
      featuredImageUrl: rPage?.blog_featured_image_url,
      category: rPage?.blog_category,
      publishedAt: translation.created_at,
    };
  });

  const featuredImage = extractFirstImage(bodyHtml);

  const wrappedHtml = wrapInBlogShell({
    articleBodyHtml: bodyHtml,
    articleHeadHtml: headHtml,
    seoTitle: translation.seo_title,
    seoDescription: translation.seo_description || extractMetaDescription(bodyHtml),
    slug,
    language,
    blogConfig,
    relatedArticles,
    featuredImageUrl: featuredImage,
    blogCategory: category,
    publishedAt: page.created_at,
    updatedAt: new Date().toISOString(),
    baseUrl,
  });

  const categorySlug = slugifyCategory(category);
  const deploySlug = categorySlug ? `${categorySlug}/${slug}` : slug;

  // Analytics config
  const ga4Ids = (settings.ga4_measurement_ids as Record<string, string>) ?? {};
  const analytics = {
    ga4MeasurementId: ga4Ids[language] || undefined,
    clarityProjectId:
      (settings.clarity_project_ids as Record<string, string>)?.[language] ||
      (settings.clarity_project_id as string) ||
      undefined,
    shopifyDomains: ((settings.shopify_domains as string) || "")
      .split(",")
      .map((d: string) => d.trim())
      .filter(Boolean),
    metaPixelId: (settings.meta_pixel_id as string) || undefined,
    hubUrl: process.env.APP_URL || undefined,
    contentType: "seo_blog" as const,
  };

  console.log(`[republish] Deploying to Cloudflare Pages: ${deploySlug}`);
  const result = await publishPage(wrappedHtml, deploySlug, language, [], undefined, analytics);

  // Update featured image and status
  await db
    .from("pages")
    .update({ blog_featured_image_url: featuredImage })
    .eq("id", page.id);

  await db
    .from("translations")
    .update({
      status: "published",
      published_url: result.url.trim(),
    })
    .eq("id", translation.id);

  console.log(`[republish] Done! Published to: ${result.url}`);

  // Also regenerate homepage
  const { generateBlogHomepage, generateCategoryPage } = await import("../src/lib/blog-shell");
  const { data: allArticles } = await db
    .from("translations")
    .select("slug, seo_title, seo_description, page_id, created_at")
    .eq("language", language)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  const { data: allPages } = await db
    .from("pages")
    .select("id, blog_category, blog_featured_image_url")
    .eq("content_type", "seo_blog");

  const allPagesMap = new Map((allPages || []).map(p => [p.id, p]));

  const articleSummaries = (allArticles || []).map(a => {
    const ap = allPagesMap.get(a.page_id);
    return {
      title: a.seo_title,
      slug: a.slug,
      categorySlug: ap?.blog_category ? slugifyCategory(ap.blog_category) : undefined,
      excerpt: (a.seo_description || "").slice(0, 120),
      featuredImageUrl: ap?.blog_featured_image_url,
      category: ap?.blog_category,
      publishedAt: a.created_at,
    };
  });

  const homepageHtml = generateBlogHomepage({
    articles: articleSummaries,
    language,
    blogConfig,
    baseUrl,
  });

  await publishPage(homepageHtml, "", language, [], undefined, analytics);
  console.log("[republish] Homepage updated");
}

main().catch((err) => {
  console.error("[republish] Fatal error:", err);
  process.exit(1);
});
