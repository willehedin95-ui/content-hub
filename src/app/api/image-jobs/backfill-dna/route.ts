import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // Find all concepts without DNA
  const { data: jobs, error } = await db
    .from("image_jobs")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .is("cash_dna", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch concepts" }, { status: 500 });
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ total: 0, analyzed: 0, failed: 0, results: [] });
  }

  const results: Array<{ id: string; name: string; status: "ok" | "error"; error?: string }> = [];
  const baseUrl = new URL(req.url).origin;

  for (const job of jobs) {
    try {
      const res = await fetch(`${baseUrl}/api/image-jobs/${job.id}/analyze-dna`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        results.push({ id: job.id, name: job.name, status: "ok" });
      } else {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        results.push({ id: job.id, name: job.name, status: "error", error: data.error });
      }
    } catch (err) {
      results.push({ id: job.id, name: job.name, status: "error", error: String(err) });
    }
    // Rate limit: 500ms between calls
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return NextResponse.json({
    total: jobs.length,
    analyzed: results.filter((r) => r.status === "ok").length,
    failed: results.filter((r) => r.status === "error").length,
    results,
  });
}
