import { NextResponse } from "next/server";
import { listPages } from "@/lib/meta";

export async function GET() {
  try {
    const pages = await listPages();
    return NextResponse.json(pages);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch pages" },
      { status: 500 }
    );
  }
}
