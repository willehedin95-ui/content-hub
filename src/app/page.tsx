import { createServerSupabase } from "@/lib/supabase";
import DashboardClient from "@/components/dashboard/DashboardClient";
import { Page } from "@/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const db = createServerSupabase();
  const { data: pages, error } = await db
    .from("pages")
    .select(`*, translations (id, language, status, published_url, seo_title)`)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="p-8">
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          Failed to load pages: {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <DashboardClient pages={(pages as Page[]) || []} />
    </div>
  );
}
