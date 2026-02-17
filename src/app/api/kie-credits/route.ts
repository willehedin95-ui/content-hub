import { NextResponse } from "next/server";
import { getCredits } from "@/lib/kie";

export async function GET() {
  try {
    const { balance } = await getCredits();
    return NextResponse.json({ balance });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch credits" },
      { status: 500 }
    );
  }
}
