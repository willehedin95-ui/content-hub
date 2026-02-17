import { NextResponse } from "next/server";
import { verifyConnection } from "@/lib/meta";

export async function GET() {
  try {
    const info = await verifyConnection();
    return NextResponse.json(info);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Connection failed" },
      { status: 500 }
    );
  }
}
