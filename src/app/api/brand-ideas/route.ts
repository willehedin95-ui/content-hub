import { NextRequest, NextResponse } from "next/server";
import { generateBrandIdeas } from "@/lib/brand-ideas";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { theme?: unknown };
  try {
    const names = await generateBrandIdeas(typeof body.theme === "string" ? body.theme : undefined);
    return NextResponse.json({ names });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "fel" }, { status: 500 });
  }
}
