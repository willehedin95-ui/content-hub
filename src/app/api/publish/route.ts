import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { publishPage } from "@/lib/cloudflare-pages";
import { optimizeImages } from "@/lib/image-optimizer";
import { replaceImageUrls } from "@/lib/html-image-replacer";
import { Language } from "@/types";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { translation_id } = await req.json();

  if (!translation_id) {
    return NextResponse.json(
      { error: "translation_id is required" },
      { status: 400 }
    );
  }

  if (!process.env.CF_PAGES_ACCOUNT_ID || !process.env.CF_PAGES_API_TOKEN) {
    return NextResponse.json(
      { error: "Cloudflare Pages not configured. Set CF_PAGES_ACCOUNT_ID and CF_PAGES_API_TOKEN." },
      { status: 500 }
    );
  }

  const db = createServerSupabase();

  // Fetch translation + page
  const { data: translation, error: tError } = await db
    .from("translations")
    .select(`*, pages (slug, source_url)`)
    .eq("id", translation_id)
    .single();

  if (tError || !translation) {
    return NextResponse.json(
      { error: "Translation not found" },
      { status: 404 }
    );
  }

  if (!translation.translated_html) {
    return NextResponse.json(
      { error: "Translation has no HTML content. Translate first." },
      { status: 400 }
    );
  }

  const projectKey = `CF_PAGES_PROJECT_${translation.language.toUpperCase()}`;
  if (!process.env[projectKey]) {
    return NextResponse.json(
      { error: `Cloudflare Pages project not configured for language: ${translation.language}. Set ${projectKey}.` },
      { status: 500 }
    );
  }

  // Mark as publishing
  await db
    .from("translations")
    .update({ status: "publishing", updated_at: new Date().toISOString() })
    .eq("id", translation_id);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      }

      try {
        let html = translation.translated_html as string;
        const language = translation.language as Language;
        const slug = translation.slug || translation.pages.slug;
        const slugPrefix = slug;

        // Optimize images with progress
        send({ step: "images", current: 0, total: 0, message: "Scanning for images…" });

        const imageResult = await optimizeImages(html, slugPrefix, (current, total, detail) => {
          send({ step: "images", current, total, message: `${current}/${total} compressed (${detail})` });
        });

        if (imageResult.stats.errors.length > 0) {
          console.warn(`[publish] Image optimization errors:`, imageResult.stats.errors);
        }

        // Replace image URLs in HTML with optimized deploy paths
        if (imageResult.urlMap.size > 0) {
          html = replaceImageUrls(html, imageResult.urlMap);
        }

        // Build additional files for deploy
        const additionalFiles = imageResult.images.map((img) => ({
          path: img.deployPath,
          sha1: img.sha1,
          body: img.buffer,
        }));

        send({ step: "deploy", message: "Deploying to Cloudflare Pages…" });

        const result = await publishPage(
          html,
          slug,
          language,
          additionalFiles,
          (current, total) => {
            send({ step: "upload", current, total, message: `Uploading ${current}/${total} files…` });
          }
        );

        const { data: updated, error: updateError } = await db
          .from("translations")
          .update({
            status: "published",
            published_url: result.url,
            updated_at: new Date().toISOString(),
          })
          .eq("id", translation_id)
          .select()
          .single();

        if (updateError) throw new Error(updateError.message);

        send({ step: "done", url: result.url, data: updated });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Publish failed";

        await db
          .from("translations")
          .update({ status: "translated", updated_at: new Date().toISOString() })
          .eq("id", translation_id);

        send({ step: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
