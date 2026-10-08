import Anthropic from "@anthropic-ai/sdk";

import { SOCIAL_KINDS, type SocialKind } from "@/lib/social-kinds";
export { SOCIAL_KINDS, type SocialKind };

const KIND_GUIDE: Record<SocialKind, string> = {
  product: "Produktbild. Utgå från miljön eller stunden i bilden (var flaskan står, vad som händer runt den). Lägg gärna till ETT kort argument ur briefen, men bara om det hör ihop med bilden.",
  person: "Bild på en kvinna med produkten. Utgå från stunden i bilden: var hon är, vad hon gör, vilken känsla eller tid på dagen det är. Produktfakta behövs inte, högst ett kort argument om det passar bilden.",
  knowledge: "Kunskapskarusell. Första raden ska väcka nyfikenhet på det karusellen lovar, utan att upprepa omslagets rubrik. Avsluta med en uppmaning att spara inlägget eller skicka det till någon. Nämn inte produkten.",
  humor: "Humorinlägg. En rad, högst två. Förklara aldrig skämtet.",
  question: "En fråga till följarna. Upprepa frågan kort.",
  other: "Skriv en kort bildtext som utgår från bilden.",
};

export interface CaptionResult { caption: string; hashtags: string[] }

/** Write a Swedish caption for one post from its image(s), its kind and the brand brief. */
export async function writeCaption(opts: { imageUrls: string[]; kind: SocialKind; brief: string; recent: string[]; hint?: string; format?: "image" | "carousel" }): Promise<CaptionResult> {
  const client = new Anthropic();
  // Rules from the vault corpus (instagram-carousels-captions-stories, envana-karuseller-sa-designar-man-dem)
  // and from 2 675 captions of 20 reference brands measured 2026-10-06: brands write as "vi" to "du"
  // (first person singular in 5.6 %), median 48 words, 62 % without hashtags, calls to action under 10 %.
  // 2026-10-08: "never describe the image" made every caption the same brief boilerplate ("tio sekunder",
  // "det vackraste du kan bära"). The reference brands anchor the caption in the moment of THAT image
  // ("Spotted in July", "What a bank holiday should look like", "Current status: prioritising me").
  const system = `Du skriver bildtexter till Instagram och Facebook för varumärket Envana.

Fakta du FÅR använda (inte måste):
${opts.brief}

Så gör du:
1. Titta på bilden och välj EN konkret sak som bara finns i just den bilden: platsen (yogamatta, sjö, kök, säng, båt, gata), stunden eller tiden (morgon, solnedgång, söndag, efter träningen), det hon gör (häller upp, skålar, blåser en puss, blundar) eller en sak i bilden (kaffekoppen, solhatten, persikan).
2. Bygg bildtexten på den saken. Gärna som en kort etikett på stunden, en lekfull rad eller en tanke som den stunden väcker hos läsaren. Texten ska INTE kunna stå under en annan bild.
3. Produkten får nämnas med ETT kort argument, men bara om det hänger ihop med stunden. Hälften av texterna klarar sig utan produktfakta.

Röst:
- Varumärket talar. Skriv "vi" om Envana och "du" till läsaren. ALDRIG jag-form (jag, min, mitt, mig).
- Varmt, lite kaxigt, med glimt i ögat. Korta meningar. Ingen vetenskaplig ton, inga förbehåll.

Form:
- KORT. En eller två meningar, under 25 ord (hashtags oräknade). En enda rad är ofta bäst.
- Utslitna fraser som INTE får användas: "tio sekunder", "det vackraste du/en kvinna kan bära", "inte magi, det är biologi", "aldrig funkat ... dosen", "bara för din skull", "något för dig själv".
- Uppmaning bara ibland. Karusell: "Spara till ..." eller "Skicka till en vän som ...". Aldrig "vad tycker du?" eller "kommentera JA".
- "Länk i bio" högst ibland, bara på produktbilder.
- Svenska med å, ä och ö. Inga engelska ord. Inga tankstreck (– eller —), använd punkt eller komma.
- Högst en emoji, gärna ingen.
- Hitta inte på siffror som inte står i faktan.
- Upprepa inte inledningar eller formuleringar från de senaste bildtexterna.

Svara ENDAST med JSON: {"detalj": "den konkreta saken i bilden du valde", "caption": "...", "hashtags": ["#..."]} med 0-3 svenska sökords-hashtags (till exempel #kollagen, #marintkollagen).`;
  // A single image never says "svep" - that made the captions of one-image
  // text posts promise slides that do not exist (2026-10-05).
  const formatNote = opts.format === "carousel"
    ? "Inlägget är en karusell med flera bilder."
    : "Inlägget är EN enda bild, ingen karusell. Skriv aldrig svep, nästa bild eller liknande. Hänvisa inte till fler bilder.";
  const guide = opts.kind === "knowledge" && opts.format !== "carousel"
    ? "Det är ett textinlägg (en bild med en lista eller ett citat). Plocka en eller två rader ur bilden och lägg till en egen tanke, eller ställ en fråga som får folk att svara i kommentarerna. Nämn inte produkten."
    : KIND_GUIDE[opts.kind];
  // The brief's arguments, so the last few posts' arguments can be blocked (3 of 8 samples reused "smakar bär").
  const ARGS: [string, RegExp][] = [["smaken (bär, inte fisk, sockerfri)", /bär|fisk|sockerfri/i], ["dosen (12 500 mg)", /12\s?500|dos/i], ["peptider/upptag", /peptid|dalton|tas upp/i], ["13 ingredienser", /13 (aktiva )?ingredienser|hyaluron|elastin/i], ["tillverkning (Sverige, tungmetaller, ASC)", /tungmetall|asc|tillverkad i sverige/i], ["garantin", /garanti|pengarna tillbaka/i], ["tidslinjen (vecka för vecka)", /vecka \d/i], ["kollagenförlust med åldern", /procent|efter 25|klimakteriet tar/i], ["flytande i stället för kapslar/pulver", /kapsl|pulver|flytande/i]];
  const usedArgs = ARGS.filter(([, re]) => opts.recent.slice(0, 6).some((c) => re.test(c))).map(([n]) => n);
  const user = `${usedArgs.length ? `Argument som redan används i de senaste inläggen, använd INTE dessa nu: ${usedArgs.join("; ")}.\n` : ""}Typ av inlägg: ${SOCIAL_KINDS[opts.kind]}. ${guide} ${formatNote}
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
