import { createServerSupabase } from "@/lib/supabase";
import MetaAdsPage from "@/components/meta-ads/MetaAdsPage";

export const dynamic = "force-dynamic";

export default async function MetaAdsRoute() {
  const db = createServerSupabase();

  const { data: campaigns, error } = await db
    .from("meta_campaigns")
    .select("*, meta_ads(*)")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="p-8">
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          Failed to load campaigns: {error.message}
        </p>
      </div>
    );
  }

  return <MetaAdsPage initialCampaigns={campaigns ?? []} />;
}
