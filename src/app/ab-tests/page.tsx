import { createServerSupabase } from "@/lib/supabase";
import { ABTest, LANGUAGES } from "@/types";
import ABTestsClient from "./ABTestsClient";

export const dynamic = "force-dynamic";

interface ABTestWithPage extends ABTest {
  pages: { id: string; name: string; slug: string };
}

export default async function ABTestsPage() {
  const db = createServerSupabase();

  const { data: tests } = await db
    .from("ab_tests")
    .select(`*, pages (id, name, slug)`)
    .order("updated_at", { ascending: false });

  return (
    <div className="p-8">
      <ABTestsClient
        tests={(tests as ABTestWithPage[]) || []}
        languages={LANGUAGES}
      />
    </div>
  );
}
