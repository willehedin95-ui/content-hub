import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const db = createServerSupabase();

  const { data, error } = await db
    .from("ab_tests")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "A/B test not found" }, { status: 404 });
  }

  // Fetch both translations with their page info
  const [{ data: controlT }, { data: variantT }] = await Promise.all([
    db.from("translations").select("*, pages (id, name, slug)").eq("id", data.control_id).single(),
    db.from("translations").select("*, pages (id, name, slug)").eq("id", data.variant_id).single(),
  ]);

  return NextResponse.json({
    ...data,
    control_translation: controlT,
    variant_translation: variantT,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const body = await req.json();
  const db = createServerSupabase();

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.split !== undefined) {
    if (typeof body.split !== "number" || body.split < 0 || body.split > 100) {
      return NextResponse.json(
        { error: "split must be a number between 0 and 100" },
        { status: 400 }
      );
    }
    updates.split = body.split;
  }

  if (body.name !== undefined) updates.name = body.name;
  if (body.slug !== undefined) updates.slug = body.slug;
  if (body.description !== undefined) updates.description = body.description || null;

  const { data, error } = await db
    .from("ab_tests")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    return safeError(error, "Failed to update A/B test");
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const db = createServerSupabase();

  const { data: test, error: tErr } = await db
    .from("ab_tests")
    .select("id")
    .eq("id", id)
    .single();

  if (tErr || !test) {
    return NextResponse.json({ error: "A/B test not found" }, { status: 404 });
  }

  // Delete the test record only — translations belong to their pages
  await db.from("ab_tests").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}
