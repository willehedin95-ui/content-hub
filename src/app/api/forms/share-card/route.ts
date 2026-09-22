// Delningskortet: kundens forsta och sista bild bredvid varandra, i Envanas
// ram, som en fardig bild hon kan spara eller dela.
//
// Serverrenderad och inte som CSS i formuläret, av tva skal: en skarmdump av
// en webblayout bar hennes telefons statusrad med sig, och en bild gar att
// lagga i navigator.share medan en div inte gor det.
//
// Renderas med Chromium och inte med sharp+SVG. Den forra versionen ritade
// texten som SVG, och sharps librsvg stodjer inte inbaddade @font-face - pa
// Vercels Linux fanns ingen av fonterna i stacken och ALL text blev tofu-
// rutor i produktion. Chromium laser daremot @font-face, sa har far kortet
// Envanas riktiga typsnitt. Fonterna baddas in som data-URI:er sa att
// renderingen inte hanger pa ett natanrop inne i webblasaren.
//
// Uppslaget gar pa den SIGNERADE token, aldrig pa en inskriven e-post -
// bucketen ar publik med ogissbara sokvagar, sa ett adressuppslag hade latit
// vem som helst hamta ut andras ansiktsbilder. Samma regel som /api/forms/series.

import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { createServerSupabase } from "@/lib/supabase-admin";
import { emailFromToken } from "@/lib/forms-token";
import type { FormRow, FormSubmissionRow } from "@/types/forms";

export const runtime = "nodejs";
export const maxDuration = 60;

const B = 1080;
// Kvadratiskt och inte 4:5. Tva OBESKURNA 3:4-bilder bredvid varandra blir ett
// brett block, som pa 1080 px bara kan bli ca 620 px hogt. I en 1350 px hog ram
// blev resten tom gradde. Hojden foljer innehallet i stallet for tvartom.
const H = 1080;

/** Lokal Chrome. PUPPETEER_EXECUTABLE_PATH vinner sa att en maskin med
 *  webblasaren pa ett annat stalle slipper en hardkodad sokvag i repot -
 *  utan den faller koden till sparticuz Linux-binar, som pa macOS dor med
 *  ENOEXEC och gor endpointen omojlig att testa lokalt. */
const LOCAL_CHROME =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const FONTER = {
  bagoss400: "https://shopenvana.com/cdn/shop/t/3/assets/envana-font-bagossstandard-400.woff2",
  bagoss500: "https://shopenvana.com/cdn/shop/t/3/assets/envana-font-bagossstandard-500.woff2",
  hanken: "https://shopenvana.com/cdn/shop/t/3/assets/envana-font-hankengrotesk-variable.woff2",
};

/** Fonterna ar identiska mellan anrop - hamta en gang per lambda-instans. */
let fontCache: Record<string, string> | null = null;

