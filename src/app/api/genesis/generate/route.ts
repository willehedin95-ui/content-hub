import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
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

interface PersistCtx {
  db: SupabaseClient;
  workspaceId: string;
  product: string;
  targetLanguages: string[];
  generateImages: boolean;
}

async function persistConcept(ctx: PersistCtx, p: ConceptProposal, judge: JudgeResult, nextNumber: number) {
  const { db, workspaceId, product, targetLanguages, generateImages } = ctx;
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
      status: "draft",
      target_languages: targetLanguages,
      target_ratios: ["4:5", "9:16"],
      concept_number: nextNumber,
      tags: [...(p.suggested_tags ?? []), "genesis-generated", `judge:${judge.verdict}`],
      cash_dna: p.cash_dna,
      ad_copy_primary: p.ad_copy_primary,
      ad_copy_headline: p.ad_copy_headline ?? [],
      visual_direction: p.visual_direction ?? null,
      workspace_id: workspaceId,
      ...(landingPageId ? { landing_page_id: landingPageId } : {}),
    })
    .select()
    .single();
  if (error || !job) return null;

  if (generateImages) {
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
  return NextResponse.json({ gaps: suggestGaps(dims, 5), total: dims.length });
}

// POST /api/genesis/generate -> generate NEW vetted concepts (mode "generate") or swipe a competitor ad (mode "swipe").
export async function POST(req: NextRequest) {
  const body = await req.json();
  const product: string = body.product;
  const mode: string = body.mode || "generate";
  const generateImages: boolean = body.generate_images !== false;
  if (!product) return NextResponse.json({ error: "product is required" }, { status: 400 });

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const settings = await getWorkspaceSettings();

  try {
    const langCode = (settings.ad_copy_language as string) || "sv";
    const language = body.language || LANG_NAMES[langCode] || "Swedish";

    const { data: prod } = await db
      .from("products")
      .select("name, description, ingredients")
      .eq("slug", product)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const productName = prod?.name || product;
    const brandBrief = [prod?.description, prod?.ingredients].filter(Boolean).join(" ").slice(0, 600) || undefined;

    const targetLanguages = await getWorkspaceLanguages();
    const ctx: PersistCtx = { db, workspaceId, product, targetLanguages, generateImages };
    let nextNumber = await nextConceptNumber(db, workspaceId);

    // --- SWIPE MODE ---
    if (mode === "swipe") {
      const competitorAdText: string = body.competitorAdText || "";
      if (!competitorAdText.trim()) return NextResponse.json({ error: "competitorAdText required for swipe" }, { status: 400 });
      const { proposal, error: swipeErr } = await swipeConceptWithGenesis({
        competitorAdText,
        productName,
        language,
        brandBrief,
        awarenessLevel: body.awarenessLevel,
        angle: body.angle || undefined,
        guardAgainst: body.guardAgainst,
      });
      if (!proposal) return NextResponse.json({ created: [], errors: [swipeErr || "swipe failed"] }, { status: 200 });
      const judge = await judgeCopy(proposal.ad_copy_primary[0] || "", { language, productName });
      if (judge.verdict === "REJECT") return NextResponse.json({ created: [], rejected: 1, judge }, { status: 200 });
      const created = await persistConcept(ctx, proposal, judge, nextNumber);
      return NextResponse.json({ created: created ? [created] : [], images_generating: generateImages });
    }

    // --- GENERATE MODE ---
    const count: number = Math.min(Math.max(Number(body.count) || 2, 1), 5);
    const awarenessLevel: AwarenessLevel = body.awarenessLevel || "Problem Aware";
    const angle: Angle | undefined = body.angle || undefined;
    const rules = Array.isArray(settings.generation_rules) ? (settings.generation_rules as string[]) : [];

    const { vetted, rejected, errors } = await generateVettedConcepts(
      { productName, language, brandBrief, segmentNote: body.segmentNote, awarenessLevel, angle, count },
      { rules, judge: true },
    );
    if (!vetted.length) return NextResponse.json({ created: [], rejected: rejected.length, errors }, { status: 200 });

    const created = [];
    for (const v of vetted) {
      const row = await persistConcept(ctx, v.proposal, v.judge, nextNumber);
      if (row) {
        created.push(row);
        nextNumber++;
      }
    }
    return NextResponse.json({ created, rejected: rejected.length, errors, images_generating: generateImages });
  } catch (err) {
    return safeError(err, "Genesis generation failed");
  }
}
