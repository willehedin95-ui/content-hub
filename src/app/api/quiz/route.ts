import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { isValidMarket } from "@/lib/validation";
import { getWorkspaceId } from "@/lib/workspace";
import { buildDefaultQuiz, buildDefaultSettings } from "@/lib/quiz-defaults";

export async function POST(req: NextRequest) {
  const workspaceId = await getWorkspaceId().catch(() => null);
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    market: string;
    name: string;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { market, name } = body;

  if (!market || !name) {
    return NextResponse.json({ error: "market and name are required" }, { status: 400 });
  }

  if (!isValidMarket(market)) {
    return NextResponse.json(
      { error: `Invalid market. Must be one of: se, dk, no` },
      { status: 400 }
    );
  }

  const baseSlug =
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "quiz";
  const slug = `${baseSlug}-${Date.now().toString(36).slice(-4)}`;

  const db = createServerSupabase();
  const { data, error } = await db
    .from("quizzes")
    .insert({
      workspace_id: workspaceId,
      market,
      slug,
      name,
      status: "draft",
      data: buildDefaultQuiz(),
      settings: buildDefaultSettings(),
    })
    .select()
    .single();

  if (error) return safeError(error, "Failed to create quiz");
  return NextResponse.json(data);
}

export async function GET(req: NextRequest) {
  const workspaceId = await getWorkspaceId().catch(() => null);
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 401 });
  }

  const market = req.nextUrl.searchParams.get("market");

  const db = createServerSupabase();
  let query = db
    .from("quizzes")
    .select("*")
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });

  if (market) query = query.eq("market", market);

  const { data, error } = await query;
  if (error) return safeError(error, "Failed to fetch quizzes");
  return NextResponse.json(data ?? []);
}
