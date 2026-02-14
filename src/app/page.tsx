import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase";
import PagesTable from "@/components/dashboard/PagesTable";
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
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            Manage and translate your advertorials & listicles
          </p>
        </div>
        <Link
          href="/import"
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <PlusCircle className="w-4 h-4" />
          Import New Page
        </Link>
      </div>

      <PagesTable pages={(pages as Page[]) || []} />
    </div>
  );
}
