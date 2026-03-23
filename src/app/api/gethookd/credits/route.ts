import { NextResponse } from "next/server";
import { getMonthlyCreditsUsed } from "@/lib/gethookd";

export async function GET() {
  try {
    const credits = await getMonthlyCreditsUsed();
    return NextResponse.json(credits);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch credits" },
      { status: 500 }
    );
  }
}
