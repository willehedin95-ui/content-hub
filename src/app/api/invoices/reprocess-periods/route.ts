import { NextResponse } from "next/server";
import { reprocessPeriods } from "@/lib/invoice-mail";

export const maxDuration = 60;

export async function POST() {
  try {
    const result = await Promise.race([
      reprocessPeriods(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Reprocess timed out after 50 seconds")), 50_000)
      ),
    ]);

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reprocess-periods] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
