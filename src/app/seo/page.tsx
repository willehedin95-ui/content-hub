import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId, getWorkspaceSettings } from "@/lib/workspace";
import SeoTabBar, { type SeoTab } from "@/components/seo/SeoTabBar";
import SeoDashboard from "@/components/seo/SeoDashboard";
import GapKeywords from "@/components/seo/GapKeywords";
import SeoSettings from "@/components/seo/SeoSettings";
import type { GscProperty } from "@/types";

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

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-2">
        <h1 className="text-2xl font-semibold text-gray-900">SEO</h1>
        <p className="text-sm text-gray-500 mt-1">
          Track your organic search performance and find opportunities to rank higher on Google.
        </p>
      </div>

      <SeoTabBar activeTab={activeTab} />

      {activeTab === "dashboard" && <SeoDashboard />}
      {activeTab === "gap-keywords" && <GapKeywords />}
      {activeTab === "settings" && <SeoSettings initialProperties={gscProperties} />}
    </div>
  );
}
