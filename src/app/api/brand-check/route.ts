import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { checkBrandName, type BrandCheckResult } from "@/lib/brand-check";

export const maxDuration = 120;

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dagar

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  let body: { names?: unknown; niceClasses?: unknown; offices?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  const rawNames = Array.isArray(body.names) ? body.names : [];
  const names = Array.from(
    new Set(
      rawNames
        .filter((n): n is string => typeof n === "string")
        .map((n) => n.trim())
        .filter(Boolean)
    )
  ).slice(0, 40); // tak: 40 namn per anrop (skydd mot TMview-strypning)

  if (names.length === 0) {
    return NextResponse.json({ error: "Inga namn angivna" }, { status: 400 });
  }

  const niceClasses = typeof body.niceClasses === "string" ? body.niceClasses : "3,5";
  const offices = typeof body.offices === "string" ? body.offices : "EM,SE,DK,NO";
  const officesArr = offices.split(",").map((s) => s.trim()).filter(Boolean);
  const niceArr = niceClasses.split(",").map((s) => s.trim()).filter(Boolean);

  const supabase = createServerSupabase();
  const results: BrandCheckResult[] = [];

  // Hämta cache för alla namn i förväg
  const { data: cached } = await supabase
    .from("brand_check_cache")
    .select("name, result, checked_at")
    .in("name", names)
    .eq("nice_classes", niceClasses)
    .eq("offices", offices);

  const cacheMap = new Map<string, { result: BrandCheckResult; checked_at: string }>();
  for (const row of cached ?? []) {
    cacheMap.set(row.name as string, {
      result: row.result as BrandCheckResult,
      checked_at: row.checked_at as string,
    });
  }

  let didNetwork = false;
  for (const name of names) {
    const hit = cacheMap.get(name);
    const fresh = hit && Date.now() - new Date(hit.checked_at).getTime() < CACHE_TTL_MS;
    if (fresh) {
      results.push(hit!.result);
      continue;
    }

    // Var snäll mot TMview: liten paus mellan riktiga nätverksanrop
    if (didNetwork) await sleep(300);
    didNetwork = true;

    const result = await checkBrandName(name, { offices: officesArr, niceClasses: niceArr });
    results.push(result);

    // Cacha bara lyckade resultat (aldrig fel - så ett fel inte fastnar i cachen)
    if (result.trademark.status !== "error" && result.dotcom.available !== null) {
      await supabase.from("brand_check_cache").upsert(
        {
          name,
          nice_classes: niceClasses,
          offices,
          result,
          checked_at: new Date().toISOString(),
        },
        { onConflict: "name,nice_classes,offices" }
      );
    }
  }

  return NextResponse.json({ results });
}
