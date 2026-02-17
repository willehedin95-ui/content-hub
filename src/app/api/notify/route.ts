import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { sendJobCompleteEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const { jobId, email } = (await req.json()) as {
    jobId: string;
    email: string;
  };

  if (!jobId || !email) {
    return NextResponse.json({ error: "jobId and email are required" }, { status: 400 });
  }

  const db = createServerSupabase();

  const { data: job, error: jobError } = await db
    .from("image_jobs")
    .select(`*, source_images(id)`)
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  try {
    await sendJobCompleteEmail(
      email,
      job.name,
      job.source_images?.length ?? 0,
      job.target_languages?.length ?? 0,
      !!job.exported_at
    );

    await db
      .from("image_jobs")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", jobId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send email" },
      { status: 500 }
    );
  }
}
