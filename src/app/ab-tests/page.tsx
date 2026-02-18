import { createServerSupabase } from "@/lib/supabase";
import { ABTest, LANGUAGES } from "@/types";
import ABTestsClient from "./ABTestsClient";

export const dynamic = "force-dynamic";

interface ABTestWithPage extends ABTest {
  pages: { id: string; name: string; slug: string };
}

export default async function ABTestsPage() {
  const db = createServerSupabase();

  const { data: tests, error } = await db
    .from("ab_tests")
    .select(`*, pages (id, name, slug)`)
    .order("updated_at", { ascending: false });

  if (error) {
    return (
      <div className="p-8">
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          Failed to load A/B tests: {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <ABTestsClient
        tests={(tests as ABTestWithPage[]) || []}
        languages={LANGUAGES}
      />
    </div>
  );
}
