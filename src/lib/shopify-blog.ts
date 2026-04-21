/**
 * Shopify Blog Admin API integration.
 *
 * Creates/updates blog articles on a Shopify store and uploads inline images
 * to the Shopify Files API so everything lives on the store's CDN. Used by
 * the Hydro13 autopilot (get-renew.com) and the halsobladet -> get-renew
 * migration script.
 *
 * Auth: uses the same `ShopifyCreds` as the order-import flow via
 * `getAccessToken` (cached 24h). See `src/lib/shopify.ts`.
 */

import { getAccessTokenForCreds, type ShopifyCreds } from "./shopify";

type ShopifyArticle = {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  summary_html?: string | null;
  author: string;
  tags?: string;
  image?: { src: string } | null;
  published: boolean;
  published_at?: string;
  created_at?: string;
  updated_at?: string;
};

type ShopifyBlog = {
  id: number;
  handle: string;
  title: string;
};

export type ArticleInput = {
  title: string;
  handle: string;
  bodyHtml: string;
  summaryHtml?: string;
  author?: string;
  tags?: string[];
  /** External image URL — Shopify will download and host on its CDN. */
  imageSrc?: string;
  /** Backdate so the URL feels stable rather than "just created". */
  publishedAt?: string;
  published?: boolean;
};

const API_VERSION = "2024-01";

// ---------------------------------------------------------------------------
// Blog operations
// ---------------------------------------------------------------------------