async function hamta(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

async function fontDataUris(): Promise<Record<string, string>> {
  if (fontCache) return fontCache;
  const namn = Object.keys(FONTER) as (keyof typeof FONTER)[];
  const bufs = await Promise.all(namn.map((n) => hamta(FONTER[n])));
  const ut: Record<string, string> = {};
  namn.forEach((n, i) => {
    const b = bufs[i];
    // En font som inte gick att hamta utelamnas hellre an att skickas in som
    // trasig base64 - da faller just den vikten tillbaka pa nasta i stacken.
    if (b) ut[n] = `data:font/woff2;base64,${b.toString("base64")}`;
  });
  fontCache = ut;
  return ut;
}

/** Envanas wordmark som data-URI. Lases fran disk forst - filen ligger i
 *  public/ och foljer med bygget - och hamtas annars over HTTP fran samma
 *  origin. Gar bada vagarna fel faller kortet tillbaka pa spärrad text, sa
 *  en saknad fil aldrig ger ett tomt hal dar logotypen skulle sitta. */
let wordmarkCache: string | null | undefined;
async function wordmarkDataUri(origin: string): Promise<string | null> {
  if (wordmarkCache !== undefined) return wordmarkCache;
  const rel = "images/progressbild/envana-wordmark.png";
  try {
    const buf = readFileSync(join(process.cwd(), "public", rel));
    wordmarkCache = `data:image/png;base64,${buf.toString("base64")}`;
    return wordmarkCache;
  } catch {
    // Disken kan saknas i en serverlos korning. Hubben serverar samma fil.
  }
  const hamtad = await hamta(`${origin}/${rel}`);
  wordmarkCache = hamtad ? `data:image/png;base64,${hamtad.toString("base64")}` : null;
  return wordmarkCache;
}

async function launchBrowser() {
  const puppeteer = await import("puppeteer-core");
  let chromePath: string;
  let args: string[];
  if (existsSync(LOCAL_CHROME)) {
    chromePath = LOCAL_CHROME;
    args = ["--no-sandbox"];
  } else {
    const chromium = (await import("@sparticuz/chromium")).default;
    chromePath = await chromium.executablePath();
    args = chromium.args;
  }
  return puppeteer.default.launch({
    args,
    executablePath: chromePath,
    headless: true,
    defaultViewport: { width: B, height: H, deviceScaleFactor: 1 },
  });
}

function face(familj: string, vikt: number, uri: string | undefined): string {
  if (!uri) return "";
  return `@font-face{font-family:'${familj}';font-style:normal;font-weight:${vikt};` +
    `font-display:block;src:url(${uri}) format('woff2')}`;
}

function kortHtml(opts: {
  fonter: Record<string, string>;
  wordmark: string | null;
  stampel: string;
  vanster: string;
  hoger: string;
  vText: string;
  hText: string;
  rubrik: string;
}): string {
  const { fonter, wordmark, stampel, vanster, hoger, vText, hText, rubrik } = opts;
  // Riktiga logotypen nar den finns. Spärrad text ar en reserv, inte designen -
  // en wordmark ar en ritad form och gar inte att satta med en fontstack.
  const marke = wordmark
    ? `<img class="wordmark" src="${wordmark}" alt="Envana">`
    : `<div class="wordmark-txt">Envana</div>`;
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><style>
${face("Bagoss Standard", 400, fonter.bagoss400)}
${face("Bagoss Standard", 500, fonter.bagoss500)}
${fonter.hanken ? `@font-face{font-family:'Hanken Grotesk';font-style:normal;font-weight:100 900;font-display:block;src:url(${fonter.hanken}) format('woff2')}` : ""}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${B}px;height:${H}px}
/* Kortet ar ett KORT, inte en sida. Forra versionen lade bilderna direkt pa
   en blek bakgrund, och utan en egen yta att sitta pa sag de ut att sväva.
   Samma uppbyggnad som Hims och Hers anvander for sina manadsjamforelser:
   ett malat falt, en ljus platta inuti, innehallet i plattan. */
body{background:#f0573d;padding:40px;font-family:'Hanken Grotesk',sans-serif;
  color:#320d01}
.kort{width:100%;height:100%;background:#fefaf8;border-radius:36px;padding:30px;
  display:flex;flex-direction:column;align-items:center;text-align:center}
/* Tva egna rutor med glugg emellan och var sin radie, som Hims manadsjamforelse.
   3/4 ar inte ett designval utan BILDERNAS EGET format (uppmatt: 1400x1867 och
   1050x1400). En hogre ruta, till exempel 9:16, hade beskurit sidorna av selfien
   i stallet for att visa mer av den. */
.bilder{display:flex;gap:16px;width:100%}
.ruta{flex:1;position:relative;aspect-ratio:3/4;border-radius:22px;overflow:hidden;
  background:#efe4de}
/* object-position:center pa BADA rutorna. Ett innehallsstyrt snitt (sharps
   "attention") kan valja olika utsnitt i de tva bilderna, och da ljuger
   jamforelsen. Samma skal som uppladdningen slutade beskara. */
.ruta img{width:100%;height:100%;object-fit:cover;object-position:center;display:block}
.chip{position:absolute;left:18px;top:18px;padding:10px 18px 11px;border-radius:999px;
  font-size:24px;font-weight:600;letter-spacing:1.4px;line-height:1;
  background:rgba(254,250,248,.94);color:#320d01}
/* Bada pillren vita. Ett brandfargat pill pa hoger bild lade en vardering i
   etiketten - "det har ar efterbilden" - nar den bara ska saga vilken dag det ar. */
h1{font-family:'Bagoss Standard',sans-serif;font-weight:500;font-size:100px;line-height:.95;
  letter-spacing:-3px}
.under{margin-top:14px;font-size:26px;opacity:.42;letter-spacing:1.2px}
.wordmark{display:block;width:180px;height:auto;opacity:.9}
.wordmark-txt{font-family:'Bagoss Standard',sans-serif;font-weight:500;font-size:26px;
  letter-spacing:9px;opacity:.45;text-transform:uppercase}
</style></head><body>
<div class="kort">
  <div class="bilder">
    <div class="ruta"><img src="${vanster}" alt=""><span class="chip">${vText}</span></div>
    <div class="ruta"><img src="${hoger}" alt=""><span class="chip">${hText}</span></div>
  </div>
  <div style="margin:auto 0">
    <h1>${rubrik}</h1>
    ${stampel ? `<p class="under">${stampel}</p>` : ""}
  </div>
  ${marke}
</div>
</body></html>`;
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
  const datum: Record<string, string> = {};
  for (const row of (data ?? []) as Pick<
    FormSubmissionRow,
    "payload" | "files" | "created_at"
  >[]) {
    const file = (row.files ?? [])[0];
    if (!file?.url) continue;
    const step = (row.payload ?? []).find((a) => a.key === "steg");
    const key = step ? String(step.value ?? "") : "";
    if (key) {
      steps[key] = file.url;
      datum[key] = row.created_at;
    }
  }

  const nycklar = Object.keys(steps).sort();
  if (nycklar.length < 2) {
    return new NextResponse("for fa bilder for ett delningskort", { status: 409 });
  }

  const [a, b, fonter] = await Promise.all([
    hamta(steps[nycklar[0]]),
    hamta(steps[nycklar[nycklar.length - 1]]),
    fontDataUris(),
  ]);
  if (!a || !b) return new NextResponse("kunde inte hamta bilderna", { status: 502 });

  // Dagarna raknas ur BILDERNAS EGNA DATUM, inte ur stegnumret. Schemat sager
  // dag 1/30/60, men tar hon den sista bilden en vecka sent ar stegnumret 3
  // och kortet hade da stamplat "DAG 60" ovanpa tva datum som sager 67 dagar.
  // Kortet ska beskriva hennes serie, inte var kalender.
  const tid = (iso: string | undefined) => (iso ? Date.parse(iso) : NaN);
  const tFran = tid(datum[nycklar[0]]);
  const tTill = tid(datum[nycklar[nycklar.length - 1]]);
  const harDatum = Number.isFinite(tFran) && Number.isFinite(tTill) && tTill >= tFran;

  // Utan datum (aldre rader) faller vi tillbaka pa schemats nominella dagar.
  const dagtal: Record<string, number> = { "1": 1, "2": 30, "3": 60 };
  const sista = harDatum
    ? Math.round((tTill - tFran) / 86_400_000) + 1
    : dagtal[nycklar[nycklar.length - 1]] ?? 60;

  const vText = "DAG 1";
  const hText = `DAG ${sista}`;
  const span = sista;

  // Datumen ar BEVISET. En rad om att bilderna ar tagna med samma vinkel ar
  // en metodanteckning som ingen postar; tva datum ar samma pastaende som en
  // stampel, och de star redan i databasen. Kort manadsform sa raden inte
  // bryter pa tva rader under rubriken.
  const dagLabel = (ms: number) =>
    new Date(ms)
      .toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" })
      .replace(".", "");
  const stampel = harDatum ? `${dagLabel(tFran)} - ${dagLabel(tTill)}` : "";

  const html = kortHtml({
    fonter,
    wordmark: await wordmarkDataUri(req.nextUrl.origin),
    stampel,
    vanster: `data:image/jpeg;base64,${a.toString("base64")}`,
    hoger: `data:image/jpeg;base64,${b.toString("base64")}`,
    vText,
    hText,
    rubrik: `Mina ${span} dagar`,
  });

  const browser = await launchBrowser();
  let bild: Buffer;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: B, height: H, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    // font-display:block hindrar bara ett tofu-blink i en levande sida. Har
    // maste fonterna vara PA PLATS nar rutan tas, annars fryser vi ett
    // mellanlage. fonts.ready loser ut nar alla @font-face ar avgjorda.
    await page.evaluate(() => (document as Document).fonts.ready);
    const skott = await page.screenshot({ type: "jpeg", quality: 90 });
    bild = Buffer.from(skott);
  } finally {
    await browser.close();
  }

  return new NextResponse(new Uint8Array(bild), {
    headers: {
      "Content-Type": "image/jpeg",
      // Privat: kortet bar hennes ansikte och far inte cachas av ett CDN.
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": 'inline; filename="min-envana-resa.jpg"',
    },
  });
}
