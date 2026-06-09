import { NextRequest, NextResponse } from "next/server";
import { generateBrandIdeas } from "@/lib/brand-ideas";

export const maxDuration = 60;

// Publik (vitlistad via /api/bcheck-prefix) - token i body.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { theme?: unknown; token?: unknown };
  const secret = process.env.BRAND_CHECK_TOKEN;
  if (!(typeof secret === "string" && secret.length > 0 && body.token === secret)) {
    return NextResponse.json({ error: "Ej behörig" }, { status: 401 });
  }
  try {
    const names = await generateBrandIdeas(typeof body.theme === "string" ? body.theme : undefined);
    return NextResponse.json({ names });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "fel" }, { status: 500 });
  }
}
