import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET() {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await db
    .from("page_tests")
    .select(`
      *,
      image_jobs!inner(id, name, product, concept_number, source_images(original_url)),
      page_a:pages!page_tests_page_a_id_fkey(id, name, slug, thumbnail_url),
      page_b:pages!page_tests_page_b_id_fkey(id, name, slug, thumbnail_url),
      page_test_adsets(id, variant, meta_adset_id, language, country)
    `)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    return safeError(error, "Failed to fetch page tests");
  }

  // Group by (page_a_id, page_b_id) pair
  const groupMap = new Map<string, {
    groupKey: string;
    page_a: { id: string; name: string; slug: string; thumbnail_url: string | null };
    page_b: { id: string; name: string; slug: string; thumbnail_url: string | null };
    status: "active" | "completed";
    winner_page_id: string | null;
    tests: Array<{
      id: string;
      name: string;
      status: string;
      image_jobs: { id: string; name: string; product: string; concept_number: number | null; source_images: Array<{ original_url: string }> };
      created_at: string;
    }>;
    concept_count: number;
    markets: string[];
    earliest_created_at: string;
  }>();

  for (const test of data ?? []) {
    const key = `${test.page_a_id}::${test.page_b_id}`;

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        groupKey: key,
        page_a: test.page_a,
        page_b: test.page_b,
        status: "completed",
        winner_page_id: null,
        tests: [],
        concept_count: 0,
        markets: [],
        earliest_created_at: test.created_at,
      });
    }

    const group = groupMap.get(key)!;

    // Group is active if ANY test is active
    if (test.status === "active") {
      group.status = "active";
    }

    // Pick winner from any completed test (all share same winner after group declaration)
    if (test.winner_page_id) {
      group.winner_page_id = test.winner_page_id;
    }

    // Track earliest created_at
    if (test.created_at < group.earliest_created_at) {
      group.earliest_created_at = test.created_at;
    }

    // Collect unique markets from ad sets
    for (const adset of test.page_test_adsets ?? []) {
      if (adset.country && !group.markets.includes(adset.country)) {
        group.markets.push(adset.country);
      }
    }

    group.tests.push({
      id: test.id,
      name: test.name,
      status: test.status,
      image_jobs: test.image_jobs,
      created_at: test.created_at,
    });

    group.concept_count = group.tests.length;
  }

  const groups = Array.from(groupMap.values());

  return NextResponse.json({ groups });
}
