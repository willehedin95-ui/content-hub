import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId, getWorkspaceSettings, getWorkspaceLanguages } from "@/lib/workspace";
import { findBestLandingPage } from "@/lib/landing-page-recommender";
import { generateStaticImages } from "@/lib/generate-static-images";
import { generateVettedConcepts } from "@/lib/genesis-pipeline";
import { swipeConceptWithGenesis } from "@/lib/genesis-concepts";
import { judgeCopy, type JudgeResult } from "@/lib/creative-judge";
import { suggestGaps } from "@/lib/coverage-map";
import type { ConceptProposal, Angle, AwarenessLevel } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export const maxDuration = 800;

const LANG_NAMES: Record<string, string> = { sv: "Swedish", da: "Danish", no: "Norwegian", de: "German", en: "English" };
const LANG_CODES: Record<string, string> = { Swedish: "sv", Danish: "da", Norwegian: "no", German: "de", English: "en" };

interface PersistCtx {
  db: SupabaseClient;
  workspaceId: string;
  product: string;
  targetLanguages: string[];
  generateImages: boolean;
  /** Language code the copy is generated in (e.g. "sv") - enables the same-language translation passthrough. */
  sourceLanguage: string;
}

async function persistConcept(ctx: PersistCtx, p: ConceptProposal, judge: JudgeResult, nextNumber: number, doImages: boolean) {
  const { db, workspaceId, product, targetLanguages } = ctx;
  const landingPageId = await findBestLandingPage(db, workspaceId, product, {
    adCopyPrimary: p.ad_copy_primary,
    adCopyHeadline: p.ad_copy_headline,
    conceptName: p.concept_name,
  });
  const { data: job, error } = await db
    .from("image_jobs")
    .insert({
      name: p.concept_name,
      product,
      // REJECT concepts never get image generation, and "draft" only leaves
      // that state via image gen — so a REJECT-as-draft rendered as
      // "Generating images..." forever. Give it a terminal status instead.
      status: judge.verdict === "REJECT" ? "rejected" : "draft",
      target_languages: targetLanguages,
      target_ratios: ["4:5", "9:16"],
      concept_number: nextNumber,
      tags: [...(p.suggested_tags ?? []), "genesis-generated", `judge:${judge.verdict}`],
      cash_dna: p.cash_dna,
      ad_copy_primary: p.ad_copy_primary,
      ad_copy_headline: p.ad_copy_headline ?? [],
      visual_direction: p.visual_direction ?? null,
      source_language: ctx.sourceLanguage,
      workspace_id: workspaceId,
      ...(landingPageId ? { landing_page_id: landingPageId } : {}),
    })
    .select()
    .single();
  if (error || !job) return null;

  if (doImages) {
    const jobId = job.id;
    after(async () => {
      try {
        await generateStaticImages({ jobId, workspaceId });
      } catch (err) {
        console.error(`[genesis-generate] image gen failed for ${jobId}:`, err);
        const errDb = createServerSupabase();
        await errDb.from("image_jobs").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", jobId);
      }
    });
  }
  return {
    job_id: job.id,
    concept_number: nextNumber,
    name: p.concept_name,
    verdict: judge.verdict,
    score: judge.score,
    angle: p.cash_dna.angle,
    awareness: p.cash_dna.awareness_level,
    hook: p.cash_dna.hooks?.[0] ?? "",
    preview: (p.ad_copy_primary[0] ?? "").slice(0, 320),
    issues: judge.issues.slice(0, 4).map((i) => i.fix || i.quote),
  };
}

