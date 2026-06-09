import { NextRequest, NextResponse } from "next/server";
import { runBrandChecks } from "@/lib/brand-check";

export const maxDuration = 120;

// Publik route (vitlistad i middleware) - skyddad av en hemlig token i body.
function validToken(t: unknown): boolean {
  const secret = process.env.BRAND_CHECK_TOKEN;
  return typeof secret === "string" && secret.length > 0 && typeof t === "string" && t === secret;
}

export async function POST(req: NextRequest) {
  let body: { names?: unknown; niceClasses?: unknown; offices?: unknown; token?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }
  if (!validToken(body.token)) {
    return NextResponse.json({ error: "Ej behörig" }, { status: 401 });
  }
  const names = Array.isArray(body.names) ? (body.names.filter((n) => typeof n === "string") as string[]) : [];
  if (names.length === 0) return NextResponse.json({ error: "Inga namn angivna" }, { status: 400 });
  const niceClasses = typeof body.niceClasses === "string" ? body.niceClasses : "3,5";
  const offices = typeof body.offices === "string" ? body.offices : "EM,WO,US,GB,SE,DK,NO,FI";

  const results = await runBrandChecks(names, niceClasses, offices);
  return NextResponse.json({ results });
}
