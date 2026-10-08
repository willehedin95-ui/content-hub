import Anthropic from "@anthropic-ai/sdk";

import { SOCIAL_KINDS, type SocialKind } from "@/lib/social-kinds";
export { SOCIAL_KINDS, type SocialKind };

const KIND_GUIDE: Record<SocialKind, string> = {
  product: "Produktbild.",
  person: "Bild på en kvinna med produkten.",
  knowledge: "Kunskapskarusell. Första raden ska väcka nyfikenhet på det karusellen lovar, utan att upprepa omslagets rubrik. Avsluta med en uppmaning att spara inlägget eller skicka det till någon. Nämn inte produkten.",
  humor: "Humorinlägg. En rad, högst två. Förklara aldrig skämtet.",
  question: "En fråga till följarna. Upprepa frågan kort.",
  other: "Skriv en kort bildtext.",
};

/** Angles a single-image caption can take. Rotated so neighbours never sound alike (2026-10-08). */
const ANGLES = [
  "ETT argument ur faktan, sagt kort och rakt.",
  "En kort rad om hur det är att vara kvinna efter 50, varm och lite kaxig. Ingen produktfakta.",
  "En kort tanke eller påminnelse till läsaren, som 'påminnelsen vi alla behövde idag'. Ingen produktfakta.",
  "En kort etikett på stunden eller känslan i bilden, en rad. Ingen produktfakta.",
  "Ett kort, konkret tips för hud, hår eller vardag som inte handlar om produkten.",
];

export interface CaptionResult { caption: string; hashtags: string[] }

