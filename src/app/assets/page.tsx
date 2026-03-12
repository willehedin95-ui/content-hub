import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";
import type { Asset } from "@/types";
import AssetManager from "@/components/assets/AssetManager";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const { data } = await db
    .from("assets")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  return <AssetManager initialAssets={(data as Asset[]) ?? []} />;
}
