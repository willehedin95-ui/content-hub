/**
 * Republish ALL blog articles — updates HTML (new CSS, fixes) and redeploys to Cloudflare Pages.
 */
import fs from "fs";
import path from "path";

const envPath = path.join(__dirname, "..", ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=][^=]*)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const val = match[2].trim();
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

async function main() {
  const { createServerSupabase } = await import("../src/lib/supabase-admin");
  const { extractArticleBody, autoFillAltText, extractFirstImage, extractMetaDescription, wrapInBlogShell, getDefaultBlogConfig, slugifyCategory, generateBlogHomepage } = await import("../src/lib/blog-shell");
  const { publishPage } = await import("../src/lib/cloudflare-pages");
  const { injectProductImage } = await import("../src/lib/blog-images");

  type Language = "sv" | "da" | "no";
  type BlogConfig = ReturnType<typeof getDefaultBlogConfig>;

  const db = createServerSupabase();

  // Get all published blog pages
  const { data: pages, error: pagesError } = await db
    .from("pages")
    .select("id, slug, name, blog_category, product, workspace_id, created_at")
    .eq("content_type", "seo_blog");

  if (pagesError || !pages?.length) {
    console.error("No blog pages found", pagesError);
    process.exit(1);
  }

  console.log(`Found ${pages.length} blog pages`);

  // Get all published translations for these pages
  const pageIds = pages.map(p => p.id);
  const { data: translations } = await db
    .from("translations")
    .select("id, page_id, language, translated_html, seo_title, seo_description, status, created_at")
    .in("page_id", pageIds)
    .eq("status", "published");

  if (!translations?.length) {
    console.log("No published translations found");
    process.exit(0);
  }

  console.log(`Found ${translations.length} published translations to republish\n`);

  const pageMap = new Map(pages.map(p => [p.id, p]));

  // Group by language for homepage regeneration later
  const languagesUsed = new Set<string>();

  for (const translation of translations) {
    const page = pageMap.get(translation.page_id);
    if (!page) continue;

    const language = translation.language as Language;
    languagesUsed.add(language);

    console.log(`[${language}] Republishing: ${page.slug} ("${page.name}")`);

    let html = translation.translated_html as string;
    if (!html) {
      console.warn(`  Skipping — no HTML content`);
      continue;
    }

    // Apply fixes (same as republish-blog-article.ts)
    // Fix 1: Hero image after H1
    const heroImgRegex = /<img\s+class="hero-img"[^>]*>/i;
    const heroMatch = html.match(heroImgRegex);
    if (heroMatch) {
      const heroTag = heroMatch[0];
      const h1CloseIndex = html.indexOf("</h1>");
      const heroIndex = html.indexOf(heroTag);
      if (h1CloseIndex !== -1 && heroIndex > h1CloseIndex + 200) {
        html = html.replace(heroTag, "");
        const insertPos = html.indexOf("</h1>") + "</h1>".length;
        html = html.slice(0, insertPos) + "\n    " + heroTag + html.slice(insertPos);
      }
    }

    // Fix 2: Remove duplicate product images
    const productImgMatches = html.match(/<img\s+class="product-img"[^>]*>/gi);
    if (productImgMatches && productImgMatches.length > 1) {
      for (let i = 1; i < productImgMatches.length; i++) {
        html = html.replace(productImgMatches[i], "");
      }
    }

    // Fix 3: TL;DR → Kort sammanfattning
    html = html.replace(/Kort sammanfattning \(TL;DR\)/gi, "Kort sammanfattning");
    html = html.replace(/>TL;DR</gi, ">Kort sammanfattning<");

    // Fix 4: Table wraps
    html = html.replace(/(<div class="table-wrap">\s*)+(<table[\s>])/g, '<div class="table-wrap">$2');
    html = html.replace(/<\/table>(\s*<\/div>)+/g, '</table></div>');
    html = html.replace(/(?<!<div class="table-wrap">[\s\S]{0,5})(<table[\s>])/g, '<div class="table-wrap">$1');
    const openWraps = (html.match(/<div class="table-wrap">/g) || []).length;
    const closeAfterTable = (html.match(/<\/table>\s*<\/div>/g) || []).length;
    if (openWraps > closeAfterTable) {
      html = html.replace(/<\/table>(?!\s*<\/div>)/g, '</table></div>');
    }

    // Inject product image if applicable
    if (page.product) {
      html = await injectProductImage(html, page.product);
    }

    // Update translation in DB
    await db.from("translations").update({ translated_html: html }).eq("id", translation.id);

    // Get workspace settings
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

    const relatedPageIds = (relatedRows || []).map(r => r.page_id);
    const { data: relatedPages } = relatedPageIds.length > 0
      ? await db.from("pages").select("id, blog_category, blog_featured_image_url").in("id", relatedPageIds)
      : { data: [] };

    const relatedMap = new Map((relatedPages || []).map(p => [p.id, p]));
    const category = page.blog_category || "";

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
      slug: page.slug,
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
    const deploySlug = categorySlug ? `${categorySlug}/${page.slug}` : page.slug;

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

    // Optimize images: download → WebP → embed in deployment
    let finalHtml = wrappedHtml;
    const deployFiles: Array<{ path: string; sha1: string; body: Uint8Array }> = [];
    try {
      const { optimizeImages } = await import("../src/lib/image-optimizer");
      const imgResult = await optimizeImages(wrappedHtml, deploySlug);
      if (imgResult.stats.optimized > 0) {
        finalHtml = wrappedHtml;
        for (const [originalUrl, deployPath] of imgResult.urlMap) {
          finalHtml = finalHtml.split(originalUrl).join(deployPath);
        }
        for (const img of imgResult.images) {
          deployFiles.push({ path: img.deployPath, sha1: img.sha1, body: new Uint8Array(img.buffer) });
        }
        console.log(`  [images] ${imgResult.stats.optimized} optimized, ${(imgResult.stats.savedBytes / 1024).toFixed(0)}KB saved`);
      }
    } catch (err) {
      console.warn(`  [images] Optimization failed, using original URLs:`, err);
    }

    const result = await publishPage(finalHtml, deploySlug, language, deployFiles, undefined, analytics);

    // Update featured image
    await db.from("pages").update({ blog_featured_image_url: featuredImage }).eq("id", page.id);
    await db.from("translations").update({ published_url: result.url.trim() }).eq("id", translation.id);

    console.log(`  Published: ${result.url}`);
  }

  // Regenerate homepages for each language used
  console.log("\nRegenerating homepages...");

  for (const lang of languagesUsed) {
    const language = lang as Language;
    
    const { data: workspace } = await db
      .from("workspaces")
      .select("settings")
      .eq("id", pages[0].workspace_id)
      .single();
    
    const settings = (workspace?.settings ?? {}) as Record<string, unknown>;
    const blogConfig = (settings.blog_config as BlogConfig) ?? getDefaultBlogConfig();
    const domain = process.env[`CF_PAGES_DOMAIN_${language.toUpperCase()}`]?.trim();
    const baseUrl = domain ? `https://${domain}` : "";

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

    const homepageHtml = generateBlogHomepage({
      articles: articleSummaries,
      language,
      blogConfig,
      baseUrl,
    });

    await publishPage(homepageHtml, "", language, [], undefined, analytics);
    console.log(`  Homepage updated for ${language}`);
  }

  console.log("\nAll blog articles republished!");
}

main().catch((err) => {
  console.error("[republish-all] Fatal error:", err);
  process.exit(1);
});
