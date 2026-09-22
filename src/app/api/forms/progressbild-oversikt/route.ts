// Underlaget till /forms/progressbild: tratten, kallorna och varje deltagare
// med sina svar och sina bilder.
//
// Bakom hubbens inloggning - raden bar kundens adress och hennes ansiktsbilder,
// och far darfor aldrig ligga i den publika formulars-allowlisten.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import type { FormSubmissionRow } from "@/types/forms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKSPACE = "hydro13";
const SLUG = "progressbild";
const MARKET = "se";

/** Stegen i serien. Namnen ar schemats, inte de faktiska dagarna - en enskild
 *  kund kan ligga fore eller efter, och det syns pa hennes egna datum. */
const STEG = [
  { steg: "1", namn: "Dag 1" },
  { steg: "2", namn: "Dag 30" },
  { steg: "3", namn: "Dag 60" },
];

/** Faltens `label` i configen ar tomma - fragetexten star i bildspelet bredvid,
 *  inte pa faltet. Rubrikerna hor alltsa hemma har. */
const FRAGA: Record<string, string> = {
  mal: "Vill förbättra",
  markt: "Märkt skillnad",
};

type Rad = Pick<FormSubmissionRow, "payload" | "files" | "created_at" | "email" | "is_test">;

export async function GET() {
  const db = createServerSupabase();

  const { data: ws } = await db
    .from("workspaces").select("id").eq("slug", WORKSPACE).single<{ id: string }>();
  if (!ws) return NextResponse.json({ error: "okand workspace" }, { status: 404 });

  const { data: form } = await db
    .from("forms").select("id, config")
    .eq("workspace_id", ws.id).eq("slug", SLUG).eq("market", MARKET)
    .single<{ id: string; config: { fields?: { key?: string; options?: { value?: string; label?: string }[] }[] } }>();
  if (!form) return NextResponse.json({ error: "okant formular" }, { status: 404 });

  // Svarens varden ar maskinkoder ("hair_nails"). Etiketterna star i configen,
  // sa de hamtas darifran i stallet for att dubbleras har - da slipper sidan
  // saga fel nar nagon andrar ett alternativ.
  const etikett: Record<string, Record<string, string>> = {};
  for (const f of form.config?.fields ?? []) {
    if (!f.key || !f.options) continue;
    etikett[f.key] = Object.fromEntries(
      f.options.map((o) => [String(o.value ?? ""), String(o.label ?? o.value ?? "")])
    );
  }

  const [{ data: oppningar }, { data: inskick }, { data: beloningar }] = await Promise.all([
    db.from("form_opens").select("steg, kalla, besokare, created_at").eq("form_id", form.id),
    db.from("form_submissions")
      .select("payload, files, created_at, email, is_test")
      .eq("form_id", form.id).order("created_at", { ascending: true }),
    db.from("progressbild_beloningar").select("email, typ, belopp, rabattkod, beviljad_at"),
  ]);

  const skarpa = ((inskick ?? []) as Rad[]).filter((r) => !r.is_test);

  const svarFor = (r: Rad, nyckel: string) =>
    String((r.payload ?? []).find((a) => a.key === nyckel)?.value ?? "");

  // ---- tratten -------------------------------------------------------------
  const tratt = STEG.map(({ steg, namn }) => {
    const o = (oppningar ?? []).filter((x) => (x.steg ?? "1") === steg);
    const unika = new Set(o.map((x) => x.besokare).filter(Boolean)).size;
    const i = skarpa.filter((r) => svarFor(r, "steg") === steg);
    const adresser = new Set(i.map((r) => (r.email ?? "").toLowerCase()).filter(Boolean));
    return {
      steg,
      namn,
      oppningar: o.length,
      unika,
      inskick: adresser.size,
      // Andelen som gjorde nagot av dem som oppnade. Ar unika 0 sager vi inget
      // hellre an att dividera med noll och visa en falsk hundraprocentare.
      andel: unika > 0 ? Math.round((adresser.size / unika) * 100) : null,
    };
  });

  const kallor = (oppningar ?? []).reduce<Record<string, number>>((acc, o) => {
    const k = o.kalla ?? "direkt";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  // ---- deltagarna ----------------------------------------------------------
  const perAdress = new Map<
    string,
    {
      email: string;
      forsta: string;
      steg: Record<string, { datum: string; bild: string | null }>;
      svar: { fraga: string; varde: string }[];
    }
  >();

  for (const r of skarpa) {
    const email = (r.email ?? "").toLowerCase();
    if (!email) continue;
    const steg = svarFor(r, "steg") || "1";
    const post = perAdress.get(email) ?? {
      email,
      forsta: r.created_at,
      steg: {},
      svar: [],
    };
    // Senaste inskicket per steg vinner, samma hopslagning som delningskortet.
    post.steg[steg] = { datum: r.created_at, bild: (r.files ?? [])[0]?.url ?? null };
    for (const nyckel of Object.keys(FRAGA)) {
      const v = svarFor(r, nyckel);
      if (!v) continue;
      const text = etikett[nyckel]?.[v] ?? v;
      const fraga = `${FRAGA[nyckel]}${nyckel === "markt" ? ` (dag ${steg === "2" ? "30" : "60"})` : ""}`;
      const fanns = post.svar.findIndex((s) => s.fraga === fraga);
      if (fanns >= 0) post.svar[fanns] = { fraga, varde: text };
      else post.svar.push({ fraga, varde: text });
    }
    perAdress.set(email, post);
  }

  const belPerAdress = new Map(
    (beloningar ?? []).map((b) => [String(b.email).toLowerCase(), b])
  );

  const deltagare = [...perAdress.values()]
    .map((p) => ({
      ...p,
      antalBilder: Object.keys(p.steg).length,
      beloning: belPerAdress.get(p.email) ?? null,
    }))
    .sort((a, b) => (a.forsta < b.forsta ? 1 : -1));

  // Nar loggningen borjade. Utan den ser tratten trasig ut: inskick som gjordes
  // innan oppningsloggen fanns har inget oppningstal, och "0 oppnade / 5
  // inskickade" laser som ett fel i stallet for som en tom historik.
  const loggStart = (oppningar ?? []).reduce<string | null>(
    (min, o) => (min === null || o.created_at < min ? o.created_at : min),
    null
  );

  return NextResponse.json(
    {
      loggStart,
      tratt,
      kallor,
      deltagare,
      antalTest: ((inskick ?? []) as Rad[]).filter((r) => r.is_test).length,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
