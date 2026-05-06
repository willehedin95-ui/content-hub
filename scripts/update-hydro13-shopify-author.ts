/**
 * Backfill: change `author` from "Renew" to "Erik Lindberg" on every
 * existing Hydro13 article on get-renew.com.
 *
 * Future articles already pick up the new author via the workspace setting
 * (shopify_blog_author = "Erik Lindberg"). This script handles the 28 already
 * published.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(__dirname, "../.env.local");
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  const k = t.slice(0, i);
  let v = t.slice(i + 1);
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) v = v.slice(1, -1).replace(/\\n/g, "\n");
  if (!process.env[k]) process.env[k] = v;
}

async function main() {
  const { getShopifyCredsForWorkspace } = await import("../src/lib/shopify");
  const { getAccessTokenForCreds } = await import("../src/lib/shopify");

  const HYDRO13 = "6a18a542-4e8a-4d51-bc56-afd49fd1d9b7";
  const creds = await getShopifyCredsForWorkspace(HYDRO13);
  if (!creds) throw new Error("No creds");
  const token = await getAccessTokenForCreds(creds);

  // List articles in the kollagen blog
  const blogsRes = await fetch(`${creds.storeUrl}/admin/api/2024-01/blogs.json`, {
    headers: { "X-Shopify-Access-Token": token },
  });
  const blogs = (await blogsRes.json()).blogs as Array<{ id: number; handle: string }>;
  const blog = blogs.find((b) => b.handle === "kollagen");
  if (!blog) throw new Error("kollagen blog not found");

  const articlesRes = await fetch(
    `${creds.storeUrl}/admin/api/2024-01/blogs/${blog.id}/articles.json?limit=250`,
    { headers: { "X-Shopify-Access-Token": token } }
  );
  const articles = (await articlesRes.json()).articles as Array<{
    id: number;
    title: string;
    handle: string;
    author: string;
  }>;

  console.log(`Found ${articles.length} articles in ${blog.handle}`);

  const TARGET = "Erik Lindberg";
  let updated = 0;
  let skipped = 0;
  for (const a of articles) {
    if (a.author === TARGET) {
      skipped++;
      continue;
    }
    const res = await fetch(
      `${creds.storeUrl}/admin/api/2024-01/blogs/${blog.id}/articles/${a.id}.json`,
      {
        method: "PUT",
        headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ article: { id: a.id, author: TARGET } }),
      }
    );
    if (!res.ok) {
      console.log(`  ✗ ${a.handle}  ${res.status} ${(await res.text()).slice(0, 100)}`);
      continue;
    }
    updated++;
    console.log(`  ✓ ${a.handle}  (was: ${a.author})`);
    // Be polite with Shopify rate limits (40 req/sec hard cap, 2/sec sustained)
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`\nDone: ${updated} updated, ${skipped} already correct`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
