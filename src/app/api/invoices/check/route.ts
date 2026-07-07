import { NextResponse } from "next/server";
import { processInvoices, testImapConnection } from "@/lib/invoice-mail";
import { createServerSupabase } from "@/lib/supabase-admin";

export const maxDuration = 60;

// Run lock: invoice_imap_state has no lock column (only last_uid_validity /
// last_processed_uid / last_run_at), so this is a module-level in-memory
// guard. LIMITATION: it only prevents overlapping runs within the same warm
// serverless instance - two parallel cold-start instances can still overlap.
// The Promise.race timeout doesn't cancel processInvoices, so without this a
// double-click meant two concurrent IMAP scans in the same instance.
// Auto-expires after 2 min in case a run dies without reaching finally.
let runningSince: number | null = null;
const RUN_LOCK_TTL_MS = 120_000;

export async function POST() {
  if (runningSince && Date.now() - runningSince < RUN_LOCK_TTL_MS) {
    return NextResponse.json(
      { error: "An inbox scan is already running - try again when it finishes." },
      { status: 409 }
    );
  }
  runningSince = Date.now();
  try {
    const result = await Promise.race([
      processInvoices(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Inbox scan timed out after 55 seconds")), 55_000)
      ),
    ]);

    // Fetch last_run_at for the response
    const db = createServerSupabase();
    const { data: state } = await db
      .from("invoice_imap_state")
      .select("last_run_at")
      .eq("account_id", "hostinger")
      .single();

    runningSince = null;
    return NextResponse.json({
      ...result,
      last_run_at: state?.last_run_at || null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[invoice-check] Error:", msg);
    if (msg.includes("timed out")) {
      // The orphaned processInvoices may still be running - keep the lock and
      // let the TTL expire instead of allowing an immediate overlapping re-run.
      return NextResponse.json({ error: msg }, { status: 500 });
    }
    runningSince = null;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  // Note: lock cleared explicitly on success/non-timeout error (no finally -
  // the timeout branch intentionally keeps the lock until TTL expiry).
}

export async function GET() {
  try {
    const info = await testImapConnection();

    // Also return last_run_at
    const db = createServerSupabase();
    const { data: state } = await db
      .from("invoice_imap_state")
      .select("last_run_at")
      .eq("account_id", "hostinger")
      .single();

    return NextResponse.json({
      ok: true,
      ...info,
      last_run_at: state?.last_run_at || null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