async function nextConceptNumber(db: SupabaseClient, workspaceId: string) {
  const { data } = await db
    .from("image_jobs")
    .select("concept_number")
    .eq("workspace_id", workspaceId)
    .not("concept_number", "is", null)
    .order("concept_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.concept_number ?? 0) + 1;
}

// GET /api/genesis/generate?product=hydro13 -> CASH coverage gaps to aim the generator.
export async function GET(req: NextRequest) {
  const product = req.nextUrl.searchParams.get("product");
  if (!product) return NextResponse.json({ error: "product required" }, { status: 400 });
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const { data } = await db
    .from("image_jobs")
    .select("cash_dna")
    .eq("workspace_id", workspaceId)
    .eq("product", product)
    .not("cash_dna", "is", null)
    .limit(1000);
  const dims = (data ?? [])
    .map((r) => r.cash_dna as { angle?: Angle; awareness_level?: AwarenessLevel })
    .filter((c) => c?.angle && c?.awareness_level)
    .map((c) => ({ angle: c.angle!, awareness: c.awareness_level! }));

  // Preset segments for this product (so the UI can offer a dropdown).
  const { data: prod } = await db
    .from("products")
    .select("id")
    .eq("slug", product)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  let segments: Array<{ name: string; description: string }> = [];
  if (prod?.id) {
    const { data: segs } = await db
      .from("product_segments")
      .select("name, description")
      .eq("product_id", prod.id);
    segments = (segs ?? []).map((s) => ({ name: s.name as string, description: (s.description as string) || "" }));
  }

  return NextResponse.json({ gaps: suggestGaps(dims, 5), total: dims.length, segments });
}

// POST /api/genesis/generate -> stream (NDJSON) NEW vetted concepts (mode "generate") or a
// competitor swipe (mode "swipe"). Each concept is emitted + persisted as it completes, so the
// UI shows live progress instead of a blind multi-minute wait.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const product: string = body.product;
  const mode: string = body.mode || "generate";
  const generateImages: boolean = body.generate_images !== false;
  if (!product) return NextResponse.json({ error: "product is required" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const emit = (data: object) => writer.write(encoder.encode(JSON.stringify(data) + "\n"));

  (async () => {
    try {
      const db = createServerSupabase();
      const workspaceId = await getWorkspaceId();
      const settings = await getWorkspaceSettings();
      const language = body.language || LANG_NAMES[(settings.ad_copy_language as string) || "sv"] || "Swedish";

      const { data: prod } = await db
        .from("products")
        .select("name, description, ingredients")
        .eq("slug", product)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      const productName = prod?.name || product;
      const brandBrief = [prod?.description, prod?.ingredients].filter(Boolean).join(" ").slice(0, 600) || undefined;

      const targetLanguages = await getWorkspaceLanguages();
      const sourceLanguage = LANG_CODES[language] || (settings.ad_copy_language as string) || "sv";
      const ctx: PersistCtx = { db, workspaceId, product, targetLanguages, generateImages, sourceLanguage };
      let nextNumber = await nextConceptNumber(db, workspaceId);
      let createdCount = 0;
      let rejectedCount = 0;

      if (mode === "swipe") {
        const competitorAdText: string = body.competitorAdText || "";
        if (!competitorAdText.trim()) {
          await emit({ step: "error", message: "competitorAdText required for swipe" });
        } else {
          await emit({ step: "progress", phase: "swipe", index: 0, total: 1 });
          const { proposal, error: swipeErr } = await swipeConceptWithGenesis({
            competitorAdText, productName, language, brandBrief,
            awarenessLevel: body.awarenessLevel, angle: body.angle || undefined, guardAgainst: body.guardAgainst,
          });
          if (!proposal) {
            await emit({ step: "error", message: swipeErr || "swipe failed" });
          } else {
            const judge = await judgeCopy(proposal.ad_copy_primary[0] || "", { language, productName });
            if (judge.verdict === "REJECT") rejectedCount++;
            const row = await persistConcept(ctx, proposal, judge, nextNumber, ctx.generateImages && judge.verdict !== "REJECT");
            if (row) { createdCount++; await emit({ step: "concept", concept: row }); }
          }
        }
      } else {
        const count = Math.min(Math.max(Number(body.count) || 2, 1), 3);
        const awarenessLevel: AwarenessLevel = body.awarenessLevel || "Problem Aware";
        const angle: Angle | undefined = body.angle || undefined;
        const rules = Array.isArray(settings.generation_rules) ? (settings.generation_rules as string[]) : [];

        await generateVettedConcepts(
          { productName, language, brandBrief, segmentNote: body.segmentNote, awarenessLevel, angle, count },
          {
            rules,
            judge: true,
            onProgress: (e) => emit({ step: "progress", ...e }),
            onConcept: async (v) => {
              if (v.judge.verdict === "REJECT") rejectedCount++;
              const row = await persistConcept(ctx, v.proposal, v.judge, nextNumber, ctx.generateImages && v.judge.verdict !== "REJECT");
              if (row) { createdCount++; nextNumber++; await emit({ step: "concept", concept: row }); }
            },
          },
        );
      }

      await emit({ step: "done", created: createdCount, rejected: rejectedCount });
    } catch (err) {
      await emit({ step: "error", message: (err as Error).message });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
  });
}
