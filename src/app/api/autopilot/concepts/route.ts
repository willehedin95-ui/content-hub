import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

// GET /api/autopilot/concepts — fetch autopilot-generated image_jobs
export async function GET() {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // Pending: source=autopilot, no launchpad_priority, not archived
  const { data: pending } = await db
    .from("image_jobs")
    .select("id, name, concept_number, product, status, source, ad_copy_primary, ad_copy_headline, visual_direction, cash_dna, landing_page_id, target_languages, created_at, source_images(id, original_url, filename)")
    .eq("workspace_id", workspaceId)
    .eq("source", "autopilot")
    .is("launchpad_priority", null)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  // Approved: source=autopilot, has launchpad_priority, not archived
  const { data: approved } = await db
    .from("image_jobs")
    .select("id, name, concept_number, product, status, source, ad_copy_primary, ad_copy_headline, cash_dna, landing_page_id, target_languages, created_at, source_images(id, original_url, filename)")
    .eq("workspace_id", workspaceId)
    .eq("source", "autopilot")
    .not("launchpad_priority", "is", null)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  // Rejected: source=autopilot, archived
  const { data: rejected } = await db
    .from("image_jobs")
    .select("id, name, concept_number, product, status, source, cash_dna, created_at, archived_at")
    .eq("workspace_id", workspaceId)
    .eq("source", "autopilot")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })
    .limit(5);

  return NextResponse.json({
    pending: pending ?? [],
    approved: approved ?? [],
    rejected: rejected ?? [],
  });
}
