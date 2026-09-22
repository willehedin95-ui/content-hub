// Publik: VILKEN beloning kunden faktiskt fick, uppslagen pa en signerad token.
//
// GET /api/forms/beloning?t=<token>
//
// Finns for att kvittensskarmen ska sluta ljuga. Den pastod att ett presentkort
// var pa vag till mailen - men en prenumerant far i stallet 200 kr draget pa
// nasta leverans, och da stammer inte ett ord av det. Vilken vag det blev
// avgors forst nar beloningen beviljas, sa skarmen far fraga.
//
// Beloningen beviljas i submit-routens after() och ar alltsa inte alltid klar
// i samma ogonblick som kvittensen ritas. Svaret bar darfor `typ: null` som ett
// giltigt lage, och klienten fragar om igen en kort stund.
//
// Uppslaget gar pa token och aldrig pa en inskriven adress - annars hade vem
// som helst kunnat skriva in en adress och lasa av om den kunden ar
// prenumerant. Samma regel som /api/forms/series.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { emailFromToken } from "@/lib/forms-token";
import { getFormsCORSHeaders, handleFormsOptions } from "../_cors";

export async function OPTIONS(req: NextRequest) {
  return handleFormsOptions(req.headers.get("origin"));
}

export async function GET(req: NextRequest) {
  const cors = getFormsCORSHeaders(req.headers.get("origin"));
  const huvuden = { ...cors, "Cache-Control": "private, no-store" };
  const token = (req.nextUrl.searchParams.get("t") || "").trim();

  // Tyst nej pa allt som inte stammer, av samma skal som serieuppslaget: ett
  // sarskiljbart fel hade gjort svaret till ett satt att rakna ut vilka
  // adresser som deltar.
  const tom = NextResponse.json({ ok: true, typ: null }, { headers: huvuden });
  if (!token) return tom;

  let email: string | null = null;
  try {
    email = emailFromToken(token);
  } catch {
    return tom;
  }
  if (!email) return tom;

  const db = createServerSupabase();
  const { data } = await db
    .from("progressbild_beloningar")
    .select("typ, belopp, rabattkod")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle<{ typ: string; belopp: number; rabattkod: string | null }>();

  if (!data) return tom;

  // "kraver-manuell" betyder att automatiken inte kom hela vagen. Kunden ska
  // inte se ett tekniskt lage - hon ska se att beloningen finns och att vi
  // hor av oss. Koden lamnas darfor ute i det laget.
  const typ = data.typ === "rabattkod" || data.typ === "loop-avdrag" ? data.typ : "manuell";

  return NextResponse.json(
    {
      ok: true,
      typ,
      belopp: data.belopp,
      rabattkod: typ === "rabattkod" ? data.rabattkod : null,
    },
    { headers: huvuden }
  );
}
