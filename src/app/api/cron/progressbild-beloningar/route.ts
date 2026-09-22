import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { trackedCronRoute } from "@/lib/cron-tracker";
import { omforsokMisslyckadeBeloningar } from "@/lib/progressbild-beloning";

export const maxDuration = 300;

const WORKSPACE = "hydro13";

/**
 * Plockar upp de progressbildsbeloningar som fastnade pa "kraver-manuell" och
 * forsoker igen. Lyckas det gar bekraftelsen till kunden da.
 *
 * Varfor det behovs: beloningen beviljas i samma ogonblick som sista bilden
 * laddas upp, och Loop eller Shopify kan saga nej just da. Utan en omgang till
 * blir raden en atervandsgrand - adressen ar last, kunden har inga pengar, och
 * ingen far veta. Det hande pa riktigt 2026-09-21, da ett Loop-anrop small pa
 * ett saknat falt och kunden fick "vi hor av oss" i stallet for sitt avdrag.
 */
async function handleCron(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isManual = req.nextUrl.searchParams.get("manual") === "true";
  if (!isManual && (!cronSecret || authHeader !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();
  const { data: ws } = await db
    .from("workspaces").select("id").eq("slug", WORKSPACE).single<{ id: string }>();
  if (!ws) return NextResponse.json({ error: "okand workspace" }, { status: 404 });

  const resultat = await omforsokMisslyckadeBeloningar(ws.id);
  const lyckade = resultat.filter((r) => r.resultat === "loop-avdrag" || r.resultat === "rabattkod");

  return NextResponse.json({
    ok: true,
    forsokta: resultat.length,
    lyckade: lyckade.length,
    resultat,
  });
}

export const GET = trackedCronRoute("progressbild-beloningar", handleCron);
