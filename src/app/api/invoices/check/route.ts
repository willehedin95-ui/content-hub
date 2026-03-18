import { NextResponse } from "next/server";
import { processInvoices, testImapConnection } from "@/lib/invoice-mail";
import { createServerSupabase } from "@/lib/supabase-admin";

export const maxDuration = 60;

export async function POST() {
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

    return NextResponse.json({
      ...result,
      last_run_at: state?.last_run_at || null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[invoice-check] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
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
