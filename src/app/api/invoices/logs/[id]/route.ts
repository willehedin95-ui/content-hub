import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { retryForward, forwardLogToJuni } from "@/lib/invoice-mail";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const db = createServerSupabase();

  // Forward to Juni: send a "ready" log to Juni
  if (body.action === "forward") {
    try {
      const result = await forwardLogToJuni(id);
      return NextResponse.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Retry forward: delete the log and re-process
  if (body.action === "retry") {
    try {
      // Get the log entry to find the email UID and service
      const { data: log, error: logErr } = await db
        .from("invoice_logs")
        .select("*, invoice_services(*)")
        .eq("id", id)
        .single();

      if (logErr || !log) return safeError(logErr, "Log not found");

      const emailUid = parseInt(log.email_uid, 10);
      if (!emailUid) {
        return NextResponse.json({ error: "No email UID to retry" }, { status: 400 });
      }

      // Delete the old log entry so processInvoices won't skip it
      await db.from("invoice_logs").delete().eq("id", id);

      // Re-process this specific email
      const result = await retryForward(emailUid, log.invoice_services);
      return NextResponse.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.status !== undefined) update.status = body.status;
  if (body.notes !== undefined) update.notes = body.notes;

  const { data, error } = await db
    .from("invoice_logs")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return safeError(error, "Failed to update log");
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  const { error } = await db.from("invoice_logs").delete().eq("id", id);
  if (error) return safeError(error, "Failed to delete log");
  return NextResponse.json({ ok: true });
}
