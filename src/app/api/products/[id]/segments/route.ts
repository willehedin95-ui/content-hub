import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // Verify product belongs to workspace
  const { data: productCheck } = await db.from("products").select("id").eq("id", id).eq("workspace_id", workspaceId).single();
  if (!productCheck) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const { data, error } = await db
    .from("product_segments")
    .select("*")
    .eq("product_id", id)
    .order("sort_order", { ascending: true });

  if (error) {
    return safeError(error, "Failed to fetch segments");
  }

  return NextResponse.json(data);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json();
  const { name, description, core_desire, core_constraints, demographics } = body;

  if (!name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // Verify product belongs to workspace
  const { data: productCheck2 } = await db.from("products").select("id").eq("id", id).eq("workspace_id", workspaceId).single();
  if (!productCheck2) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  // Get next sort_order
  const { data: existing } = await db
    .from("product_segments")
    .select("sort_order")
    .eq("product_id", id)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = existing?.[0]?.sort_order != null ? existing[0].sort_order + 1 : 0;

  const { data, error } = await db
    .from("product_segments")
    .insert({
      product_id: id,
      name,
      description: description ?? null,
      core_desire: core_desire ?? null,
      core_constraints: core_constraints ?? null,
      demographics: demographics ?? null,
      sort_order: body.sort_order ?? nextOrder,
    })
    .select()
    .single();

  if (error) {
    return safeError(error, "Failed to create segment");
  }

  return NextResponse.json(data, { status: 201 });
}
