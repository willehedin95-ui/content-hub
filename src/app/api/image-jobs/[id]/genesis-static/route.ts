import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { generateGenesisStaticImages, type GenesisPhase } from "@/lib/genesis-images";
import { generateStaticImages } from "@/lib/generate-static-images";
import { processPendingTranslationsForJob } from "@/lib/autopilot-translations";
import { STATIC_STYLES } from "@/lib/static-ad-prompt";
import type { StaticStyleId } from "@/lib/constants";

export const maxDuration = 800; // bot call + Kie renders + 9:16 outpainting run in after(); needs the full window

type ProgressPhase = GenesisPhase | "outpainting" | "done" | "error";

/**
 * Queue missing 9:16 rows for every completed primary-ratio translation on the job
 * (same dedup rule as the manual generate-9x16 route). The standard concept pipeline
 * outpaints every image in finish-and-queue step 5; the Genesis panel used to skip
 * this, leaving letterboxed 4:5 in stories/reels placements.
 */
async function queueMissing9x16(
  db: ReturnType<typeof createServerSupabase>,
  jobId: string,
  primaryRatio: string,
): Promise<number> {
  const { data: sourceImages } = await db
    .from("source_images")
    .select("id, image_translations(id, language, aspect_ratio, status)")
    .eq("job_id", jobId);
  const all = (sourceImages ?? []).flatMap((si) =>
    (si.image_translations ?? []).map((t) => ({ ...t, source_image_id: si.id })),
  );
  const existing9x16 = new Set(
    all.filter((t) => t.aspect_ratio === "9:16").map((t) => `${t.source_image_id}:${t.language}`),
  );
  const rows = all
    .filter(
      (t) =>
        t.aspect_ratio === primaryRatio &&
        t.status === "completed" &&
        !existing9x16.has(`${t.source_image_id}:${t.language}`),
    )
    .map((t) => ({
      source_image_id: t.source_image_id,
      language: t.language,
      aspect_ratio: "9:16",
      status: "pending",
    }));
  if (rows.length > 0) {
    const { error } = await db.from("image_translations").insert(rows);
    if (error) {
      console.error(`[genesis-static] Failed to queue 9:16 rows for job ${jobId}:`, error.message);
      return 0;
    }
  }
  return rows.length;
}

// POST /api/image-jobs/[id]/genesis-static — generate static ads via a Genesis image-format bot,
// or one of the hub's own built-in styles (botSlug "hub:<styleId>").
//
// The heavy work (1-2 Genesis bot calls at ~15k system-prompt tokens each, then Kie renders)
// runs in the background via after() — the old synchronous version held the browser on a
// counting spinner for up to 800s with zero feedback and errored only at the very end.
// Progress is written to image_jobs.genesis_progress (single slot, latest run wins) and
// polled by the client via GET on this same route; rendered images appear in the grid rows
// (source_images) as each one completes.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidUUID(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const botSlug: string = body.botSlug || body.bot;
  if (!botSlug) return NextResponse.json({ error: "botSlug is required" }, { status: 400 });

  const isHubStyle = botSlug.startsWith("hub:");
  if (isHubStyle && !STATIC_STYLES.some((s) => s.id === botSlug.slice(4))) {
    return NextResponse.json({ error: `Unknown style: ${botSlug.slice(4)}` }, { status: 400 });
  }

  const workspaceId = await getWorkspaceId();
  const count = Math.min(Math.max(typeof body.count === "number" ? body.count : 3, 1), 5);
  const db = createServerSupabase();

  try {
    const { data: job } = await db
      .from("image_jobs")
      .select("id, target_ratios")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single();
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const targetRatios = (job.target_ratios as string[] | null) ?? ["4:5", "9:16"];
    const primaryRatio = targetRatios[0] ?? "4:5";

    const startedAt = new Date().toISOString();
    const setProgress = async (phase: ProgressPhase, extra: Record<string, unknown> = {}) => {
      await db
        .from("image_jobs")
        .update({
          genesis_progress: { phase, bot: botSlug, count, started_at: startedAt, updated_at: new Date().toISOString(), ...extra },
        })
        .eq("id", id);
    };
    await setProgress("bot_call");

    const run = async () => {
      try {
        const result = isHubStyle
          ? await generateStaticImages({
              jobId: id,
              workspaceId,
              styles: Array(count).fill(botSlug.slice(4)) as StaticStyleId[],
            })
          : await generateGenesisStaticImages({
              jobId: id,
              workspaceId,
              botSlug,
              count,
              onPhase: (phase, extra) => setProgress(phase, extra),
            });
        // Stories/reels versions: queue + render missing 9:16 for the whole job
        // (idempotent - also fills gaps left by pre-fix Genesis runs). Failures
        // here never fail the run; the reconcile cron drains stranded pending rows.
        if (targetRatios.includes("9:16")) {
          try {
            await setProgress("outpainting", { generated: result.generated, failed: result.failed });
            const queued = await queueMissing9x16(db, id, primaryRatio);
            if (queued > 0) await processPendingTranslationsForJob(id);
          } catch (err) {
            console.error(`[genesis-static] 9:16 outpainting failed for job ${id}:`, err);
          }
        }
        await setProgress("done", {
          generated: result.generated,
          failed: result.failed,
          errors: result.errors.length > 0 ? result.errors.slice(0, 3) : undefined,
        });
      } catch (err) {
        console.error(`[genesis-static] background run failed for job ${id} (${botSlug}):`, err);
        await setProgress("error", { error: String((err as Error)?.message ?? err).slice(0, 300) });
      }
    };
    after(run);

    return NextResponse.json({ status: "processing", started_at: startedAt }, { status: 202 });
  } catch (err) {
    return safeError(err, "Failed to start Genesis static generation");
  }
}

// GET /api/image-jobs/[id]/genesis-static — poll progress of the latest run for this concept.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidUUID(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const workspaceId = await getWorkspaceId();
  const db = createServerSupabase();
  const { data: job } = await db
    .from("image_jobs")
    .select("genesis_progress")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json({ progress: job.genesis_progress ?? null });
}
