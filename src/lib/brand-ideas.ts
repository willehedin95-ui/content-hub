import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "./constants";

// Genererar brandnamn-idéer i Williams stil (från namn-brainstormen).
// Billigt: liten output (~25 namn). Auto-kör INGEN koll - fyller bara sökrutan.

const BRIEF = `Du föreslår varumärkesnamn för ett premium-kosttillskott (marint kollagen) som ska ersätta arbetsnamnet "Renew". Det ska bli ett paraplyvarumärke (branded house) - flera produkter under ett namn.

Stilen som gillas (VIKTIGT):
- Helst TVÅORDS-kombinationer (ev. ihopskrivna), engelska.
- Varma, vardagliga, lite lekfulla/oväntade - i stil med Drunk Elephant, Happy Mammoth, Spoiled Child. Random men charmigt, inte mörkt/edgy.
- Andra gillade spår: "comeback / känn dig som dig själv igen", "Fuel" (kollagen = bränsle), oväntade ord-krockar.
- Könsneutralt, paraply-dugligt (INTE låst till kollagen/skönhet/en smak/en form), internationellt uttalbart, inga å/ä/ö.

UNDVIK:
- Beskrivande "förnyelse"-ord (Renew, Revive, Restore, Reborn, Renew-synonymer).
- Platta enstaka ordboksord som inte går att varumärkesskydda (True, Pure, Glow).
- Frukt/smak-ord (läses som smaken).
- Påhittade abstrakta ord ingen kan uttala.

VARIERA KRAFTIGT - detta är viktigast: upprepa ALDRIG samma mall. Använd INTE samma andra-ord om och om (t.ex. inte "[ord] Habit" eller "[ord] Ritual" gång på gång). Blanda mekaniker fritt: oväntade tvåords-par, ihopslagna ord, idiom, mood+djur, comeback-fraser. Varje förslag ska kännas eget.

Svara med ENBART en lista, ett namn per rad, inga siffror, inga förklaringar, ingen rubrik.`;

export async function generateBrandIdeas(theme?: string, count = 25): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY saknas");
  const client = new Anthropic({ apiKey });

  const steer = theme?.trim()
    ? `\n\nFokusera särskilt på detta tema/spår: "${theme.trim()}".`
    : "";
  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 600,
    temperature: 1,
    system: BRIEF,
    messages: [{ role: "user", content: `Ge mig ${count} namnförslag.${steer}` }],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return text
    .split("\n")
    .map((l) => l.replace(/^[\s\-*•\d.)]+/, "").trim())
    .filter((l) => l.length > 0 && l.length <= 40 && l.split(/\s+/).length <= 3)
    .slice(0, count);
}
