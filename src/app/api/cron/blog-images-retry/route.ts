import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { generateBlogImagesAndRepublish } from "@/lib/blog-autopilot";

export const maxDuration = 800;

/**
 * Self-healing cron: find blog articles that still have placeholder images
 * (because after() timed out on Vercel Hobby) and regenerate them.
 * Processes 1 article per run to stay within 300s limit.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();

  // Find published blog articles that still have placeholder images
  const { data: articles } = await db
    .from("translations")
    .select(`
      id,
      translated_html,
      language,
      page_id,
      pages!inner (
        id,
        slug,
        blog_category,
        workspace_id,
        content_type
      )
    `)
    .eq("status", "published")
    .eq("pages.content_type", "seo_blog")
    .like("translated_html", "%placehold.co%")
    .order("created_at", { ascending: false })
    .limit(1);

  if (!articles?.length) {
    return NextResponse.json({
      ok: true,
      action: "none",
      message: "No articles with placeholder images found",
    });
  }

  const article = articles[0];
  const page = article.pages as unknown as {
    id: string;
    slug: string;
    blog_category: string;
    workspace_id: string;
  };

  // Get content plan data for keyword/brief
  const { data: plan } = await db
    .from("blog_content_plan")
    .select("primary_keyword, content_brief")
    .eq("page_id", page.id)
    .maybeSingle();

  console.log(`[blog-images-retry] Generating images for "${page.slug}"...`);

  try {
    await generateBlogImagesAndRepublish({
      translationId: article.id,
      pageId: page.id,
      articleTitle: page.slug,
      primaryKeyword: plan?.primary_keyword || page.slug,
      contentBrief: plan?.content_brief || "",
      category: page.blog_category || "Halsa",
      slug: page.slug,
      language: article.language,
      workspaceId: page.workspace_id,
      articleHtml: article.translated_html,
    });

    return NextResponse.json({
      ok: true,
      action: "generated",
      slug: page.slug,
      message: `Generated images for "${page.slug}"`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image generation failed";
    console.error(`[blog-images-retry] Failed for "${page.slug}":`, message);
    return NextResponse.json({
      ok: true,
      action: "error",
      slug: page.slug,
      message,
    });
  }
}
