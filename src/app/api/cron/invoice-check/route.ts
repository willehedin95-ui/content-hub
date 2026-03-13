import { NextRequest, NextResponse } from "next/server";
import { processInvoices } from "@/lib/invoice-mail";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processInvoices();
    console.log("[cron/invoice-check] Result:", result);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/invoice-check] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
