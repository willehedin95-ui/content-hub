// Usage: npx tsx scripts/republish-translation.ts <translation_id> [<translation_id>...]
// Republishes one or more landing page translations from the current DB state.
// Use this to push URL patches or HTML fixes live without re-running translation.

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
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error("Usage: npx tsx scripts/republish-translation.ts <translation_id> [<translation_id>...]");
    process.exit(1);
  }

  const { createServerSupabase } = await import("../src/lib/supabase-admin");
  const { publishPage, getProjectCustomDomain } = await import("../src/lib/cloudflare-pages");
  const { optimizeImages } = await import("../src/lib/image-optimizer");
  const { replaceImageUrls } = await import("../src/lib/html-image-replacer");

  const db = createServerSupabase();

  for (const id of ids) {
    console.log(`\n=== Republishing ${id} ===`);
    const { data: translation, error } = await db
      .from("translations")
      .select("*, pages(slug, source_url, custom_head_code, workspace_id, content_type)")
      .eq("id", id)
      .single();

    if (error || !translation) {
      console.error(`  ERROR: translation not found: ${error?.message}`);
      continue;
    }

    const page = translation.pages as { slug: string; custom_head_code?: string; content_type?: string } | null;

    if (!translation.translated_html) {
      console.error(`  ERROR: no translated_html`);
      continue;
    }

    if (page?.content_type === "seo_blog") {
      console.error(`  SKIP: this is a blog article — use republish-blog.ts instead`);
      continue;
    }

    const language = translation.language as "sv" | "da" | "no";
    const slug = (translation.slug as string) || page?.slug || "untitled";
    const slugPrefix = slug;

    console.log(`  Language: ${language}`);
    console.log(`  Slug: ${slug}`);
    console.log(`  HTML length: ${(translation.translated_html as string).length}`);

    let html = translation.translated_html as string;

    // Fix font-display: optional → swap (mirror publish route)
    html = html.replace(/font-display:\s*optional/g, "font-display: swap");

    // Strip editor CSS artifacts (mirror publish route)
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

    // Optimize images (downloads + converts to WebP)
    console.log(`  Optimizing images...`);
    const imageResult = await optimizeImages(html, slugPrefix);

    if (imageResult.stats.errors.length > 0) {
      console.warn(`  Image optimization warnings: ${imageResult.stats.errors.length} errors`);
    }

    // Replace image URLs in HTML with optimized deploy paths
    if (imageResult.urlMap.size > 0) {
      html = replaceImageUrls(html, imageResult.urlMap);
    }

    const additionalFiles = imageResult.images.map((img) => ({
      path: img.deployPath,
      sha1: img.sha1,
      body: img.buffer,
    }));

    console.log(`  Prepared ${additionalFiles.length} image files`);

    // Publish to CF Pages
    console.log(`  Publishing to CF Pages (${language})...`);
    const result = await publishPage(
      html,
      slug,
      language,
      additionalFiles,
      (cur, total) => {
        if (cur % 5 === 0 || cur === total) {
          console.log(`    Upload progress: ${cur}/${total}`);
        }
      },
      undefined, // analytics (skip — already baked in at translation time)
      page?.custom_head_code
    );

    const domain = getProjectCustomDomain(language);
    const publishedUrl = `https://${domain}/${slug}`;

    // Update DB
    await db
      .from("translations")
      .update({
        status: "published",
        published_url: result.url?.trim() || publishedUrl,
        publish_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    console.log(`  ✅ Published: ${publishedUrl}`);
    console.log(`     Deployment ID: ${result.deploy_id ?? "unknown"}`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
