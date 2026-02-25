import { NextResponse } from "next/server";
import { getCAPIStats } from "@/lib/meta-capi";

export async function GET() {
  try {
    const stats = await getCAPIStats();
    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
