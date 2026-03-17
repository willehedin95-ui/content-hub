import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { triggerAutopilotTranslations } from "@/lib/autopilot-translations";

export const maxDuration = 300;

// POST /api/autopilot/concepts/:id/approve
// body: { approved: boolean }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const body = await req.json().catch(() => ({}));
  const approved = body.approved !== false; // default true

  const db = createServerSupabase();

  const { data: job } = await db
    .from("image_jobs")
    .select("id, name, concept_number, target_languages, landing_page_id")
    .eq("id", jobId)
    .single();

  if (!job) {
    return NextResponse.json({ error: "Concept not found" }, { status: 404 });
  }

  if (approved) {
    // Check landing page
    if (!job.landing_page_id) {
      return NextResponse.json(
        { error: "No landing page assigned. Assign one before approving." },
        { status: 400 }
      );
    }

    // Get next launchpad priority (top of queue)
    const { data: topLaunchpad } = await db
      .from("image_jobs")
      .select("launchpad_priority")
      .not("launchpad_priority", "is", null)
      .order("launchpad_priority", { ascending: true })
      .limit(1)
      .single();

    const priority = ((topLaunchpad?.launchpad_priority as number) ?? 10) - 1;

    await db
      .from("image_jobs")
      .update({
        launchpad_priority: priority,
        marked_ready_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    // Create/update market records
    const COUNTRY_MAP: Record<string, string> = { sv: "SE", da: "DK", no: "NO" };
    const targetLangs = (job.target_languages as string[]) ?? ["sv", "da", "no"];

    for (const lang of targetLangs) {
      const market = COUNTRY_MAP[lang] ?? lang.toUpperCase();
      const { data: existing } = await db
        .from("image_job_markets")
        .select("id")
        .eq("image_job_id", jobId)
        .eq("market", market)
        .single();

      if (!existing) {
        await db.from("image_job_markets").insert({
          image_job_id: jobId,
          market,
          launchpad_priority: priority,
        });
      } else {
        await db
          .from("image_job_markets")
          .update({ launchpad_priority: priority })
          .eq("id", existing.id);
      }
    }

    // Trigger translation pipeline in background (after response is sent)
    after(async () => {
      try {
        console.log(`[autopilot-approve] Starting translations for job ${jobId}`);
        const result = await triggerAutopilotTranslations(jobId);
        console.log(`[autopilot-approve] Translations done:`, result);
      } catch (err) {
        console.error(`[autopilot-approve] Translation pipeline failed for ${jobId}:`, err);
      }
    });

    return NextResponse.json({ ok: true, action: "approved", priority, translationsStarted: true });
  } else {
    // Reject = archive
    await db
      .from("image_jobs")
      .update({
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return NextResponse.json({ ok: true, action: "rejected" });
  }
}
