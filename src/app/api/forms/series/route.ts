// Publik: kundens egen bildserie i ETT formular, uppslagen pa en signerad token.
//
// GET /api/forms/series?t=<token>&workspace=hydro13&slug=progressbild&market=se
//
// Finns for att formularet ska kunna visa hennes FORRA bild bredvid
// uppladdningen. Mailet kunde redan det (eventet bar URL:erna), men det ar i
// formularet hon star med telefonen och ska traffa samma vinkel igen.
//
// Uppslaget gar ALDRIG pa en inskriven e-postadress. Adressen kommer ur en
// HMAC-signerad token, annars hade vem som helst kunnat skriva in en adress och
// fa ut nagon annans ansiktsbilder.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { emailFromToken } from "@/lib/forms-token";
import { getFormsCORSHeaders, handleFormsOptions } from "../_cors";
import type { FormRow, FormSubmissionRow } from "@/types/forms";

export async function OPTIONS(req: NextRequest) {
  return handleFormsOptions(req.headers.get("origin"));
}

export async function GET(req: NextRequest) {
  const cors = getFormsCORSHeaders(req.headers.get("origin"));
  const q = req.nextUrl.searchParams;
  const token = (q.get("t") || "").trim();
  const workspaceSlug = (q.get("workspace") || "").trim().toLowerCase();
  const slug = (q.get("slug") || "").trim().toLowerCase();
  const market = (q.get("market") || "se").trim().toLowerCase();

  // Tyst nej pa allt som inte stammer. En token som inte gar att verifiera ska
  // inte kunna skiljas fran en kund som inte finns - annars blir svaret ett
  // satt att rakna ut vilka adresser som deltar.
  const tom = NextResponse.json(
    { ok: true, known: false },
    { headers: { ...cors, "Cache-Control": "private, no-store" } }
  );
  if (!token || !workspaceSlug || !slug) return tom;

  let email: string | null = null;
  try {
    email = emailFromToken(token);
  } catch {
    return tom;
  }
  if (!email) return tom;

  const supabase = createServerSupabase();
  const { data: workspace } = await supabase
    .from("workspaces").select("id").eq("slug", workspaceSlug).single<{ id: string }>();
  if (!workspace) return tom;

  const { data: form } = await supabase
    .from("forms").select("id")
    .eq("workspace_id", workspace.id).eq("slug", slug).eq("market", market)
    .eq("status", "published").single<Pick<FormRow, "id">>();
  if (!form) return tom;

  const { data } = await supabase
    .from("form_submissions")
    .select("payload, files, created_at")
    .eq("form_id", form.id)
    .eq("email", email)
    .eq("is_test", false)
    .order("created_at", { ascending: true })
    .limit(20);

  // En bild per steg, senaste vinner - samma hopslagning som leveranslagret
  // gor. Laddar hon om sidan och skickar in igen ar det fortfarande ETT
  // tillfalle, inte tva.
  const steps: Record<string, { url: string; at: string }> = {};
  for (const row of (data ?? []) as Pick<FormSubmissionRow, "payload" | "files" | "created_at">[]) {
    const file = (row.files ?? [])[0];
    if (!file?.url) continue;
    const step = (row.payload ?? []).find((a) => a.key === "steg");
    const key = step ? String(step.value ?? "") : "";
    if (!key) continue;
    steps[key] = { url: file.url, at: row.created_at };
  }

  const nycklar = Object.keys(steps).sort();
  // SENAST I TID, inte hogsta stegnummer. Forut togs steps[sista nyckeln],
  // vilket gav dag 60-bilden till en kund som hoppat over dag 30 och sedan
  // fyller i den - alltsa fel bild som vinkelguide, och kronologiskt bakvant.
  const senaste = nycklar.length
    ? nycklar
        .map((k) => steps[k])
        .reduce((a, b) => (new Date(b.at) > new Date(a.at) ? b : a))
    : null;
  const forsta = nycklar.length ? steps[nycklar[0]] : null;

  return NextResponse.json(
    {
      ok: true,
      known: true,
      email,
      steps: Object.fromEntries(nycklar.map((k) => [k, steps[k].url])),
      count: nycklar.length,
      latestUrl: senaste?.url ?? null,
      // Dagar sedan startbilden. Later mailet och formularet skriva "dag 34"
      // nar hon faktiskt laddar upp dag 34, i stallet for att pasta "DAG 30"
      // for alla - etiketten ska beskriva hennes resa, inte vart schema.
      daysSinceFirst: forsta
        ? Math.max(0, Math.round((Date.now() - new Date(forsta.at).getTime()) / 86400000))
        : null,
    },
    { headers: { ...cors, "Cache-Control": "private, no-store" } }
  );
}
