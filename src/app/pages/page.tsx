import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";
import DashboardClient from "@/components/dashboard/DashboardClient";
import PageTestsClient from "@/components/pages/PageTestsClient";
import SwiperClient from "@/components/swiper/SwiperClient";
import PagesTabBar from "@/components/pages/PagesTabBar";
import { Page } from "@/types";

export const dynamic = "force-dynamic";

export default async function LandingPagesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  if (tab === "ab-tests") {
    return (
      <div className="p-8">
        <PagesTabBar activeTab="ab-tests" />
        <PageTestsClient />
      </div>
    );
  }

  if (tab === "swipe") {
    const { data: products } = await db
      .from("products")
      .select("id, slug, name, product_images(*)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });

    return (
      <div className="p-8">
        <PagesTabBar activeTab="swipe" />
        <SwiperClient products={products ?? []} />
      </div>
    );
  }

  // Default: pages tab
  const [{ data: pages, error }, { data: completedTests }] = await Promise.all([
    db
      .from("pages")
      .select(`*, translations (id, language, status, published_url, seo_title)`)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
    db
      .from("page_tests")
      .select("page_a_id, page_b_id, winner_page_id, status")
      .eq("workspace_id", workspaceId),
  ]);

  // Build win/loss records per page
  const testRecords: Record<string, { wins: number; losses: number; active: number }> = {};
  for (const t of completedTests ?? []) {
    for (const pageId of [t.page_a_id, t.page_b_id]) {
      if (!testRecords[pageId]) testRecords[pageId] = { wins: 0, losses: 0, active: 0 };
    }
    if (t.status === "active") {
      testRecords[t.page_a_id].active++;
      testRecords[t.page_b_id].active++;
    } else if (t.winner_page_id) {
      const loserId = t.winner_page_id === t.page_a_id ? t.page_b_id : t.page_a_id;
      testRecords[t.winner_page_id].wins++;
      testRecords[loserId].losses++;
    }
  }

  if (error) {
    return (
      <div className="p-8">
        <PagesTabBar activeTab="pages" />
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          Failed to load pages: {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <PagesTabBar activeTab="pages" />
      <DashboardClient pages={(pages as Page[]) || []} testRecords={testRecords} />
    </div>
  );
}
