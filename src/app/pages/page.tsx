import { createServerSupabase } from "@/lib/supabase";
import DashboardClient from "@/components/dashboard/DashboardClient";
import ABTestsClient from "@/app/ab-tests/ABTestsClient";
import SwiperClient from "@/components/swiper/SwiperClient";
import PagesTabBar from "@/components/pages/PagesTabBar";
import { Page, ABTest, LANGUAGES } from "@/types";

export const dynamic = "force-dynamic";

export default async function LandingPagesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const db = createServerSupabase();

  if (tab === "ab-tests") {
    const { data: tests, error } = await db
      .from("ab_tests")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      return (
        <div className="p-8">
          <PagesTabBar activeTab="ab-tests" />
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            Failed to load A/B tests: {error.message}
          </p>
        </div>
      );
    }

    return (
      <div className="p-8">
        <PagesTabBar activeTab="ab-tests" />
        <ABTestsClient tests={(tests as ABTest[]) || []} languages={LANGUAGES} />
      </div>
    );
  }

  if (tab === "swipe") {
    const { data: products } = await db
      .from("products")
      .select("id, slug, name, product_images(*)")
      .order("created_at", { ascending: true });

    return (
      <div className="p-8">
        <PagesTabBar activeTab="swipe" />
        <SwiperClient products={products ?? []} />
      </div>
    );
  }

  // Default: pages tab
  const { data: pages, error } = await db
    .from("pages")
    .select(`*, translations (id, language, status, published_url, seo_title)`)
    .order("created_at", { ascending: false });

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
      <DashboardClient pages={(pages as Page[]) || []} />
    </div>
  );
}
