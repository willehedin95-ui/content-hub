import { NextRequest, NextResponse } from "next/server";
import { testGA4Connection } from "@/lib/ga4";

export async function POST(req: NextRequest) {
  try {
    const { propertyId } = await req.json();
    if (!propertyId || typeof propertyId !== "string") {
      return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
    }

    const result = await testGA4Connection(propertyId.trim());
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Test failed" },
      { status: 500 }
    );
  }
}
