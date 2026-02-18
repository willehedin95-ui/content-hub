import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function GET() {
  const db = createServerSupabase();

  const { data: jobs, error } = await db
    .from("ad_copy_jobs")
    .select(`*, ad_copy_translations(*)`)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(jobs ?? []);
}

export async function POST(req: NextRequest) {
  const { name, source_text, target_languages, product } = (await req.json()) as {
    name?: string;
    source_text?: string;
    target_languages?: string[];
    product?: string;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!source_text?.trim()) {
    return NextResponse.json({ error: "Source text is required" }, { status: 400 });
  }
  if (!target_languages?.length) {
    return NextResponse.json({ error: "Target languages required" }, { status: 400 });
  }

  const db = createServerSupabase();

  const { data: job, error: jobError } = await db
    .from("ad_copy_jobs")
    .insert({
      name: name.trim(),
      source_text: source_text.trim(),
      target_languages,
      status: "processing",
      ...(product ? { product } : {}),
    })
    .select()
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: jobError?.message ?? "Failed to create job" }, { status: 500 });
  }

  // Create translation rows for each language
  const rows = target_languages.map((lang) => ({
    job_id: job.id,
    language: lang,
    status: "pending",
  }));

  await db.from("ad_copy_translations").insert(rows);

  const { data: fullJob } = await db
    .from("ad_copy_jobs")
    .select(`*, ad_copy_translations(*)`)
    .eq("id", job.id)
    .single();

  return NextResponse.json(fullJob);
}