export async function listBlogs(creds: ShopifyCreds): Promise<ShopifyBlog[]> {
  const token = await getAccessTokenForCreds(creds);
  const res = await fetch(`${creds.storeUrl}/admin/api/${API_VERSION}/blogs.json`, {
    headers: { "X-Shopify-Access-Token": token },
  });
  if (!res.ok) throw new Error(`List blogs failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { blogs: ShopifyBlog[] };
  return data.blogs;
}

export async function findBlogByHandle(
  creds: ShopifyCreds,
  handle: string
): Promise<ShopifyBlog | null> {
  const blogs = await listBlogs(creds);
  return blogs.find((b) => b.handle === handle) ?? null;
}

// ---------------------------------------------------------------------------
// Article operations
// ---------------------------------------------------------------------------

export async function findArticleByHandle(
  creds: ShopifyCreds,
  blogId: number,
  handle: string
): Promise<ShopifyArticle | null> {
  const token = await getAccessTokenForCreds(creds);
  const url = `${creds.storeUrl}/admin/api/${API_VERSION}/blogs/${blogId}/articles.json?handle=${encodeURIComponent(handle)}`;
  const res = await fetch(url, { headers: { "X-Shopify-Access-Token": token } });
  if (!res.ok) throw new Error(`Find article failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { articles: ShopifyArticle[] };
  return data.articles?.[0] ?? null;
}

export async function createArticle(
  creds: ShopifyCreds,
  blogId: number,
  input: ArticleInput
): Promise<ShopifyArticle> {
  const token = await getAccessTokenForCreds(creds);
  const payload: { article: Record<string, unknown> } = {
    article: {
      title: input.title,
      handle: input.handle,
      author: input.author ?? "Renew",
      body_html: input.bodyHtml,
      summary_html: input.summaryHtml ?? "",
      tags: (input.tags ?? []).join(", "),
      published: input.published !== false,
      ...(input.publishedAt ? { published_at: input.publishedAt } : {}),
      ...(input.imageSrc ? { image: { src: input.imageSrc } } : {}),
    },
  };
  const res = await fetch(
    `${creds.storeUrl}/admin/api/${API_VERSION}/blogs/${blogId}/articles.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) throw new Error(`Create article failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { article: ShopifyArticle };
  return data.article;
}

export async function updateArticle(
  creds: ShopifyCreds,
  blogId: number,
  articleId: number,
  input: Partial<ArticleInput>
): Promise<ShopifyArticle> {
  const token = await getAccessTokenForCreds(creds);
  const article: Record<string, unknown> = { id: articleId };
  if (input.title !== undefined) article.title = input.title;
  if (input.handle !== undefined) article.handle = input.handle;
  if (input.author !== undefined) article.author = input.author;
  if (input.bodyHtml !== undefined) article.body_html = input.bodyHtml;
  if (input.summaryHtml !== undefined) article.summary_html = input.summaryHtml;
  if (input.tags !== undefined) article.tags = input.tags.join(", ");
  if (input.imageSrc !== undefined) article.image = { src: input.imageSrc };
  if (input.publishedAt !== undefined) article.published_at = input.publishedAt;
  if (input.published !== undefined) article.published = input.published;

  const res = await fetch(
    `${creds.storeUrl}/admin/api/${API_VERSION}/blogs/${blogId}/articles/${articleId}.json`,
    {
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ article }),
    }
  );
  if (!res.ok) throw new Error(`Update article failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { article: ShopifyArticle };
  return data.article;
}

/**
 * Upsert an article by handle: update if exists, create if not.
 * Used by the migration script to be safely re-runnable.
 */
export async function upsertArticle(
  creds: ShopifyCreds,
  blogId: number,
  input: ArticleInput
): Promise<{ article: ShopifyArticle; created: boolean }> {
  const existing = await findArticleByHandle(creds, blogId, input.handle);
  if (existing) {
    const article = await updateArticle(creds, blogId, existing.id, input);
    return { article, created: false };
  }
  const article = await createArticle(creds, blogId, input);
  return { article, created: true };
}

// ---------------------------------------------------------------------------
// File upload (Shopify Files API, for hosting inline article images)
// ---------------------------------------------------------------------------

/**
 * Upload a remote image URL to Shopify Files via GraphQL staged uploads.
 *
 * Flow (Shopify Admin GraphQL):
 *   1. `stagedUploadsCreate` — get a signed S3-like URL to PUT the bytes
 *   2. Fetch the source image, stream it to the staged target
 *   3. `fileCreate` with the staged resource URL → creates the File asset
 *   4. Poll `node(id:...)` on the File until status=READY to learn the CDN URL
 *
 * Returns the stable `https://cdn.shopify.com/...` URL that can be used in
 * article body HTML.
 */
export async function uploadImageFromUrl(
  creds: ShopifyCreds,
  sourceUrl: string,
  filename: string,
  options: { optimize?: boolean } = { optimize: true }
): Promise<string> {
  const token = await getAccessTokenForCreds(creds);
  const gqlUrl = `${creds.storeUrl}/admin/api/${API_VERSION}/graphql.json`;

  // Download source
  const downloadRes = await fetch(sourceUrl);
  if (!downloadRes.ok) {
    throw new Error(`Download ${sourceUrl} failed (${downloadRes.status})`);
  }
  let buffer = Buffer.from(await downloadRes.arrayBuffer());
  let mimeType = downloadRes.headers.get("content-type") || guessMime(filename);
  let finalFilename = filename;

  // Pre-optimize: convert to WebP @ max 1920px width. Kie AI emits 1920x1080
  // PNGs that are ~5-8MB each. Shopify's CDN auto-serves WebP to browsers that
  // accept it, but the SOURCE file still consumes storage + gets served in
  // full to older clients. Compressing here gets us ~30x smaller stored files
  // (5.88MB → ~200KB).
  if (options.optimize && !mimeType.includes("svg")) {
    try {
      const sharp = (await import("sharp")).default;
      const optimized = await sharp(buffer)
        .resize({ width: 1920, withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toBuffer();
      buffer = Buffer.from(optimized);
      mimeType = "image/webp";
      finalFilename = filename.replace(/\.(png|jpg|jpeg|gif)$/i, ".webp");
      if (!finalFilename.endsWith(".webp")) finalFilename += ".webp";
    } catch (err) {
      // Optimization failure is non-fatal — fall back to raw upload
      console.warn(`[shopify-blog] optimize failed for ${filename}, uploading raw:`, err);
    }
  }

  // Step 1: stagedUploadsCreate
  const stagedMutation = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }
  `;
  const stagedInput = [
    {
      resource: "FILE",
      filename: finalFilename,
      mimeType,
      httpMethod: "POST",
      fileSize: String(buffer.length),
    },
  ];

  type StagedTarget = { url: string; resourceUrl: string; parameters: Array<{ name: string; value: string }> };
  type StagedResp = { stagedTargets?: StagedTarget[]; userErrors?: Array<{ field: string; message: string }> };
  const stagedRes = await gql(gqlUrl, token, stagedMutation, { input: stagedInput });
  const stagedData = stagedRes.data?.stagedUploadsCreate as StagedResp | undefined;
  if (!stagedData || stagedData.userErrors?.length) {
    throw new Error(
      `stagedUploadsCreate errors: ${JSON.stringify(stagedData?.userErrors ?? stagedRes)}`
    );
  }
  const target = stagedData.stagedTargets?.[0];
  if (!target) throw new Error("No staged target returned");

  // Step 2: POST bytes to staged URL with provided multipart parameters
  const form = new FormData();
  for (const p of target.parameters) {
    form.append(p.name, p.value);
  }
  // Shopify's S3-compatible bucket requires file last in the form
  form.append("file", new Blob([buffer], { type: mimeType }), finalFilename);

  const putRes = await fetch(target.url, { method: "POST", body: form });
  if (!putRes.ok) {
    throw new Error(`Upload to staged target failed (${putRes.status}): ${await putRes.text()}`);
  }

  // Step 3: fileCreate with the staged resource URL
  const fileCreateMutation = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id fileStatus alt }
        userErrors { field message }
      }
    }
  `;
  type FileCreateResp = {
    files?: Array<{ id: string; fileStatus: string; alt: string | null }>;
    userErrors?: Array<{ field: string; message: string }>;
  };
  const fileCreateRes = await gql(gqlUrl, token, fileCreateMutation, {
    files: [{ originalSource: target.resourceUrl, contentType: "IMAGE" }],
  });
  const fileCreateData = fileCreateRes.data?.fileCreate as FileCreateResp | undefined;
  if (!fileCreateData || fileCreateData.userErrors?.length) {
    throw new Error(
      `fileCreate errors: ${JSON.stringify(fileCreateData?.userErrors ?? fileCreateRes)}`
    );
  }
  const fileId = fileCreateData.files?.[0]?.id;
  if (!fileId) throw new Error("No file id returned from fileCreate");

  // Step 4: poll until READY and get the CDN URL
  return await pollFileUntilReady(gqlUrl, token, fileId);
}

async function pollFileUntilReady(
  gqlUrl: string,
  token: string,
  fileId: string,
  maxAttempts = 20,
  delayMs = 1000
): Promise<string> {
  const query = `
    query fileNode($id: ID!) {
      node(id: $id) {
        ... on MediaImage {
          id
          fileStatus
          image { url }
        }
        ... on GenericFile {
          id
          fileStatus
          url
        }
      }
    }
  `;
  type FileNode = { id: string; fileStatus: string; image?: { url: string }; url?: string };
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await gql(gqlUrl, token, query, { id: fileId });
    const node = res.data?.node as FileNode | undefined;
    if (node?.fileStatus === "READY") {
      const url = node.image?.url || node.url;
      if (url) return url;
    }
    if (node?.fileStatus === "FAILED") {
      throw new Error(`File processing failed: ${JSON.stringify(node)}`);
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`File ${fileId} did not reach READY within ${maxAttempts * delayMs}ms`);
}

async function gql(
  url: string,
  token: string,
  query: string,
  variables: Record<string, unknown>
): Promise<{ data?: Record<string, unknown>; errors?: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(json.errors || json)}`);
  }
  return json as { data?: Record<string, unknown> };
}

function guessMime(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}
