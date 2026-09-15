// Public: file upload for form submissions (e.g. bildbevis in Kontakta oss).
// Stores in the public form-uploads bucket under an unguessable uuid path and
// returns the public URL, which the submit payload then references.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createServerSupabase } from "@/lib/supabase-admin";
import sharp from "sharp";
import { getFormsCORSHeaders, handleFormsOptions } from "../_cors";

export const maxDuration = 60;

/** Bredd att spara i. En selfie behover inte vara 4032 px bred for att
 *  visas i ett mail eller jamforas mot en annan selfie, och varje extra
 *  megabyte ar uppladdningstid pa mobildata. */
const MAX_WIDTH = 1400;

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB (bucket enforces the same cap)
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

export async function OPTIONS(req: NextRequest) {
  return handleFormsOptions(req.headers.get("origin"));
}

export async function POST(req: NextRequest) {
  const cors = getFormsCORSHeaders(req.headers.get("origin"));

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Ogiltig uppladdning" }, { status: 400, headers: cors });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Ingen fil hittades" }, { status: 400, headers: cors });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Filen är för stor (max 25 MB)" }, { status: 400, headers: cors });
  }
  const mime = file.type.toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { error: "Filtypen stöds inte. Ladda upp en bild (JPG/PNG/WEBP/HEIC) eller PDF." },
      { status: 400, headers: cors }
    );
  }

  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const id = randomUUID();
  const supabase = createServerSupabase();

  let buffer: Buffer<ArrayBufferLike> = Buffer.from(await file.arrayBuffer());
  let outMime = mime;
  let ext = EXT_BY_MIME[mime] ?? "bin";

  // Bilder normaliseras; PDF lamnas orord.
  //
  // TVA fel som bada slar mot progressbildsflodet:
  //
  // 1. HEIC. iPhone sparar i HEIC och Safari konverterar INTE alltid vid
  //    uppladdning (fran Filer, till skillnad fran Foton). Gmail, Outlook och
  //    Android kan inte visa HEIC, sa kundens egen bild hade blivit en trasig
  //    ikon i hennes kvittensmail.
  //
  // 2. Blandad orientering. Tar hon en bild staende och nasta liggande blir de
  //    olika hoga i serien - uppmatt 183 px bredvid 57 px, alltsa en remsa - och
  //    da ar jamforelsen forstord, vilket ar hela produkten. Beskarningen till
  //    4:5 ger alla bilder samma form. Ansiktet sitter i mitten pa en selfie, sa
  //    en centrerad beskarning tar bakgrund och inte person.
  //
  // rotate() utan argument tillampar EXIF-orienteringen och NOLLSTALLER den.
  // Webblasare respekterar EXIF, men en nedstroms konsument som laser pixlarna
  // rakt av gor det inte, och da ligger bilden ner.
  if (mime.startsWith("image/")) {
    try {
      // Utsnittet raknas ur BILDENS EGEN storlek, inte mot ett fast mal.
      // Forsta forsoket var resize(1400, 1750, { fit: "cover",
      // withoutEnlargement: true }) och den gjorde INGENTING pa en bild mindre
      // an 1400x1750: withoutEnlargement hindrar forstoring, och da hoppar
      // sharp over hela cover-beskarningen. Uppmatt - 550x614 in gav 550x614 ut.
      //
      // Nu tas i stallet det storsta 4:5-utsnitt som RYMS i bilden, sa inget
      // nagonsin skalas upp och en liggande bild beskars i sidled.
      const rotated = sharp(buffer, { failOn: "none" }).rotate();
      const meta = await rotated.metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      if (!w || !h) throw new Error("kunde inte lasa bildens matt");
      const RATIO = 4 / 5;
      let cw = w;
      let ch = h;
      if (w / h > RATIO) cw = Math.round(h * RATIO);  // for bred: klipp sidorna
      else ch = Math.round(w / RATIO);                // for hog: klipp topp/botten
      // position "attention" och INTE en centrerad beskarning. Uppmatt pa en
      // liggande selfie dar ansiktet satt till hoger: centrerat utsnitt
      // halverade ansiktet, attention ramade in det. Folk haller inte telefonen
      // mitt framfor sig.
      //
      // Risken med attention ar att den kan valja olika utsnitt mellan tva
      // bilder och darmed gora jamforelsen skev. Den risken ar mindre an
      // alternativet: ar bilderna tagna likadant, som vi instruerar, hittar den
      // samma sak bada gangerna - och ar de INTE det, raddar den bilden i
      // stallet for att leverera ett konsekvent utsnitt av en axel.
      const outW = Math.min(cw, MAX_WIDTH);
      buffer = await rotated
        .resize(outW, Math.round(outW / RATIO), {
          fit: "cover",
          position: sharp.strategy.attention,
          withoutEnlargement: false,
        })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
      outMime = "image/jpeg";
      ext = "jpg";
    } catch (e) {
      // Hellre originalet an ingen bild alls. En trasig visning gar att laga i
      // efterhand, en tappad uppladdning far kunden aldrig veta om.
      console.error(`[forms/upload] Bildnormalisering misslyckades, sparar original:`, e);
    }
  }

  const path = `${month}/${id}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from("form-uploads")
    .upload(path, buffer, { contentType: outMime, upsert: false });
  if (uploadErr) {
    console.error(`[forms/upload] Storage upload failed: ${uploadErr.message}`);
    return NextResponse.json(
      { error: "Uppladdningen misslyckades. Försök igen." },
      { status: 500, headers: cors }
    );
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
  const url = `${base}/storage/v1/object/public/form-uploads/${path}`;
  return NextResponse.json({ ok: true, url, filename: file.name.slice(0, 200) }, { headers: cors });
}
