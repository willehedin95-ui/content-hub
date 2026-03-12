import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { generateIterationCopy } from "@/lib/brainstorm";
import type { IterationType, CashDna, ProductSegment, ProductFull, CopywritingGuideline, Angle, Style } from "@/types";

export const maxDuration = 120;

// POST /api/image-jobs/[id]/iterate — Create an iteration of a winning concept
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const iterationType = body.iteration_type as IterationType | undefined;

  if (!iterationType || !["segment_swap", "mechanism_swap", "cash_swap"].includes(iterationType)) {
    return NextResponse.json(
      { error: "iteration_type must be segment_swap, mechanism_swap, or cash_swap" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // Fetch the parent job
  const { data: parent, error: parentErr } = await db
    .from("image_jobs")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (parentErr || !parent) {
    return safeError(parentErr ?? new Error("Not found"), "Parent job not found", 404);
  }

  const parentDna = parent.cash_dna as CashDna | null;

  // Build iteration context and modified CASH DNA based on iteration type
  let iterationContext: Record<string, unknown> = { iteration_type: iterationType };
  let childDna: CashDna | null = parentDna ? { ...parentDna } : null;
  let childName = parent.name;

  switch (iterationType) {
    case "segment_swap": {
      if (!body.segment_id || !isValidUUID(body.segment_id)) {
        return NextResponse.json(
          { error: "segment_id is required for segment_swap" },
          { status: 400 }
        );
      }
      const { data: segment } = await db
        .from("product_segments")
        .select("*")
        .eq("id", body.segment_id)
        .single();
      if (!segment) {
        return NextResponse.json({ error: "Segment not found" }, { status: 404 });
      }
      const seg = segment as ProductSegment;
      iterationContext = {
        ...iterationContext,
        segment_id: seg.id,
        segment_name: seg.name,
        segment_description: seg.description,
        segment_core_desire: seg.core_desire,
        segment_core_constraints: seg.core_constraints,
        segment_demographics: seg.demographics,
      };
      childName = `${parent.name} → ${seg.name}`;
      break;
    }

    case "mechanism_swap": {
      const newMechanism = String(body.new_mechanism ?? "").trim();
      if (!newMechanism) {
        return NextResponse.json(
          { error: "new_mechanism is required for mechanism_swap" },
          { status: 400 }
        );
      }
      iterationContext = {
        ...iterationContext,
        original_angle: parentDna?.angle ?? null,
        new_mechanism: newMechanism,
      };
      childName = `${parent.name} → ${newMechanism.slice(0, 40)}`;
      break;
    }

    case "cash_swap": {
      const swapElement = body.swap_element as string | undefined;
      if (!swapElement || !["hook", "style", "angle"].includes(swapElement)) {
        return NextResponse.json(
          { error: "swap_element must be hook, style, or angle" },
          { status: 400 }
        );
      }
      const newValue = String(body.new_value ?? "").trim();
      if (!newValue) {
        return NextResponse.json(
          { error: "new_value is required for cash_swap" },
          { status: 400 }
        );
      }

      iterationContext = {
        ...iterationContext,
        swap_element: swapElement,
        original_value: swapElement === "hook"
          ? (parentDna?.hooks?.[0] ?? null)
          : swapElement === "style"
          ? (parentDna?.style ?? null)
          : (parentDna?.angle ?? null),
        new_value: newValue,
      };

      // Apply the swap to the child DNA
      if (childDna) {
        if (swapElement === "angle") childDna.angle = newValue as Angle;
        if (swapElement === "style") childDna.style = newValue as Style;
        if (swapElement === "hook") childDna.hooks = [newValue, ...(childDna.hooks ?? []).slice(1)];
      }
      childName = `${parent.name} → ${swapElement}: ${newValue.slice(0, 30)}`;
      break;
    }
  }

  // Get next concept number
  const { data: lastJob } = await db
    .from("image_jobs")
    .select("concept_number")
    .eq("workspace_id", workspaceId)
    .not("concept_number", "is", null)
    .order("concept_number", { ascending: false })
    .limit(1)
    .single();
  const nextNumber = (lastJob?.concept_number ?? 0) + 1;

  // Rewrite ad copy via Claude (use parent copy as fallback if Claude fails)
  let adCopyPrimary: string[] = parent.ad_copy_primary ?? [];
  let adCopyHeadline: string[] = parent.ad_copy_headline ?? [];

  if (parentDna && parent.product) {
    try {
      // Fetch product + guidelines for Claude context
      const [{ data: product }, { data: guidelines }, { data: segments }] = await Promise.all([
        db.from("products").select("*").eq("slug", parent.product).single(),
        db.from("copywriting_guidelines").select("*").or(`product_id.is.null,product_id.eq.${parent.product}`),
        db.from("product_segments").select("*").eq("product_id", parent.product),
      ]);

      if (product) {
        const rewritten = await generateIterationCopy({
          parentName: parent.name,
          parentCopy: {
            primary: parent.ad_copy_primary ?? [],
            headlines: parent.ad_copy_headline ?? [],
          },
          parentDna,
          iterationType,
          iterationContext,
          product: product as ProductFull,
          guidelines: (guidelines ?? []) as CopywritingGuideline[],
          segments: (segments ?? []) as ProductSegment[],
        });

        adCopyPrimary = rewritten.primary;
        adCopyHeadline = rewritten.headlines.length > 0 ? rewritten.headlines : adCopyHeadline;
      }
    } catch (err) {
      console.warn("[iterate] Claude copy rewrite failed, using parent copy:", err instanceof Error ? err.message : err);
      // Fallback: keep parent copy
    }
  }

  // Create child job
  const { data: childJob, error: childErr } = await db
    .from("image_jobs")
    .insert({
      name: childName,
      product: parent.product,
      status: "ready",
      target_languages: parent.target_languages,
      target_ratios: parent.target_ratios,
      concept_number: nextNumber,
      auto_export: parent.auto_export,
      ad_copy_primary: adCopyPrimary,
      ad_copy_headline: adCopyHeadline,
      ad_copy_doc_id: parent.ad_copy_doc_id,
      landing_page_id: parent.landing_page_id,
      landing_page_id_b: parent.landing_page_id_b,
      tags: [...(parent.tags ?? []), "iteration"],
      cash_dna: childDna,
      visual_direction: parent.visual_direction,
      iteration_of: id,
      iteration_type: iterationType,
      iteration_context: iterationContext,
      workspace_id: workspaceId,
    })
    .select()
    .single();

  if (childErr || !childJob) {
    return safeError(childErr ?? new Error("Failed to create"), "Failed to create iteration");
  }

  return NextResponse.json({
    id: childJob.id,
    name: childJob.name,
    concept_number: nextNumber,
    iteration_type: iterationType,
    iteration_of: id,
    copy_rewritten: adCopyPrimary !== (parent.ad_copy_primary ?? []),
  }, { status: 201 });
}
