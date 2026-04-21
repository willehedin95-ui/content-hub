import { createServerSupabase } from "@/lib/supabase-admin";
import {
  getConfig,
  getProjectName,
  getProjectCustomDomain,
  md5hex,
  loadManifest,
  mergeManifest,
  getUploadToken,
  uploadFiles,
  upsertHashes,
  createDeployment,
} from "@/lib/cloudflare-pages";
import {
  generateBlogHomepage,
  generateCategoryPage,
  generateRssFeed,
  getDefaultBlogConfig,
  slugifyCategory,
  type BlogArticleSummary,
  type BlogConfig,
} from "@/lib/blog-shell";
import type { Language } from "@/types";

/**
 * Fetch all published SEO blog articles for a language.
 * Used for homepage generation and related articles sidebar.
 */
export async function getPublishedBlogArticles(
  language: Language,
  excludeSlug?: string
): Promise<BlogArticleSummary[]> {
  const db = createServerSupabase();

  const query = db
    .from("translations")
    .select(
      "slug, seo_title, seo_description, updated_at, created_at, pages!inner(content_type, blog_category, blog_featured_image_url)"
    )
    .eq("language", language)
    .eq("status", "published")
    .eq("pages.content_type", "seo_blog")
    .not("slug", "is", null);

  if (excludeSlug) {
    query.neq("slug", excludeSlug);
  }

  const { data } = await query.order("created_at", { ascending: false });

  return (data ?? []).map((t) => {
    const page = t.pages as unknown as {
      blog_category?: string;
      blog_featured_image_url?: string;
    };
    const category = page?.blog_category || undefined;
    return {
      title: t.seo_title || t.slug || "",
      slug: t.slug || "",
      categorySlug: category ? slugifyCategory(category) : undefined,
      excerpt: t.seo_description || "",
      featuredImageUrl: page?.blog_featured_image_url || undefined,
      category,
      publishedAt: t.created_at,
    };
  });
}

/**
 * Deploy the blog homepage (/index.html) for a language.
 * Lists all published seo_blog articles in a card grid.
 */
