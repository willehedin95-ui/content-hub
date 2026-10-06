import Anthropic from "@anthropic-ai/sdk";

import { SOCIAL_KINDS, type SocialKind } from "@/lib/social-kinds";
export { SOCIAL_KINDS, type SocialKind };

const KIND_GUIDE: Record<SocialKind, string> = {
  product: "Produktbild. Ta ETT argument från briefen och säg det kort och rakt. Ingen säljuppmaning, högst ibland en mjuk hänvisning till länken i bio.",
  person: "Bild på en kvinna med produkten. Beskriv INTE bilden (inte 'hon ler', 'glaset i handen'). Säg något som betalar av känslan i bilden: en tanke, ett argument eller en igenkänning riktad till läsaren. Produkten får nämnas, men det är ingen reklam.",
  knowledge: "Kunskapskarusell. Första raden ska väcka nyfikenhet på det karusellen lovar, utan att upprepa omslagets rubrik. Avsluta med en uppmaning att spara inlägget eller skicka det till någon. Nämn inte produkten.",
  humor: "Humorinlägg. En rad, högst två. Förklara aldrig skämtet.",
  question: "En fråga till följarna. Upprepa frågan kort.",
  other: "Skriv en kort bildtext som passar bilden.",
};

export interface CaptionResult { caption: string; hashtags: string[] }

/** Write a Swedish caption for one post from its image(s), its kind and the brand brief. */
export async function writeCaption(opts: { imageUrls: string[]; kind: SocialKind; brief: string; recent: string[]; hint?: string; format?: "image" | "carousel" }): Promise<CaptionResult> {
  const client = new Anthropic();
  // Rules from the vault corpus (instagram-carousels-captions-stories, envana-karuseller-sa-designar-man-dem)
  // and from 2 675 captions of 20 reference brands measured 2026-10-06: brands write as "vi" to "du"
  // (first person singular in 5.6 %, mostly founder stories), median 48 words, 2 emoji, 62 % no hashtags,
  // calls to action in under 10 %. The first first-person captions were rejected by William as worthless.
  const system = `Du skriver bildtexter till Instagram och Facebook för varumärket Envana.

${opts.brief}

Röst:
- Varumärket talar. Skriv "vi" om Envana och "du" till läsaren. ALDRIG jag-form (jag, min, mitt, mig). Inga påhittade personer som berättar.
- Enkelt och rakt, varmt och lite kaxigt. Korta meningar. Ingen vetenskaplig ton, inga förbehåll.

Form:
- KORT. Helst en eller två meningar, högst tre korta rader och under 35 ord (hashtags oräknade).
- Första raden bär texten: en krok som betalar av bilden i stället för att beskriva eller upprepa den, och gärna ett ord folk söker på (kollagen, hud, naglar, hår, klimakteriet, leder).
- Beskriv aldrig vad som syns i bilden.
- Uppmaning bara när den passar och aldrig samma varje gång. Karusell: "Spara till ..." eller "Skicka till en vän som ...". Fråga bara något specifikt som läsaren kan svara på om sig själv, aldrig "vad tycker du?" eller "kommentera JA".
- "Länk i bio" bara på produktinlägg, och inte varje gång.
- Svenska med å, ä och ö. Inga engelska ord. Inga tankstreck (– eller —), använd punkt eller komma.
- Högst två emoji, gärna ingen.
- Använd samma argument som i briefen när du nämner produkten. Hitta inte på nya siffror.
- Upprepa inte inledningar eller formuleringar från de senaste bildtexterna.

Svara ENDAST med JSON: {"caption": "...", "hashtags": ["#...", "#..."]} med 0-3 svenska sökords-hashtags (till exempel #kollagen, #marintkollagen). Hashtags ger ingen räckvidd, bara sökbarhet.`;
  // A single image never says "svep" - that made the captions of one-image
  // text posts promise slides that do not exist (2026-10-05).
  const formatNote = opts.format === "carousel"
    ? "Inlägget är en karusell med flera bilder."
    : "Inlägget är EN enda bild, ingen karusell. Skriv aldrig svep, nästa bild eller liknande. Hänvisa inte till fler bilder.";
  const guide = opts.kind === "knowledge" && opts.format !== "carousel"
    ? "Det är ett textinlägg (en bild med en lista eller ett citat). Plocka en eller två rader ur bilden och lägg till en egen tanke, eller ställ en fråga som får folk att svara i kommentarerna. Nämn inte produkten."
    : KIND_GUIDE[opts.kind];
  const user = `Typ av inlägg: ${SOCIAL_KINDS[opts.kind]}. ${guide} ${formatNote}
${opts.hint ? `Önskemål: ${opts.hint}\n` : ""}De senaste bildtexterna (upprepa inte dessa):
${opts.recent.slice(0, 8).map((c) => `- ${c.slice(0, 160).replace(/\n/g, " ")}`).join("\n") || "- (inga än)"}`;

  const content: Anthropic.MessageParam["content"] = [
    ...opts.imageUrls.slice(0, 4).map((url) => ({ type: "image" as const, source: { type: "url" as const, url } })),
    { type: "text" as const, text: user },
  ];
  const res = await client.messages.create({ model: "claude-sonnet-5-5", max_tokens: 1500, system, messages: [{ role: "user", content }] });
  const tb = res.content.find((b) => b.type === "text");
  const raw = tb && tb.type === "text" ? tb.text.trim() : "";
  const json = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim().match(/\{[\s\S]*\}/)?.[0] ?? "{}");
  // Language checks only: no dashes, sane length, 3-5 hashtags.
  const caption = String(json.caption ?? "").replace(/\s*[–—]\s*/g, ". ").replace(/\.\s*\./g, ".").trim();
  if (!caption) throw new Error(`Claude gav ingen bildtext (stop_reason: ${res.stop_reason})`);
  const hashtags = (Array.isArray(json.hashtags) ? json.hashtags : [])
    .map((h: unknown) => String(h).trim().replace(/^#?/, "#").replace(/\s+/g, ""))
    .filter((h: string) => h.length > 2).slice(0, 3);
  return { caption: caption.slice(0, 2000), hashtags };
}
