/**
 * Delete specific Renew blog articles from Shopify (get-renew.com).
 *
 * Use: npx tsx scripts/delete-renew-blog-articles.ts
 *
 * Slugs to delete are hardcoded below. Updates blog_content_plan to status='deferred'
 * and removes the corresponding pages/translations rows so autopilot won't re-publish.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local before importing modules that read process.env
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  let value = trimmed.slice(eqIdx + 1);
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  if (!process.env[key]) process.env[key] = value;
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createServerSupabase } = require("@/lib/supabase-admin");
const { getShopifyCredsForWorkspace, getAccessTokenForCreds } = require("@/lib/shopify");
const { findBlogByHandle, findArticleByHandle } = require("@/lib/shopify-blog");

const HYDRO13_WORKSPACE_ID = "6a18a542-4e8a-4d51-bc56-afd49fd1d9b7";
const BLOG_HANDLE = "kollagen";
const SLUGS_TO_DELETE = ["kollagen-gravid", "kollagen-leder"];
const API_VERSION = "2024-01";

async function deleteArticle(
  storeUrl: string,
  token: string,
  blogId: number,
  articleId: number
): Promise<void> {
  const url = `${storeUrl}/admin/api/${API_VERSION}/blogs/${blogId}/articles/${articleId}.json`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { "X-Shopify-Access-Token": token },
  });
  if (!res.ok) {
    throw new Error(`Delete article ${articleId} failed (${res.status}): ${await res.text()}`);
  }
}

async function main() {
  const creds = await getShopifyCredsForWorkspace(HYDRO13_WORKSPACE_ID);
  if (!creds) throw new Error("No Shopify creds for Hydro13 workspace");

  const token = await getAccessTokenForCreds(creds);
  const blog = await findBlogByHandle(creds, BLOG_HANDLE);
  if (!blog) throw new Error(`Blog "${BLOG_HANDLE}" not found`);

  console.log(`[delete] Blog "${BLOG_HANDLE}" id=${blog.id}`);

  const db = createServerSupabase();

  for (const slug of SLUGS_TO_DELETE) {
    console.log(`\n[delete] Processing "${slug}"...`);

    // 1. Find article on Shopify
    const article = await findArticleByHandle(creds, blog.id, slug);
    if (article) {
      await deleteArticle(creds.storeUrl, token, blog.id, article.id);
      console.log(`  Shopify article ${article.id} deleted`);
    } else {
      console.log(`  Shopify article not found (already deleted?)`);
    }

    // 2. Get plan + page rows
    const { data: plan } = await db
      .from("blog_content_plan")
      .select("id, page_id")
      .eq("slug", slug)
      .eq("language", "sv")
      .single();

    if (!plan) {
      console.log(`  No content_plan row for ${slug} — skipping DB cleanup`);
      continue;
    }

    // 3. Mark plan as deferred and clear page_id (so re-attempting won't be blocked by FK)
    await db
      .from("blog_content_plan")
      .update({
        status: "deferred",
        page_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", plan.id);
    console.log(`  blog_content_plan -> deferred`);

    // 4. Delete translations + page (cascades clean)
    if (plan.page_id) {
      await db.from("translations").delete().eq("page_id", plan.page_id);
      await db.from("pages").delete().eq("id", plan.page_id);
      console.log(`  pages + translations rows deleted (page_id=${plan.page_id})`);
    }
  }

  console.log(`\n[delete] Done.`);
}

main().catch((err) => {
  console.error("[delete] Fatal:", err);
  process.exit(1);
});
