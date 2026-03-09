import { createServerSupabase } from "@/lib/supabase";
import type { Asset } from "@/types";
import AssetManager from "@/components/assets/AssetManager";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const db = createServerSupabase();
  const { data } = await db
    .from("assets")
    .select("*")
    .order("created_at", { ascending: false });

  return <AssetManager initialAssets={(data as Asset[]) ?? []} />;
}
