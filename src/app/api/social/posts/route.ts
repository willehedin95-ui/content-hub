import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { STORAGE_BUCKET } from "@/lib/constants";
import { DEFAULT_SLOTS, nextFreeSlots } from "@/lib/social-slots";
import { SOCIAL_KINDS } from "@/lib/social-kinds";

const KINDS = Object.keys(SOCIAL_KINDS);

export const maxDuration = 120;

// GET /api/social/posts?from=ISO&to=ISO - the queue for the current workspace.
export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const ws = await getWorkspaceId();
  const from = req.nextUrl.searchParams.get("from") ?? new Date(Date.now() - 14 * 86_400_000).toISOString();
  const to = req.nextUrl.searchParams.get("to") ?? new Date(Date.now() + 60 * 86_400_000).toISOString();
  const { data, error } = await db.from("social_posts").select("*").eq("workspace_id", ws)
    .gte("scheduled_at", from).lte("scheduled_at", to).order("scheduled_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: w } = await db.from("workspaces").select("settings").eq("id", ws).single();
  const social = ((w?.settings as Record<string, unknown> | null)?.social ?? null) as Record<string, unknown> | null;
  return NextResponse.json({ posts: data ?? [], social });
}

/**
 * POST {urls[], carousel?, caption?}. The page uploads each image first via
 * /api/upload-temp (one request per image, shrunk in the browser - Vercel
 * rejects request bodies over 4.5 MB). Here each image is fetched, made JPEG
 * (Instagram only takes JPEG) and stored under social/, then queued as DRAFTS
 * in the next free slots. carousel=true makes one carousel of all images,
 * otherwise one post per image.
 */
export async function POST(req: NextRequest) {
  const db = createServerSupabase();
  const ws = await getWorkspaceId();
  const body = await req.json().catch(() => ({}));
  const sources = (Array.isArray(body.urls) ? body.urls : []).filter((u: unknown): u is string => typeof u === "string");
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
  // Only our own storage - this route must not fetch arbitrary URLs.
  if (sources.length === 0 || sources.some((u: string) => !u.startsWith(`${base}/storage/v1/object/public/`))) {
    return NextResponse.json({ error: "urls must be uploaded images" }, { status: 400 });
  }
  const carousel = body.carousel === true;
  if (carousel && sources.length > 10) return NextResponse.json({ error: "max 10 bilder i en karusell" }, { status: 400 });
  const caption = typeof body.caption === "string" ? body.caption : "";
  const kind = typeof body.kind === "string" && KINDS.includes(body.kind) ? body.kind : "other";

  const urls: string[] = [];
  for (const src of sources) {
    const res = await fetch(src, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return NextResponse.json({ error: `fetch ${res.status}` }, { status: 502 });
    const jpeg = await sharp(Buffer.from(await res.arrayBuffer())).rotate().resize({ width: 1080, withoutEnlargement: true }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    const path = `social/${ws}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.jpg`;
    const { error } = await db.storage.from(STORAGE_BUCKET).upload(path, jpeg, { contentType: "image/jpeg" });
    if (error) return NextResponse.json({ error: `upload: ${error.message}` }, { status: 500 });
    urls.push(`${base}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`);
  }

  const { data: existing } = await db.from("social_posts").select("scheduled_at,status").eq("workspace_id", ws)
    .gte("scheduled_at", new Date().toISOString()).neq("status", "failed");
  const taken = new Set((existing ?? []).map((p) => new Date(p.scheduled_at).getTime()));
  const { data: w } = await db.from("workspaces").select("settings").eq("id", ws).single();
  const slots = (((w?.settings as Record<string, unknown> | null)?.social as Record<string, unknown> | undefined)?.slots as string[] | undefined) ?? DEFAULT_SLOTS;

  const groups = carousel ? [urls] : urls.map((u) => [u]);
  const times = nextFreeSlots(groups.length, taken, slots);
  const rows = groups.map((g, i) => ({
    workspace_id: ws, scheduled_at: times[i].toISOString(), format: g.length > 1 ? "carousel" : "image",
    media_urls: g, caption, kind, status: "draft", source: "william",
  }));
  const { data, error } = await db.from("social_posts").insert(rows).select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data });
}

// PATCH {id, caption?, scheduled_at?, status?: "approved" | "draft", label?}
export async function PATCH(req: NextRequest) {
  const db = createServerSupabase();
  const ws = await getWorkspaceId();
  const body = await req.json().catch(() => ({}));
  const { id } = body as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data: cur } = await db.from("social_posts").select("status").eq("id", id).eq("workspace_id", ws).single();
  if (!cur) return NextResponse.json({ error: "not found" }, { status: 404 });
  // A post that is going out or has gone out cannot be edited here.
  if (cur.status === "publishing" || cur.status === "posted") return NextResponse.json({ error: "inlägget är redan publicerat" }, { status: 409 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.caption === "string") patch.caption = body.caption;
  if (typeof body.label === "string") patch.label = body.label;
  if (typeof body.kind === "string" && KINDS.includes(body.kind)) patch.kind = body.kind;
  if (typeof body.scheduled_at === "string" && !Number.isNaN(Date.parse(body.scheduled_at))) patch.scheduled_at = new Date(body.scheduled_at).toISOString();
  if (body.status === "approved") { patch.status = "approved"; patch.approved_at = new Date().toISOString(); patch.ig_error = null; patch.fb_error = null; }
  if (body.status === "draft") { patch.status = "draft"; patch.approved_at = null; }
  const { data, error } = await db.from("social_posts").update(patch).eq("id", id).eq("workspace_id", ws).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data });
}

// DELETE ?id= - only posts that have not gone out.
export async function DELETE(req: NextRequest) {
  const db = createServerSupabase();
  const ws = await getWorkspaceId();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data, error } = await db.from("social_posts").delete().eq("id", id).eq("workspace_id", ws).in("status", ["draft", "approved", "failed"]).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "kan inte ta bort ett publicerat inlägg" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
