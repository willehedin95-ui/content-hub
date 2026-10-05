import Anthropic from "@anthropic-ai/sdk";

import { SOCIAL_KINDS, type SocialKind } from "@/lib/social-kinds";
export { SOCIAL_KINDS, type SocialKind };

const KIND_GUIDE: Record<SocialKind, string> = {
  product: "Produkten är i fokus. Lyft ETT argument från briefen, kort och konkret. Avsluta gärna med en mjuk uppmaning (länk i bio).",
  person: "Personen och stunden är i fokus. Skriv om känslan och vanan (morgonshoten, tio sekunder, något för dig själv). Produkten nämns naturligt, inte som reklam.",
  knowledge: "Det är en kunskapskarusell. Väck nyfikenhet på det första bilderna lovar, uppmana att svepa och att spara inlägget. Nämn inte produkten.",
  humor: "Det är ett humorinlägg. Bildtexten ska vara kort, en rad eller två, i samma glimt i ögat. Förklara aldrig skämtet.",
  question: "Det är en fråga till följarna. Upprepa frågan kort och be dem svara i kommentarerna.",
  other: "Skriv en kort, naturlig bildtext som passar bilden.",
};

export interface CaptionResult { caption: string; hashtags: string[] }

/** Write a Swedish caption for one post from its image(s), its kind and the brand brief. */
export async function writeCaption(opts: { imageUrls: string[]; kind: SocialKind; brief: string; recent: string[]; hint?: string }): Promise<CaptionResult> {
  const client = new Anthropic();
  const system = `Du skriver bildtexter till Instagram och Facebook för ett svenskt varumärke.

${opts.brief}

Regler för texten:
- Svenska, med å, ä och ö. Inga engelska ord.
- Enkelt och rakt, som en människa skriver. Korta meningar. Ingen vetenskaplig ton, inga förbehåll.
- Använd samma argument som i briefen när du nämner produkten. Hitta inte på nya siffror.
- Inga tankstreck (– eller —). Använd punkt eller komma.
- Högst 2-4 korta stycken. Högst en emoji, gärna ingen.
- Upprepa inte inledningar eller formuleringar från de senaste bildtexterna.

Svara ENDAST med JSON: {"caption": "...", "hashtags": ["#...", "#..."]} med 3-5 relevanta svenska hashtags.`;
  const user = `Typ av inlägg: ${SOCIAL_KINDS[opts.kind]}. ${KIND_GUIDE[opts.kind]}
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
    .filter((h: string) => h.length > 2).slice(0, 5);
  return { caption: caption.slice(0, 2000), hashtags };
}
