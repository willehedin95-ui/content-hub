import { createRequire } from "node:module";
const require = createRequire("/Users/williamhedin/Claude Code/content-hub/package.json");
const sharp = require("sharp");
const D = "/Users/williamhedin/Downloads/envana-before-after-1x1/";
const OUT = process.argv[2];

// Fyra OLIKA personer, ett omrade var, med spridning i alder och utseende.
// Bara HALVA bilden anvands: kallorna ar fore/efter-par, och tva halvor
// bredvid varandra hade last som ett resultat i stallet for som ett exempel
// pa vilket utsnitt hon kan valja.
// Etiketterna foljer vad bilden FAKTISKT visar, och utsnittet styrs manuellt.
// "attention" valde munnen i ogonbilden och halsen i kindbilden - den letar
// kontrast, inte kroppsdelar.
const rutor = [
  // yFrac = var i hojdled det kvadratiska utsnittet tas ur halvan.
  // 0 = ovankant, 0.5 = mitten, 1 = underkant.
  { namn: "HELA ANSIKTET", fil: "16 helansikte 51-55 subtil.jpg", halva: "vanster", yFrac: 0.15 },
  { namn: "KRING ÖGONEN",  fil: "20 ogon 56-60 afrikansk.jpg",    halva: "hoger",   yFrac: 0.18 },
  { namn: "PANNAN",        fil: "21 panna 46-50.jpg",             halva: "vanster", yFrac: 0.30 },
  { namn: "HALSEN",        fil: "26 hals 41-45 latin.jpg",        halva: "hoger",   yFrac: 0.55 },
];

const RUTA = 320, GAP = 14, ETIKETT = 34, R = 18;
const W = RUTA * 2 + GAP, H = (RUTA + ETIKETT) * 2 + GAP;
const mask = Buffer.from(`<svg width="${RUTA}" height="${RUTA}"><rect width="${RUTA}" height="${RUTA}" rx="${R}" ry="${R}"/></svg>`);

const lager = [];
for (let i = 0; i < rutor.length; i++) {
  const r = rutor[i];
  const m = await sharp(D + r.fil).metadata();
  const halvbredd = Math.floor(m.width / 2);
  // Kvadratiskt utsnitt ur halvan, placerat i hojdled med yFrac. "attention"
  // dugde inte - den letar kontrast, inte kroppsdelar, och la ogoncropen pa
  // munnen och panncropen i haret.
  const sida = Math.min(halvbredd, m.height);
  const toppMax = m.height - sida;
  const bild = await sharp(D + r.fil)
    .extract({
      left: r.halva === "vanster" ? 0 : m.width - halvbredd,
      top: Math.round(toppMax * r.yFrac),
      width: halvbredd, height: sida,
    })
    .resize(RUTA, RUTA, { fit: "cover" })
    .composite([{ input: mask, blend: "dest-in" }])
    .png().toBuffer();
  const x = (i % 2) * (RUTA + GAP);
  const y = Math.floor(i / 2) * (RUTA + ETIKETT + GAP);
  lager.push({ input: bild, left: x, top: y });
  lager.push({ input: Buffer.from(
    `<svg width="${RUTA}" height="${ETIKETT}"><text x="${RUTA/2}" y="22" text-anchor="middle"
      font-family="Helvetica,Arial" font-size="14" font-weight="700" letter-spacing="1.4"
      fill="#7e6458">${r.namn}</text></svg>`), left: x, top: y + RUTA });
}
await sharp({ create: { width: W, height: H, channels: 4, background: { r:254,g:250,b:248,alpha:1 } } })
  .composite(lager).png().toFile(OUT);
console.log("collage", W + "x" + H);
