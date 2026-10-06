import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { fillMissingCaptions } from "@/lib/social-caption-fill";

export const maxDuration = 800;

// POST - write captions for every future draft that has none (see social-caption-fill.ts).
export async function POST() {
  return NextResponse.json(await fillMissingCaptions(createServerSupabase(), await getWorkspaceId()));
}
