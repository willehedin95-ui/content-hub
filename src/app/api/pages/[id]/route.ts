import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";
import type { PageAngle } from "@/types";

export const maxDuration = 30;

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

  const { data: page, error } = await db
    .from("pages")
    .select(`*, translations (*)`)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
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
    const { name, tags, original_html, status, angle, custom_head_code, content_type, blog_category, blog_featured_image_url } = body as {
      name?: string;
      tags?: string[];
      original_html?: string;
      status?: string;
      angle?: PageAngle;
      custom_head_code?: string;
      content_type?: string;
      blog_category?: string;
      blog_featured_image_url?: string;
    };

    const VALID_ANGLES: PageAngle[] = ["snoring", "neck_pain", "neutral"];

    const updateData: Record<string, unknown> = {};
    if (name?.trim()) updateData.name = name.trim();
    if (tags !== undefined) updateData.tags = tags;
    if (original_html !== undefined) updateData.original_html = original_html;
    if (status && ["importing", "ready"].includes(status)) updateData.status = status;
    if (angle && VALID_ANGLES.includes(angle)) updateData.angle = angle;
    if (custom_head_code !== undefined) updateData.custom_head_code = custom_head_code;
    if (content_type !== undefined && ["landing_page", "seo_blog"].includes(content_type)) updateData.content_type = content_type;
    if (blog_category !== undefined) updateData.blog_category = blog_category || null;
    if (blog_featured_image_url !== undefined) updateData.blog_featured_image_url = blog_featured_image_url || null;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const db = createServerSupabase();
    const workspaceId = await getWorkspaceId();

    const { data, error } = await db
      .from("pages")
      .update(updateData)
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select("id, name, slug, status, tags, angle, custom_head_code")
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
  const workspaceId = await getWorkspaceId();

  const { error } = await db.from("pages").delete().eq("id", id).eq("workspace_id", workspaceId);

  if (error) {
    return safeError(error, "Failed to delete page");
  }

  return NextResponse.json({ success: true });
}
