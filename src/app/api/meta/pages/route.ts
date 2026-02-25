import { NextResponse } from "next/server";
import { listPages } from "@/lib/meta";
import { safeError } from "@/lib/api-error";

export async function GET() {
  try {
    const pages = await listPages();
    return NextResponse.json(pages);
  } catch (error) {
    return safeError(error, "Failed to fetch pages");
  }
}
