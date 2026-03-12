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

  // Fetch both product-specific and global guidelines
  const { data, error } = await db
    .from("copywriting_guidelines")
    .select("*")
    .or(`product_id.eq.${id},product_id.is.null`)
    .order("sort_order", { ascending: true });

  if (error) {
    return safeError(error, "Failed to fetch guidelines");
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
  const { name, content, is_global } = body;

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
    .from("copywriting_guidelines")
    .insert({
      product_id: is_global ? null : id,
      name,
      content,
      sort_order: body.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    return safeError(error, "Failed to create guideline");
  }

  return NextResponse.json(data, { status: 201 });
}
