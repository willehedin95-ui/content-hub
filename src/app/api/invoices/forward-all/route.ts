import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { forwardLogToJuni } from "@/lib/invoice-mail";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const period = body.period;
  if (!period) {
    return NextResponse.json({ error: "period is required" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Get all unsent logs for this period:
  // - "pending" entries (detected but not yet sent to Juni)
  const { data: logs, error } = await db
    .from("invoice_logs")
    .select("id, status, pdf_storage_path, forwarded_at")
    .eq("status", "pending")
    .eq("period", period)
    .not("service_id", "is", null);

  // Filter: only include entries that have a PDF and haven't been forwarded yet
  const forwardable = (logs || []).filter((l: { status: string; pdf_storage_path: string | null; forwarded_at: string | null }) => {
    return l.pdf_storage_path && !l.forwarded_at;
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (forwardable.length === 0) {
    return NextResponse.json({ forwarded: 0, errors: 0, total: 0 });
  }

  let forwarded = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  for (const log of forwardable) {
    const result = await forwardLogToJuni(log.id);
    if (result.success) {
      forwarded++;
    } else {
      errors++;
      errorDetails.push(result.error || "Unknown error");
    }
  }

  return NextResponse.json({ forwarded, errors, total: forwardable.length, errorDetails });
}
