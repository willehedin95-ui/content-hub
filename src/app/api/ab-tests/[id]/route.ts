import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  const { data, error } = await db
    .from("ab_tests")
    .select(`*, pages (name, slug)`)
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "A/B test not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { split } = await req.json();
  const db = createServerSupabase();

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (split !== undefined) {
    if (typeof split !== "number" || split < 0 || split > 100) {
      return NextResponse.json(
        { error: "split must be a number between 0 and 100" },
        { status: 400 }
      );
    }
    updates.split = split;
  }

  const { data, error } = await db
    .from("ab_tests")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Update failed" },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  // Fetch the test to get the variant_id
  const { data: test, error: tErr } = await db
    .from("ab_tests")
    .select("variant_id")
    .eq("id", id)
    .single();

  if (tErr || !test) {
    return NextResponse.json({ error: "A/B test not found" }, { status: 404 });
  }

  // Delete the A/B test record first (FK constraint)
  await db.from("ab_tests").delete().eq("id", id);

  // Delete the variant B translation
  if (test.variant_id) {
    await db.from("translations").delete().eq("id", test.variant_id);
  }

  return NextResponse.json({ ok: true });
}