/** Write a Swedish caption for one post from its image(s), its kind and the brand brief. */
export async function writeCaption(opts: { imageUrls: string[]; kind: SocialKind; brief: string; recent: string[]; hint?: string; format?: "image" | "carousel"; scheduledAt?: string; angleIndex?: number }): Promise<CaptionResult> {
  const client = new Anthropic();
  // Rules from the vault corpus and 2 675 captions of 20 reference brands (2026-10-06): brand voice
  // ("vi" to "du", first person singular in 5.6 %), short, mostly generic. William 2026-10-08: generic is
  // fine, the problem is the SAME thing in every post. Forcing every caption to describe its image
  // ("detail first") read as forced. So: short and generic, angles rotated, arguments and phrases rationed.
  const system = `Du skriver bildtexter till Instagram och Facebook för varumärket Envana.

Fakta du FÅR använda (inte måste):
${opts.brief}

Röst:
- Varumärket talar. Skriv "vi" om Envana och "du" till läsaren. ALDRIG jag-form (jag, min, mitt, mig).
- Varmt, rakt och lite kaxigt. Korta meningar. Ingen vetenskaplig ton, inga förbehåll.
- Texten behöver INTE handla om bilden. Beskriv inte bilden. En generell rad är helt okej.

Form:
- KORT. En eller två meningar, under 25 ord (hashtags oräknade). En enda rad är ofta bäst.
- Utslitna fraser som INTE får användas: "tio sekunder", "det vackraste du/en kvinna kan bära", "inte magi, det är biologi", "aldrig funkat ... dosen", "bara för din skull", "något för dig själv".
- Uppmaning bara ibland. Karusell: "Spara till ..." eller "Skicka till en vän som ...". Aldrig "vad tycker du?" eller "kommentera JA".
- "Länk i bio" högst ibland, bara på produktbilder.
- Svenska med å, ä och ö. Inga engelska ord. Inga tankstreck (– eller —), använd punkt eller komma.
- Högst en emoji, gärna ingen.
- Hitta inte på siffror som inte står i faktan.
- Upprepa inte inledningar eller formuleringar från de senaste bildtexterna.

Svara ENDAST med JSON: {"caption": "...", "hashtags": ["#..."]} med 0-3 svenska sökords-hashtags (till exempel #kollagen, #marintkollagen).`;
  // A single image never says "svep" - that made the captions of one-image
  // text posts promise slides that do not exist (2026-10-05).
  const formatNote = opts.format === "carousel"
    ? "Inlägget är en karusell med flera bilder."
    : "Inlägget är EN enda bild, ingen karusell. Skriv aldrig svep, nästa bild eller liknande. Hänvisa inte till fler bilder.";
  // Batches pass their position so neighbours get different angles; a single "Ny bildtext" gets a random one.
  const angle = ANGLES[(opts.angleIndex ?? Math.floor(Math.random() * ANGLES.length)) % ANGLES.length];
  const guide = opts.kind === "knowledge" && opts.format !== "carousel"
    ? "Det är ett textinlägg (en bild med en lista eller ett citat). Plocka en eller två rader ur bilden och lägg till en egen tanke, eller ställ en fråga som får folk att svara i kommentarerna. Nämn inte produkten."
    : opts.kind === "product" || opts.kind === "person" ? `${KIND_GUIDE[opts.kind]} Vinkel för den här texten: ${angle}` : KIND_GUIDE[opts.kind];
  // The brief's arguments, so the last few posts' arguments can be blocked (3 of 8 samples reused "smakar bär").
  const ARGS: [string, RegExp][] = [["smaken (bär, inte fisk, sockerfri)", /bär|fisk|sockerfri/i], ["dosen (12 500 mg)", /12\s?500|dos/i], ["peptider/upptag", /peptid|dalton|tas upp/i], ["13 ingredienser", /13 (aktiva )?ingredienser|hyaluron|elastin/i], ["tillverkning (Sverige, tungmetaller, ASC)", /tungmetall|asc|tillverkad i sverige/i], ["garantin", /garanti|pengarna tillbaka/i], ["tidslinjen (vecka för vecka)", /vecka \d/i], ["kollagenförlust med åldern", /procent|efter 25|klimakteriet tar/i], ["flytande i stället för kapslar/pulver", /kapsl|pulver|flytande/i]];
  const usedArgs = ARGS.filter(([, re]) => opts.recent.slice(0, 6).some((c) => re.test(c))).map(([n]) => n);
  // The model invented weekdays ("Söndagen..." on a Thursday post, 2026-10-08): tell it the real one.
  const when = opts.scheduledAt ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", weekday: "long" }).format(new Date(opts.scheduledAt)) : null;
  const dayNote = when ? `Nämn helst ingen veckodag. Om det verkligen behövs: inlägget publiceras en ${when}.\n` : "Nämn ingen veckodag.\n";
  const user = `${dayNote}${usedArgs.length ? `Argument som redan används i de senaste inläggen, använd INTE dessa nu: ${usedArgs.join("; ")}.\n` : ""}Typ av inlägg: ${SOCIAL_KINDS[opts.kind]}. ${guide} ${formatNote}
${opts.hint ? `Önskemål: ${opts.hint}\n` : ""}Inledningar som redan är använda i flödet. Börja inte på samma sätt och bygg inte texten på samma argument som de tre senaste:
${opts.recent.slice(0, 40).map((c) => `- ${c.replace(/(\s*#\S+)+\s*$/, "").split(/(?<=[.!?])\s|\n/)[0].slice(0, 140)}`).join("\n") || "- (inga än)"}`;

  const content: Anthropic.MessageParam["content"] = [
    ...opts.imageUrls.slice(0, 4).map((url) => ({ type: "image" as const, source: { type: "url" as const, url } })),
    { type: "text" as const, text: user },
  ];
  const res = await client.messages.create({ model: "claude-sonnet-5-5", max_tokens: 1500, system, messages: [{ role: "user", content }] });
  const tb = res.content.find((b) => b.type === "text");
  const raw = tb && tb.type === "text" ? tb.text.trim() : "";
  const json = parseLastJson(raw);
  // Language checks only: no dashes, sane length, 3-5 hashtags.
  const caption = String(json.caption ?? "").replace(/\s*[–—]\s*/g, ". ").replace(/\.\s*\./g, ".").trim();
  if (!caption) throw new Error(`Claude gav ingen bildtext (stop_reason: ${res.stop_reason})`);
  const hashtags = (Array.isArray(json.hashtags) ? json.hashtags : [])
    .map((h: unknown) => String(h).trim().replace(/^#?/, "#").replace(/\s+/g, ""))
    .filter((h: string) => h.length > 2).slice(0, 3);
  return { caption: caption.slice(0, 2000), hashtags };
}

/**
 * The model sometimes answers with a JSON object, second thoughts and a
 * corrected object. Take the LAST balanced {...} that parses and has a caption
 * (a greedy /\{.*\}/ swallowed both and threw, 2026-10-06).
 */
export function parseLastJson(raw: string): { caption?: unknown; hashtags?: unknown } {
  const objs: string[] = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}" && depth > 0 && --depth === 0) objs.push(raw.slice(start, i + 1));
  }
  for (const o of objs.reverse()) { try { const j = JSON.parse(o); if (j && j.caption) return j; } catch { /* next */ } }
  return {};
}
