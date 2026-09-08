/**
 * Publish the expertpanelen.se test page from a locally built HTML file.
 * Mirrors doPublish() in src/app/api/publish/route.ts for a landing page
 * (image optimisation, deploy, sitemap) but runs from the CLI so the page can
 * be shipped without the hub UI. Upserts the pages/translations rows so the
 * page is editable and re-publishable from the hub afterwards.
 *
 * Run: npx tsx scripts/expertpanelen-publish.ts <html-file> <slug> [extraDir]
 *   extraDir: directory whose files are deployed under /redaktion/ (portraits)
 */
process.loadEnvFile?.(".env.local");
export {};
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

async function main() {
  const [htmlFile, slug, extraDir] = process.argv.slice(2);
  if (!htmlFile || !slug) throw new Error("usage: <html-file> <slug> [extraDir]");
  const { publishPage, deploySitemapAndRobots, runWithCfProjectOverride, cfOverrideFromWorkspaceSettings, getProjectName } =
    await import("../src/lib/cloudflare-pages");
  const { optimizeImages } = await import("../src/lib/image-optimizer");
  const { replaceImageUrls } = await import("../src/lib/html-image-replacer");
  const { createServerSupabase } = await import("../src/lib/supabase-admin");
  const db = createServerSupabase();

  const { data: ws, error: wsErr } = await db.from("workspaces").select("id, settings").eq("slug", "expertpanelen").single();
  if (wsErr || !ws) throw new Error(`workspace: ${wsErr?.message}`);
  const override = cfOverrideFromWorkspaceSettings(ws.settings as Record<string, unknown>);
  if (!override) throw new Error("no cf override on workspace");

  let html = readFileSync(htmlFile, "utf8");
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? slug;
  const desc = html.match(/<meta name="description" content="([^"]*)"/i)?.[1] ?? "";

  // ---- upsert pages + translations
  let { data: page } = await db.from("pages").select("id").eq("workspace_id", ws.id).eq("slug", slug).maybeSingle();
  if (!page) {
    const ins = await db.from("pages").insert({
      name: title, product: "collagen-formula", page_type: "listicle", source_url: `https://expertpanelen.se/${slug}/`,
      original_html: html, slug, source_language: "sv", status: "ready", workspace_id: ws.id, content_type: "landing_page", tags: ["expertpanelen"],
    }).select("id").single();
    if (ins.error) throw new Error(`pages insert: ${ins.error.message}`);
    page = ins.data;
  } else {
    await db.from("pages").update({ original_html: html, name: title }).eq("id", page.id);
  }
  let { data: tr } = await db.from("translations").select("id").eq("page_id", page.id).eq("language", "sv").maybeSingle();
  if (!tr) {
    const ins = await db.from("translations").insert({
      page_id: page.id, language: "sv", variant: "control", translated_html: html, seo_title: title, seo_description: desc, slug, status: "publishing", translated_texts: {},
    }).select("id").single();
    if (ins.error) throw new Error(`translations insert: ${ins.error.message}`);
    tr = ins.data;
  } else {
    await db.from("translations").update({ translated_html: html, seo_title: title, seo_description: desc, slug, status: "publishing", publish_error: null }).eq("id", tr.id);
  }
  console.log("page", page.id, "translation", tr.id);

  // ---- same cleanup as doPublish
  html = html.replace(/font-display:\s*optional/g, "font-display: swap");

  const imageResult = await optimizeImages(html, slug);
  console.log("images:", imageResult.stats);
  if (imageResult.urlMap.size > 0) html = replaceImageUrls(html, imageResult.urlMap);
  const additionalFiles = imageResult.images.map((img) => ({ path: img.deployPath, sha1: img.sha1, body: img.buffer }));

  if (extraDir) {
    for (const f of readdirSync(extraDir)) {
      const p = join(extraDir, f); if (!statSync(p).isFile()) continue;
      const body = readFileSync(p);
      additionalFiles.push({ path: `/redaktion/${f}`, sha1: createHash("sha1").update(body).digest("hex"), body });
    }
  }

  await runWithCfProjectOverride(override, async () => {
    console.log("project:", getProjectName("sv"));
    const result = await publishPage(html, slug, "sv", additionalFiles, undefined, {
      shopifyDomains: ["shopenvana.com"], slug, contentType: "landing_page",
    });
    console.log("deploy:", result);
    await db.from("translations").update({
      status: "published", published_url: result.url, published_at: new Date().toISOString(),
      publish_error: result.verification && !result.verification.ok ? `Post-deploy check: ${result.verification.reason}` : null,
      updated_at: new Date().toISOString(),
    }).eq("id", tr!.id);
    try { console.log("sitemap:", await deploySitemapAndRobots("sv")); } catch (e) { console.error("sitemap failed:", (e as Error).message); }
  });
}
main().catch((e) => { console.error(e); process.exit(1); });
