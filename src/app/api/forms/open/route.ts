// Publik: en oppning av ett formular, for trattanalysen i /forms/progressbild.
//
// POST /api/forms/open  { workspace, slug, market, kalla, steg, besokare }
//
// Utan den har finns bara de som SKICKADE IN. Den intressanta siffran ar hur
// manga som oppnade och sedan inte gjorde det - det ar dar ett flode tappar
// folk, och det ar det enda stallet dar en dalig forsta skarm syns i datan.
//
// Vi raknar oppningar, inte scanningar. En QR-kod som scannas men aldrig tappas
// gor ingen forfragan alls, sa den sortens scan finns inte att rakna.
//
// Ingen adress, ingen IP, ingen cookie. `besokare` ar ett slumpat id ur
// sessionStorage och lever bara sa lange fliken gor det - det racker for att
// skilja en omladdning fran en ny person, och racker inte till nagot annat.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getFormsCORSHeaders, handleFormsOptions } from "../_cors";

export async function OPTIONS(req: NextRequest) {
  return handleFormsOptions(req.headers.get("origin"));
}

const KALLOR = new Set(["qr", "mail", "direkt"]);

export async function POST(req: NextRequest) {
  const cors = getFormsCORSHeaders(req.headers.get("origin"));
  const svar = (status = 204) => new NextResponse(null, { status, headers: cors });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return svar(400);
  }

  const workspaceSlug = String(body.workspace ?? "").trim().toLowerCase();
  const slug = String(body.slug ?? "").trim().toLowerCase();
  const market = (String(body.market ?? "se").trim().toLowerCase() || "se").slice(0, 8);
  if (!workspaceSlug || !slug) return svar(400);

  // Fritext fran en publik endpoint far aldrig ga rakt in i en kolumn som en
  // rapport sedan grupperar pa. Kallan maste vara en av vara egna.
  const raw = String(body.kalla ?? "direkt").trim().toLowerCase();
  const kalla = KALLOR.has(raw) ? raw : "direkt";
  const steg = String(body.steg ?? "").trim().slice(0, 4) || null;
  const besokare = String(body.besokare ?? "").trim().slice(0, 64) || null;

  const db = createServerSupabase();
  const { data: workspace } = await db
    .from("workspaces").select("id").eq("slug", workspaceSlug).single<{ id: string }>();
  if (!workspace) return svar(204);

  const { data: form } = await db
    .from("forms").select("id")
    .eq("workspace_id", workspace.id).eq("slug", slug).eq("market", market)
    .eq("status", "published").single<{ id: string }>();
  if (!form) return svar(204);

  // En loggning ska aldrig kunna stjalpa sidan som loggar. Fel svaljs med
  // flit och svaret ar 204 oavsett.
  await db.from("form_opens").insert({
    workspace_id: workspace.id,
    form_id: form.id,
    market,
    kalla,
    steg,
    besokare,
  });

  return svar();
}
