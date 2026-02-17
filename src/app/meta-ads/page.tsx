import { createServerSupabase } from "@/lib/supabase";
import MetaAdsPage from "@/components/meta-ads/MetaAdsPage";

export const dynamic = "force-dynamic";

export default async function MetaAdsRoute() {
  const db = createServerSupabase();

  const { data: campaigns } = await db
    .from("meta_campaigns")
    .select("*, meta_ads(*)")
    .order("created_at", { ascending: false });

  return <MetaAdsPage initialCampaigns={campaigns ?? []} />;
}
