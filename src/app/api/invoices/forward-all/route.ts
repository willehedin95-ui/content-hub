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

  // Get all "ready" logs for this period, excluding invoice-type services
  // (invoice services need manual download+upload, not auto-forward)
  const { data: invoiceServiceIds } = await db
    .from("invoice_services")
    .select("id")
    .eq("forward_to", "invoices");
  const excludeIds = (invoiceServiceIds || []).map((s: { id: string }) => s.id);

  let query = db
    .from("invoice_logs")
    .select("id")
    .eq("status", "ready")
    .eq("period", period)
    .not("service_id", "is", null);

  if (excludeIds.length > 0) {
    query = query.not("service_id", "in", `(${excludeIds.join(",")})`);
  }

  const { data: logs, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!logs || logs.length === 0) {
    return NextResponse.json({ forwarded: 0, errors: 0, total: 0 });
  }

  let forwarded = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  for (const log of logs) {
    const result = await forwardLogToJuni(log.id);
    if (result.success) {
      forwarded++;
    } else {
      errors++;
      errorDetails.push(result.error || "Unknown error");
    }
  }

  return NextResponse.json({ forwarded, errors, total: logs.length, errorDetails });
}
