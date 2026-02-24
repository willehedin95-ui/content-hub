import { NextRequest, NextResponse } from "next/server";
import { testClarityConnection } from "@/lib/clarity";

export async function POST(req: NextRequest) {
  try {
    const { apiToken } = await req.json();
    if (!apiToken || typeof apiToken !== "string") {
      return NextResponse.json({ error: "apiToken is required" }, { status: 400 });
    }

    const result = await testClarityConnection(apiToken.trim());
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Test failed" },
      { status: 500 }
    );
  }
}
