import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import type { IterationType, CashDna, ProductSegment, Angle, Style } from "@/types";

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

  // Fetch the parent job
  const { data: parent, error: parentErr } = await db
    .from("image_jobs")
    .select("*")
    .eq("id", id)
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

  // Create child job — copy most fields from parent
  const { data: childJob, error: childErr } = await db
    .from("image_jobs")
    .insert({
      name: childName,
      product: parent.product,
      status: "ready",
      target_languages: parent.target_languages,
      target_ratios: parent.target_ratios,
      auto_export: parent.auto_export,
      ad_copy_primary: parent.ad_copy_primary,
      ad_copy_headline: parent.ad_copy_headline,
      ad_copy_doc_id: parent.ad_copy_doc_id,
      landing_page_id: parent.landing_page_id,
      ab_test_id: parent.ab_test_id,
      tags: [...(parent.tags ?? []), "iteration"],
      cash_dna: childDna,
      visual_direction: parent.visual_direction,
      source_spy_ad_id: parent.source_spy_ad_id,
      iteration_of: id,
      iteration_type: iterationType,
      iteration_context: iterationContext,
    })
    .select()
    .single();

  if (childErr || !childJob) {
    return safeError(childErr ?? new Error("Failed to create"), "Failed to create iteration");
  }

  return NextResponse.json({
    id: childJob.id,
    name: childJob.name,
    iteration_type: iterationType,
    iteration_of: id,
  }, { status: 201 });
}
