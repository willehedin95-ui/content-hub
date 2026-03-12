import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { getWorkspace } from "@/lib/workspace";
import { updateAdSet, setMetaConfig } from "@/lib/meta";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { winner } = body as { winner: "a" | "b" };

  if (!winner || !["a", "b"].includes(winner)) {
    return NextResponse.json({ error: "winner must be 'a' or 'b'" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Load workspace Meta config
  const ws = await getWorkspace();
  setMetaConfig(ws.meta_config ?? null);

  // Get page test with linked ad sets
  const { data: test, error: testError } = await db
    .from("page_tests")
    .select("*, page_test_adsets(*)")
    .eq("id", id)
    .single();

  if (testError || !test) {
    return safeError(testError, "Page test not found");
  }

  if (test.status === "completed") {
    return NextResponse.json({ error: "Test already completed" }, { status: 400 });
  }

  const losingVariant = winner === "a" ? "b" : "a";
  const losingAdsets = (test.page_test_adsets ?? []).filter(
    (a: { variant: string }) => a.variant === losingVariant
  );

  // Pause losing ad sets via Meta API
  const pauseResults: Array<{ adset_id: string; success: boolean; error?: string }> = [];
  for (const adset of losingAdsets) {
    try {
      await updateAdSet(adset.meta_adset_id, { status: "PAUSED" });
      pauseResults.push({ adset_id: adset.meta_adset_id, success: true });
    } catch (err) {
      pauseResults.push({
        adset_id: adset.meta_adset_id,
        success: false,
        error: err instanceof Error ? err.message : "Failed to pause",
      });
    }
  }

  // Update page test status
  const winnerPageId = winner === "a" ? test.page_a_id : test.page_b_id;
  await db
    .from("page_tests")
    .update({
      status: "completed",
      winner_page_id: winnerPageId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json({
    success: true,
    winner,
    winner_page_id: winnerPageId,
    paused_adsets: pauseResults,
  });
}
