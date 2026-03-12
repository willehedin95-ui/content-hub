import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";
import { isValidUUID } from "@/lib/validation";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  if (!isValidUUID(jobId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { data: job } = await db
    .from("image_jobs")
    .select("landing_page_id, ab_test_id, product")
    .eq("id", jobId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get landing page URLs per language
  const landingPageUrls: Record<string, string> = {};
  if (job.landing_page_id) {
    const { data: translations } = await db
      .from("translations")
      .select("language, published_url")
      .eq("page_id", job.landing_page_id)
      .eq("status", "published")
      .not("published_url", "is", null);

    for (const t of translations ?? []) {
      landingPageUrls[t.language] = t.published_url;
    }
  }

  // Override with AB test router URL for its language
  if (job.ab_test_id) {
    const { data: abTest } = await db
      .from("ab_tests")
      .select("language, router_url")
      .eq("id", job.ab_test_id)
      .single();

    if (abTest?.router_url) {
      landingPageUrls[abTest.language] = abTest.router_url;
    }
  }

  // Get campaign mappings for this product
  let campaignMappings: Array<Record<string, unknown>> = [];
  if (job.product) {
    const { data } = await db
      .from("meta_campaign_mappings")
      .select("*")
      .eq("product", job.product);
    campaignMappings = data ?? [];
  }

  // Get page configs
  const { data: pageConfigs } = await db
    .from("meta_page_config")
    .select("*")
    .order("country");

  return NextResponse.json({
    landingPageUrls,
    campaignMappings,
    pageConfigs: pageConfigs ?? [],
  });
}
