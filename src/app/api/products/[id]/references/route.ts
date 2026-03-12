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
    .from("reference_pages")
    .select("*")
    .or(`product_id.eq.${id},product_id.is.null`)
    .order("created_at", { ascending: false });

  if (error) {
    return safeError(error, "Failed to fetch reference pages");
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
  const { name, content } = body;

  if (!name || !content) {
    return NextResponse.json(
      { error: "name and content are required" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // Verify product belongs to workspace
  const { data: productCheck2 } = await db.from("products").select("id").eq("id", id).eq("workspace_id", workspaceId).single();
  if (!productCheck2) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const { data, error } = await db
    .from("reference_pages")
    .insert({
      product_id: body.is_global ? null : id,
      name,
      url: body.url || null,
      content,
      notes: body.notes || null,
    })
    .select()
    .single();

  if (error) {
    return safeError(error, "Failed to create reference page");
  }

  return NextResponse.json(data, { status: 201 });
}