export async function deployBlogHomepage(
  language: Language,
  blogConfig?: BlogConfig
): Promise<{ url: string; deploy_id: string }> {
  const { accountId, apiToken } = getConfig();
  const projectName = getProjectName(language);
  const domain = getProjectCustomDomain(language);
  if (!domain)
    throw new Error(`No custom domain configured for language: ${language}`);
  const baseUrl = `https://${domain}`;

  const config = blogConfig ?? getDefaultBlogConfig();
  const articles = await getPublishedBlogArticles(language);

  const homepageHtml = generateBlogHomepage({
    articles,
    language,
    blogConfig: config,
    baseUrl,
  });

  const htmlBuffer = Buffer.from(homepageHtml, "utf-8");
  const htmlHash = md5hex(htmlBuffer);

  const newFiles: Array<{ path: string; hash: string; content: Buffer; contentType: string }> = [
    {
      path: "/index.html",
      hash: htmlHash,
      content: htmlBuffer,
      contentType: "text/html",
    },
  ];

  // CF Pages defaults Referrer-Policy to strict-origin-when-cross-origin,
  // which strips the path from Referer headers cross-origin. We need the full
  // URL so Shopify order attribution (shopify.ts getOrdersByPage referrer
  // fallback) can pin conversions to specific article slugs. A `_headers`
  // file at the project root overrides the CF default site-wide.
  const headersContent = Buffer.from(
    "/*\n  Referrer-Policy: no-referrer-when-downgrade\n",
    "utf-8"
  );
  newFiles.push({
    path: "/_headers",
    hash: md5hex(headersContent),
    content: headersContent,
    contentType: "text/plain",
  });

  // Generate category index pages
  const categoryMap = new Map<string, { name: string; slug: string; articles: BlogArticleSummary[] }>();
  for (const a of articles) {
    if (a.category && a.categorySlug) {
      if (!categoryMap.has(a.categorySlug)) {
        categoryMap.set(a.categorySlug, { name: a.category, slug: a.categorySlug, articles: [] });
      }
      categoryMap.get(a.categorySlug)!.articles.push(a);
    }
  }
  for (const [, cat] of categoryMap) {
    const catHtml = generateCategoryPage({
      categoryName: cat.name,
      categorySlug: cat.slug,
      articles: cat.articles,
      language,
      blogConfig: config,
      baseUrl,
    });
    const catBuffer = Buffer.from(catHtml, "utf-8");
    newFiles.push({
      path: `/${cat.slug}/index.html`,
      hash: md5hex(catBuffer),
      content: catBuffer,
      contentType: "text/html",
    });
  }

  // Load existing manifest and merge
  const existingManifest = await loadManifest(projectName);
  const manifest: Record<string, string> = { ...existingManifest };
  for (const f of newFiles) {
    manifest[f.path] = f.hash;
  }

  const existingHashes = new Set(Object.values(existingManifest));
  const filesToUpload = newFiles.filter((f) => !existingHashes.has(f.hash));

  const jwt = await getUploadToken(accountId, apiToken, projectName);

  if (filesToUpload.length > 0) {
    await uploadFiles(jwt, filesToUpload);
    await upsertHashes(
      jwt,
      filesToUpload.map((f) => f.hash)
    );
  }

  const deploy = await createDeployment(
    accountId,
    apiToken,
    projectName,
    manifest
  );

  const newPathsOnly: Record<string, string> = {};
  for (const f of newFiles) newPathsOnly[f.path] = f.hash;
  await mergeManifest(projectName, newPathsOnly);

  return {
    url: `${baseUrl}/`,
    deploy_id: deploy.id,
  };
}

/**
 * Deploy the RSS feed (/rss.xml) for a language.
 * Called alongside homepage after every blog publish.
 */
export async function deployBlogRssFeed(
  language: Language,
  blogConfig?: BlogConfig
): Promise<{ url: string; deploy_id: string }> {
  const { accountId, apiToken } = getConfig();
  const projectName = getProjectName(language);
  const domain = getProjectCustomDomain(language);
  if (!domain)
    throw new Error(`No custom domain configured for language: ${language}`);
  const baseUrl = `https://${domain}`;

  const config = blogConfig ?? getDefaultBlogConfig();
  const articles = await getPublishedBlogArticles(language);

  const rssXml = generateRssFeed({
    articles,
    language,
    blogConfig: config,
    baseUrl,
  });

  const rssBuffer = Buffer.from(rssXml, "utf-8");
  const rssHash = md5hex(rssBuffer);

  const newFiles = [
    {
      path: "/rss.xml",
      hash: rssHash,
      content: rssBuffer,
      contentType: "application/rss+xml",
    },
  ];

  const existingManifest = await loadManifest(projectName);
  const manifest: Record<string, string> = { ...existingManifest };
  for (const f of newFiles) {
    manifest[f.path] = f.hash;
  }

  const existingHashes = new Set(Object.values(existingManifest));
  const filesToUpload = newFiles.filter((f) => !existingHashes.has(f.hash));

  const jwt = await getUploadToken(accountId, apiToken, projectName);

  if (filesToUpload.length > 0) {
    await uploadFiles(jwt, filesToUpload);
    await upsertHashes(
      jwt,
      filesToUpload.map((f) => f.hash)
    );
  }

  const deploy = await createDeployment(
    accountId,
    apiToken,
    projectName,
    manifest
  );

  const newPathsOnly: Record<string, string> = {};
  for (const f of newFiles) newPathsOnly[f.path] = f.hash;
  await mergeManifest(projectName, newPathsOnly);

  return {
    url: `${baseUrl}/rss.xml`,
    deploy_id: deploy.id,
  };
}
