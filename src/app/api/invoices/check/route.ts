import { NextResponse } from "next/server";
import { processInvoices, testImapConnection } from "@/lib/invoice-mail";

export const maxDuration = 60;

export async function POST() {
  try {
    const result = await processInvoices();
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[invoice-check] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  // Simple connection test
  try {
    const info = await testImapConnection();
    return NextResponse.json({ ok: true, ...info });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
