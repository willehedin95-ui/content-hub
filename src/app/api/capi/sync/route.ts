import { NextRequest, NextResponse } from "next/server";
import { syncOrdersToCAPI } from "@/lib/meta-capi";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { days = 30 } = await req.json().catch(() => ({}));
    const result = await syncOrdersToCAPI(days);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
