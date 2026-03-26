import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId, getWorkspaceSettings } from "@/lib/workspace";
import SeoTabBar, { type SeoTab } from "@/components/seo/SeoTabBar";
import SeoDashboard from "@/components/seo/SeoDashboard";
import GapKeywords from "@/components/seo/GapKeywords";
import SeoSettings from "@/components/seo/SeoSettings";
import BlogPagesClient from "@/components/pages/BlogPagesClient";
import ContentPlanClient from "@/components/seo/ContentPlanClient";
import PageSpeed from "@/components/seo/PageSpeed";
import type { GscProperty, Page } from "@/types";

export const dynamic = "force-dynamic";

export default async function SeoPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab: SeoTab = (tab as SeoTab) || "dashboard";
  const settings = await getWorkspaceSettings();
  const gscProperties: GscProperty[] = (settings?.gsc_properties as GscProperty[]) ?? [];

  // Only fetch blog data when on the articles tab
  let blogPages: Page[] = [];
  if (activeTab === "articles") {
    const db = createServerSupabase();
    const workspaceId = await getWorkspaceId();
    const { data } = await db
      .from("pages")
      .select(`*, translations (id, language, status, published_url, seo_title)`)
      .eq("workspace_id", workspaceId)
      .eq("content_type", "seo_blog")
      .order("created_at", { ascending: false });
    blogPages = (data as Page[]) ?? [];
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-2">
        <h1 className="text-2xl font-semibold text-gray-900">SEO</h1>
        <p className="text-sm text-gray-500 mt-1">
          Track your organic search performance, manage blog articles, and find opportunities to rank higher on Google.
        </p>
      </div>

      <SeoTabBar activeTab={activeTab} />

      {activeTab === "dashboard" && <SeoDashboard />}
      {activeTab === "articles" && <BlogPagesClient pages={blogPages} />}
      {activeTab === "content-plan" && <ContentPlanClient />}
      {activeTab === "gap-keywords" && <GapKeywords />}
      {activeTab === "speed" && <PageSpeed />}
      {activeTab === "settings" && <SeoSettings initialProperties={gscProperties} />}
    </div>
  );
}
