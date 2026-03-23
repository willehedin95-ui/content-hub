import { NextRequest, NextResponse } from "next/server";
import { testGscConnection, isGscConfigured } from "@/lib/gsc";

export async function POST(req: NextRequest) {
  if (!isGscConfigured()) {
    return NextResponse.json({
      ok: false,
      error: "Google service account not configured. Set GDRIVE_SERVICE_ACCOUNT_EMAIL and GDRIVE_PRIVATE_KEY env vars.",
    });
  }

  const { property } = await req.json();
  if (!property || typeof property !== "string") {
    return NextResponse.json({ ok: false, error: "Missing property URL" });
  }

  const result = await testGscConnection(property);
  return NextResponse.json(result);
}
