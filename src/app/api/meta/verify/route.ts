import { NextResponse } from "next/server";
import { verifyConnection } from "@/lib/meta";
import { safeError } from "@/lib/api-error";

export async function GET() {
  try {
    const info = await verifyConnection();
    return NextResponse.json(info);
  } catch (error) {
    return safeError(error, "Connection failed");
  }
}
