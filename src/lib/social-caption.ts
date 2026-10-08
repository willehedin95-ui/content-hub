import Anthropic from "@anthropic-ai/sdk";

import { SOCIAL_KINDS, type SocialKind } from "@/lib/social-kinds";
import { pickTopic, clashes, type Topic } from "@/lib/social-caption-topics";
export { SOCIAL_KINDS, type SocialKind };

const KIND_GUIDE: Record<SocialKind, string> = {
  product: "Produktbild.",
  person: "Bild på en kvinna med produkten. Modellerna är ofta yngre än 50: skriv aldrig om hennes ålder och beskriv henne inte.",
  knowledge: "Kunskapskarusell. Första raden ska väcka nyfikenhet på det karusellen lovar, utan att upprepa omslagets rubrik. Avsluta med en uppmaning att spara inlägget eller skicka det till någon. Nämn inte produkten.",
  humor: "Humorinlägg. En rad, högst två. Förklara aldrig skämtet.",
  question: "En fråga till följarna. Upprepa frågan kort.",
  other: "Skriv en kort bildtext.",
};

export interface CaptionResult { caption: string; hashtags: string[] }

/** Write a Swedish caption for one post from its image(s), its kind and the brand brief. */
/**
 * One caption. `recent` = captions of the posts around this one in the feed
 * (before and after), `examples` = captions William approved, used for tone.
 * The topic is picked in code (social-caption-topics.ts) and a caption that
 * drifts onto a neighbour's topic is rewritten, up to three tries.
 */
export async function writeCaption(opts: { imageUrls: string[]; kind: SocialKind; brief: string; recent: string[]; hint?: string; format?: "image" | "carousel"; scheduledAt?: string; examples?: string[] }): Promise<CaptionResult> {
  const single = opts.kind === "product" || opts.kind === "person";
  const tried = new Set<string>();
  let last: CaptionResult | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const topic = single ? pickTopic(opts.kind, opts.recent, tried) : null;
    if (topic) tried.add(topic.key);
    const r = await writeOnce(opts, topic);
    // "Länk i bio" in every other caption (2026-10-08 simulation): keep it only if none of the 3 posts before has it.
    const before = opts.recent.slice(0, 3);
    if (before.some((c) => /länk i bio/i.test(c))) r.caption = r.caption.replace(/\s*Länk i bio\.?/gi, "").trim();
    last = r;
    if (!topic || clashes(r.caption, topic.key, opts.recent).length === 0) return r;
  }
  return last!;
}

async function writeOnce(opts: { imageUrls: string[]; kind: SocialKind; brief: string; recent: string[]; hint?: string; format?: "image" | "carousel"; scheduledAt?: string; examples?: string[] }, topic: Topic | null): Promise<CaptionResult> {
  const client = new Anthropic();
  // Voice from the vault corpus and 20 reference brands (vi/du, short, generic is fine). What to write
  // about is decided in code (topic), the tone comes from captions William approved (2026-10-08).
  const examples = (opts.examples ?? []).slice(0, 10);
  const system = `Du skriver bildtexter till Instagram och Facebook för varumärket Envana, flytande marint kollagen för svenska kvinnor.

${examples.length ? `Så här låter våra texter. Det här är texter vi har godkänt. Härma TONEN och LÄNGDEN, inte innehållet:
${examples.map((e) => `- ${e.replace(/(\s*#\S+)+\s*$/, "").replace(/\n+/g, " ")}`).join("\n")}

` : ""}Bakgrund om produkten (använd bara det som hör till ämnet du får):
${opts.brief}

Regler:
- Varumärket talar. Skriv "vi" om Envana och "du" till läsaren. ALDRIG jag-form.
- Kort: en eller två meningar, under 25 ord. Generiskt är okej. Beskriv inte bilden.
- Skriv om ÄMNET du får, inget annat. Lägg inte till andra produktargument.
- Skriv aldrig om kvinnans ålder i bilden. "Efter 50" bara om ämnet uttryckligen handlar om att bli äldre.
- Uttjatat, får inte användas: "tio sekunder", "det vackraste du kan bära", "inte magi, det är biologi", "bara för din skull".
- Svenska med å, ä och ö. Inga engelska ord. Inga tankstreck (– eller —). Högst en emoji, gärna ingen.
- "Länk i bio" högst ibland, bara på produktbilder. Aldrig "kommentera JA" eller "vad tycker du?".
- Hitta inte på siffror.

Svara ENDAST med JSON: {"caption": "...", "hashtags": ["#..."]} med 0-3 svenska sökords-hashtags.`;
  // A single image never says "svep" - that made the captions of one-image
  // text posts promise slides that do not exist (2026-10-05).
  const formatNote = opts.format === "carousel"
    ? "Inlägget är en karusell med flera bilder."
    : "Inlägget är EN enda bild, ingen karusell. Skriv aldrig svep, nästa bild eller liknande. Hänvisa inte till fler bilder.";
  const guide = opts.kind === "knowledge" && opts.format !== "carousel"
    ? "Det är ett textinlägg (en bild med en lista eller ett citat). Plocka en rad ur bilden och lägg till en egen kort tanke. Nämn inte produkten."
    : KIND_GUIDE[opts.kind];
  // The model invented weekdays ("Söndagen..." on a Thursday post, 2026-10-08).
  const when = opts.scheduledAt ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", weekday: "long" }).format(new Date(opts.scheduledAt)) : null;
  const user = `Typ av inlägg: ${SOCIAL_KINDS[opts.kind]}. ${guide} ${formatNote}
${topic ? `ÄMNE för den här texten: ${topic.brief}\n` : ""}${when ? `Nämn helst ingen veckodag. Om det behövs: inlägget publiceras en ${when}.\n` : ""}${opts.hint ? `Önskemål: ${opts.hint}\n` : ""}Inläggen runt det här i flödet. Säg inte samma sak, och börja inte likadant:
${opts.recent.slice(0, 12).map((c) => `- ${c.replace(/(\s*#\S+)+\s*$/, "").replace(/\n+/g, " ").slice(0, 160)}`).join("\n") || "- (inga än)"}`;

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
