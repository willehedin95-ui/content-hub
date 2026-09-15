// Delningskortet: kundens forsta och sista bild bredvid varandra, i Envanas
// ram, som en fardig bild hon kan spara eller dela.
//
// Serverrenderad med sharp och inte som CSS i formuläret, av tva skal: en
// skarmdump av en webblayout bar hennes telefons statusrad med sig, och en
// bild gar att lagga i navigator.share medan en div inte gor det.
//
// Uppslaget gar pa den SIGNERADE token, aldrig pa en inskriven e-post -
// bucketen ar publik med ogissbara sokvagar, sa ett adressuppslag hade latit
// vem som helst hamta ut andras ansiktsbilder. Samma regel som /api/forms/series.

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createServerSupabase } from "@/lib/supabase-admin";
import { emailFromToken } from "@/lib/forms-token";
import type { FormRow, FormSubmissionRow } from "@/types/forms";

export const runtime = "nodejs";

const B = 1080;
const H = 1350;
const BRAND = "#f0573d";
const BG = "#fefaf8";
const TEXT = "#320d01";

/** Bildrutornas matt. Tva rutor i 4:5 sida vid sida med samma luft runt om. */
const MARGIN = 60;
const GAP = 24;
const CELL_W = Math.floor((B - MARGIN * 2 - GAP) / 2);
const CELL_H = Math.round((CELL_W * 5) / 4);
const TOP = 250;

function etikettSvg(rubrik: string, v: string, hoger: string): Buffer {
  // Texten ritas som SVG och komponeras in. Inga externa fonter i en
  // serverrendering - systemets egna stacknamn racker for versaler.
  const font = "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";
  const etikettY = TOP + CELL_H + 68;
  return Buffer.from(`<svg width="${B}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <text x="${B / 2}" y="140" text-anchor="middle" font-family="${font}"
        font-size="52" font-weight="800" fill="${TEXT}" letter-spacing="-0.5">${rubrik}</text>
  <text x="${MARGIN + CELL_W / 2}" y="${etikettY}" text-anchor="middle"
        font-family="${font}" font-size="34" font-weight="800"
        fill="${TEXT}" letter-spacing="2">${v}</text>
  <text x="${MARGIN + CELL_W + GAP + CELL_W / 2}" y="${etikettY}" text-anchor="middle"
        font-family="${font}" font-size="34" font-weight="800"
        fill="${BRAND}" letter-spacing="2">${hoger}</text>
  <text x="${B / 2}" y="${etikettY + 92}" text-anchor="middle" font-family="${font}"
        font-size="33" font-weight="500" fill="${TEXT}" opacity="0.6">Samma plats, samma ljus, ingen retusch.</text>
  <text x="${B / 2}" y="${H - 96}" text-anchor="middle" font-family="${font}"
        font-size="30" font-weight="700" fill="${TEXT}" opacity="0.5"
        letter-spacing="7">ENVANA</text>
</svg>`);
}

async function hamta(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  const workspaceSlug = req.nextUrl.searchParams.get("workspace") || "hydro13";
  const slug = req.nextUrl.searchParams.get("slug") || "progressbild";
  const market = (req.nextUrl.searchParams.get("market") || "se").toLowerCase();

  let email: string | null = null;
  try {
    email = token ? emailFromToken(token) : null;
  } catch {
    email = null;
  }
  if (!email) return new NextResponse("okand token", { status: 404 });

  const supabase = createServerSupabase();
  const { data: workspace } = await supabase
    .from("workspaces").select("id").eq("slug", workspaceSlug).single<{ id: string }>();
  if (!workspace) return new NextResponse("okand workspace", { status: 404 });

  const { data: form } = await supabase
    .from("forms").select("id")
    .eq("workspace_id", workspace.id).eq("slug", slug).eq("market", market)
    .eq("status", "published").single<Pick<FormRow, "id">>();
  if (!form) return new NextResponse("okant formular", { status: 404 });

  const { data } = await supabase
    .from("form_submissions")
    .select("payload, files, created_at")
    .eq("form_id", form.id).eq("email", email).eq("is_test", false)
    .order("created_at", { ascending: true }).limit(20);

  // En bild per steg, senaste vinner - samma hopslagning som serieuppslaget.
  const steps: Record<string, string> = {};
  for (const row of (data ?? []) as Pick<FormSubmissionRow, "payload" | "files">[]) {
    const file = (row.files ?? [])[0];
    if (!file?.url) continue;
    const step = (row.payload ?? []).find((a) => a.key === "steg");
    const key = step ? String(step.value ?? "") : "";
    if (key) steps[key] = file.url;
  }

  const nycklar = Object.keys(steps).sort();
  if (nycklar.length < 2) {
    return new NextResponse("for fa bilder for ett delningskort", { status: 409 });
  }
  const forstaUrl = steps[nycklar[0]];
  const sistaUrl = steps[nycklar[nycklar.length - 1]];

  const [a, b] = await Promise.all([hamta(forstaUrl), hamta(sistaUrl)]);
  if (!a || !b) return new NextResponse("kunde inte hamta bilderna", { status: 502 });

  const ruta = async (buf: Buffer) =>
    sharp(buf).resize(CELL_W, CELL_H, { fit: "cover", position: "attention" }).toBuffer();
  const [va, vb] = await Promise.all([ruta(a), ruta(b)]);

  // Etiketterna beskriver hennes FAKTISKA serie. Har hon hoppat over dag 30
  // ska kortet inte pasta att hoger bild ar dag 60.
  const dagnamn: Record<string, string> = { "1": "DAG 1", "2": "DAG 30", "3": "DAG 60" };
  const vText = dagnamn[nycklar[0]] ?? "FÖRE";
  const hText = dagnamn[nycklar[nycklar.length - 1]] ?? "EFTER";
  const dagtal: Record<string, number> = { "1": 1, "2": 30, "3": 60 };
  const span = (dagtal[nycklar[nycklar.length - 1]] ?? 60) - (dagtal[nycklar[0]] ?? 1) + 1;
  const rubrik = `${span} dagar med Envana`;

  const bild = await sharp({
    create: { width: B, height: H, channels: 3, background: BG },
  })
    .composite([
      { input: va, left: MARGIN, top: TOP },
      { input: vb, left: MARGIN + CELL_W + GAP, top: TOP },
      { input: etikettSvg(rubrik, vText, hText), left: 0, top: 0 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();

  return new NextResponse(new Uint8Array(bild), {
    headers: {
      "Content-Type": "image/jpeg",
      // Privat: kortet bar hennes ansikte och far inte cachas av ett CDN.
      "Cache-Control": "private, max-age=60",
      "Content-Disposition": 'inline; filename="min-envana-resa.jpg"',
    },
  });
}
