import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { buildDefaultQuiz, buildDefaultSettings } from "@/lib/quiz-defaults";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { workspace_id: string; market: "se" | "dk" | "no"; name: string };
  const { workspace_id, market, name } = body;
  if (!workspace_id || !market || !name) {
    return NextResponse.json({ error: "workspace_id, market, name required" }, { status: 400 });
  }
  const baseSlug =
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "quiz";
  const slug = `${baseSlug}-${Date.now().toString(36).slice(-4)}`;
  const db = createServerSupabase();
  const { data, error } = await db
    .from("quizzes")
    .insert({
      workspace_id,
      market,
      slug,
      name,
      status: "draft",
      data: buildDefaultQuiz(),
      settings: buildDefaultSettings(),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function GET(req: NextRequest) {
  const workspace_id = req.nextUrl.searchParams.get("workspace_id");
  const market = req.nextUrl.searchParams.get("market");
  const db = createServerSupabase();
  let query = db
    .from("quizzes")
    .select("*")
    .neq("status", "archived")
    .order("updated_at", { ascending: false });
  if (workspace_id) query = query.eq("workspace_id", workspace_id);
  if (market) query = query.eq("market", market);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
