import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import type { PageAngle } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const db = createServerSupabase();

  const { data: page, error } = await db
    .from("pages")
    .select(`*, translations (*)`)
    .eq("id", id)
    .single();

  if (error) {
    return safeError(error, "Failed to fetch page", 404);
  }

  return NextResponse.json(page);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { name, tags, original_html, status, angle } = body as {
      name?: string;
      tags?: string[];
      original_html?: string;
      status?: string;
      angle?: PageAngle;
    };

    const VALID_ANGLES: PageAngle[] = ["snoring", "neck_pain", "neutral"];

    const updateData: Record<string, unknown> = {};
    if (name?.trim()) updateData.name = name.trim();
    if (tags !== undefined) updateData.tags = tags;
    if (original_html !== undefined) updateData.original_html = original_html;
    if (status && ["importing", "ready"].includes(status)) updateData.status = status;
    if (angle && VALID_ANGLES.includes(angle)) updateData.angle = angle;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const db = createServerSupabase();

    const { data, error } = await db
      .from("pages")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return safeError(error, "Failed to update page");
    }

    return NextResponse.json(data);
  } catch (err) {
    return safeError(err, "Failed to update page");
  }
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

  const { error } = await db.from("pages").delete().eq("id", id);

  if (error) {
    return safeError(error, "Failed to delete page");
  }

  return NextResponse.json({ success: true });
}
