import { createServerSupabase } from "@/lib/supabase";
import DashboardClient from "@/components/dashboard/DashboardClient";
import { Page } from "@/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const db = createServerSupabase();
  const { data: pages } = await db
    .from("pages")
    .select(`*, translations (id, language, status, published_url, seo_title)`)
    .order("created_at", { ascending: false });

  return (
    <div className="p-8">
      <DashboardClient pages={(pages as Page[]) || []} />
    </div>
  );
}
