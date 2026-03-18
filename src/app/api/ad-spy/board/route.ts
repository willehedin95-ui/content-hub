import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";
import { getBoardAds, getBoards, filterImageAds, getImageUrls, type GethookdAd } from "@/lib/gethookd";

export async function GET(req: NextRequest) {
  const workspaceId = await getWorkspaceId();
  const db = createServerSupabase();

  const boardId = req.nextUrl.searchParams.get("board_id");
  const page = parseInt(req.nextUrl.searchParams.get("page") ?? "1");
  const perPage = parseInt(req.nextUrl.searchParams.get("per_page") ?? "50");

  try {
    // If no board_id provided, get boards list
    if (!boardId) {
      const boards = await getBoards();
      return NextResponse.json({ boards });
    }

    // Fetch board ads from GetHookd
    const { ads: rawAds, total } = await getBoardAds(boardId, page, perPage);
    const imageAds = filterImageAds(rawAds);

    // Cross-reference with discovered_ads to get swipe status
    const gethookdIds = imageAds.map((a) => a.id);
    const { data: discovered } = await db
      .from("discovered_ads")
      .select("gethookd_ad_id, status, image_job_id")
      .eq("workspace_id", workspaceId)
      .in("gethookd_ad_id", gethookdIds.length > 0 ? gethookdIds : [-1]);

    const statusMap = new Map(
      (discovered ?? []).map((d) => [d.gethookd_ad_id, { status: d.status, image_job_id: d.image_job_id }])
    );

    const ads = imageAds.map((ad: GethookdAd) => ({
      id: ad.id,
      external_id: ad.external_id,
      title: ad.title,
      body: ad.body,
      landing_page: ad.landing_page,
      display_format: ad.display_format,
      days_active: ad.days_active,
      performance_score: ad.performance_score,
      performance_score_title: ad.performance_score_title,
      brand_name: ad.brand.name,
      brand_logo: ad.brand.logo_url,
      image_urls: getImageUrls(ad),
      thumbnail_url: ad.media[0]?.thumbnail_url ?? ad.media[0]?.url,
      swipe_status: statusMap.get(ad.id)?.status ?? null,
      image_job_id: statusMap.get(ad.id)?.image_job_id ?? null,
    }));

    const unswipedCount = ads.filter((a) => !a.swipe_status).length;

    return NextResponse.json({ ads, total, unswiped_count: unswipedCount });
  } catch (err) {
    console.error("[ad-spy/board] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
