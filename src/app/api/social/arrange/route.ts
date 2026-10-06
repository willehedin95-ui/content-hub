import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { arrangeQueue } from "@/lib/social-arrange-queue";

// POST - put the whole queue in Claude's order (see social-arrange.ts). Also runs after every upload.
export async function POST() {
  const { moved } = await arrangeQueue(createServerSupabase(), await getWorkspaceId());
  return NextResponse.json({ moved });
}
