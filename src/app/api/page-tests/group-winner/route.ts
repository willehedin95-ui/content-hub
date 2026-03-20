import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { getWorkspace } from "@/lib/workspace";
import { updateAdSet, setMetaConfig } from "@/lib/meta";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { page_a_id, page_b_id, winner } = body as {
    page_a_id: string;
    page_b_id: string;
    winner: "a" | "b";
  };

  if (!page_a_id || !page_b_id || !["a", "b"].includes(winner)) {
    return NextResponse.json(
      { error: "page_a_id, page_b_id, and winner ('a' or 'b') are required" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();
  const ws = await getWorkspace();
  setMetaConfig(ws.meta_config ?? null);

  // Get all active page_tests for this page pair
  const { data: tests, error: testsError } = await db
    .from("page_tests")
    .select("*, page_test_adsets(*)")
    .eq("workspace_id", ws.id)
    .eq("page_a_id", page_a_id)
    .eq("page_b_id", page_b_id)
    .eq("status", "active");

  if (testsError) {
    return safeError(testsError, "Failed to fetch page tests");
  }

  if (!tests || tests.length === 0) {
    return NextResponse.json(
      { error: "No active tests found for this page pair" },
      { status: 400 }
    );
  }

  // Collect all losing variant ad sets across all tests
  const losingVariant = winner === "a" ? "b" : "a";
  const losingAdsets: Array<{ adset_id: string; test_id: string }> = [];
  for (const test of tests) {
    for (const adset of test.page_test_adsets ?? []) {
      if (adset.variant === losingVariant) {
        losingAdsets.push({ adset_id: adset.meta_adset_id, test_id: test.id });
      }
    }
  }

  // Pause losing ad sets via Meta API
  const pauseResults: Array<{ adset_id: string; success: boolean; error?: string }> = [];
  for (const { adset_id } of losingAdsets) {
    try {
      await updateAdSet(adset_id, { status: "PAUSED" });
      pauseResults.push({ adset_id, success: true });
    } catch (err) {
      pauseResults.push({
        adset_id,
        success: false,
        error: err instanceof Error ? err.message : "Failed to pause",
      });
    }
  }

  // Update all tests in the group to completed
  const winnerPageId = winner === "a" ? page_a_id : page_b_id;
  const testIds = tests.map((t) => t.id);

  await db
    .from("page_tests")
    .update({
      status: "completed",
      winner_page_id: winnerPageId,
      updated_at: new Date().toISOString(),
    })
    .in("id", testIds);

  return NextResponse.json({
    success: true,
    winner,
    winner_page_id: winnerPageId,
    tests_completed: testIds.length,
    paused_adsets: pauseResults,
  });
}
