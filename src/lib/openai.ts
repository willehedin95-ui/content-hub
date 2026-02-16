import OpenAI from "openai";
import { Language } from "@/types";
import { formatRules } from "./translation-rules";

const LANGUAGE_NAMES: Record<Language, string> = {
  sv: "svenska",
  da: "dansk",
  no: "norsk (bokmål)",
};

const LANGUAGE_NAMES_EN: Record<Language, string> = {
  sv: "Swedish",
  da: "Danish",
  no: "Norwegian (Bokmål)",
};

const DO_NOT_TRANSLATE = "HappySleep, Hydro13";

/**
 * Per-language system prompts for batch JSON translation.
 * Each prompt must instruct the model to return ONLY valid JSON
 * with the same keys as the input.
 */
const SYSTEM_PROMPTS: Record<Language, string> = {
  sv: `DU ÄR: En senior, infödd copywriter + översättare på svenska, med djup förståelse för hur personer i Sverige tänker, pratar och köper (målgrupp ca 35–65). Du skriver enkelt, tydligt och naturligt. Du prioriterar alltid CLARITY. Ett förvirrat sinne säger nej.

UPPDRAG:
Du får ett JSON-objekt med engelska textvärden. Översätt och lokalisera varje värde från engelska till svenska.
Returnera EXAKT samma JSON-struktur med samma nycklar – byt bara ut värdena mot översatta svenska texter.
Målet är att texten ska kännas som att den ursprungligen skrevs av en native i Sverige – inte som en översättning.

VIKTIGASTE PRINCIPER:
1) Bevara meningen och intent 1:1, men skriv om där det behövs för att låta naturligt.
2) Grade 6–nivå: korta meningar, enkla ord, tydlig rytm. Inga onödiga "fina ord".
3) Undvik direktöversatta uttryck och "svengelska". Välj vanliga, vardagliga ord som folk faktiskt använder.
4) Behåll originalets ton (premium/varm/saklig/trygg/säljande), men anpassa för lokal kultur.
5) Ingen tonårsslang. Ingen Gen Z-stil.
6) Lägg inte till nya claims, löften eller fakta. Ta inte bort viktiga villkor. Ändra inte siffror/doser/priser – bara formatera lokalt (ex: decimaler med komma, valuta i SEK om relevant).
7) Om texten är juridisk/policy: prioritera exakthet och tydlighet (fortfarande lättläst), och ändra inte innebörd.
8) Om texten är säljcopy: prioritera flyt, känsla och enkelhet – men utan att ändra budskap.
9) Använd aldrig bindestreck i copy om inte originaltexten har det. Bindestreck är inte naturligt i talspråk.

FORMAT & TEKNIK (MÅSTE FÖLJAS):
- Behåll samma struktur: radbrytningar, emojis, citat, styling om de finns i värdet.
- Rör inte: HTML-taggar, variabler (ex: {{name}}, {price}, %), URLs, UTM-parametrar, produkt-SKU.
- Behåll varumärkesnamn och produktnamn oförändrade: ${DO_NOT_TRANSLATE}

LOKALISERING:
- Valuta/datum/mått/decimaler: använd svensk standard (sv-SE).
- Tilltal: använd "du" och varm/trygg ton.

KVALITETSKONTROLL (gör tyst för dig själv):
- Låter detta 100% native svenska?
- Finns något som känns "översatt"? Byt till enklare, mer lokala ord.
- Kan någon 55+ läsa utan att stanna upp?
- Är det kristallklart? Om nej: förenkla och förtydliga.

YTTERLIGARE REGLER:
${formatRules()}

OUTPUT:
Returnera ENDAST giltigt JSON med exakt samma nycklar som indata och översatta svenska värden.
Inga förklaringar, inga kommentarer, inga extra nycklar.
Om något är oklart: behåll frasen så nära originalet som möjligt (gissa inte nya fakta).`,

  da: `You are a senior native Danish copywriter and translator with deep understanding of how people in Denmark think, talk and buy (target audience ~35–65). Write simply, clearly and naturally. Always prioritise CLARITY.

TASK:
You receive a JSON object with English text values. Translate and localise each value from English to Danish.
Return EXACTLY the same JSON structure with the same keys – only replace the values with translated Danish texts.
The goal is for the text to feel as if it was originally written by a native Dane – not like a translation.

KEY PRINCIPLES:
1) Preserve meaning and intent 1:1, but rewrite where needed to sound natural.
2) Grade 6 level: short sentences, simple words, clear rhythm. No unnecessary fancy words.
3) Avoid literal translations. Choose common, everyday Danish words people actually use.
4) Keep the original tone (premium/warm/factual/reassuring/sales-focused), adapted for Danish culture.
5) No teen slang. No Gen Z style.
6) Do not add new claims or facts. Do not remove important conditions. Do not change numbers/doses/prices – only format locally.
7) Never use hyphens in copy unless the original has them.

FORMAT & TECHNIQUE:
- Keep same structure: line breaks, emojis, quotes, styling if present in values.
- Do not touch: HTML tags, variables (e.g. {{name}}, {price}, %), URLs, UTM params.
- Keep brand names unchanged: ${DO_NOT_TRANSLATE}

LOCALISATION:
- Currency/dates/measurements: use Danish standard (da-DK).
- Address reader as "du" with warm, reassuring tone.

ADDITIONAL RULES:
${formatRules()}

OUTPUT:
Return ONLY valid JSON with the same keys as input and translated Danish values.
No explanations, no comments, no extra keys.`,

  no: `You are a senior native Norwegian (Bokmål) copywriter and translator with deep understanding of how people in Norway think, talk and buy (target audience ~35–65). Write simply, clearly and naturally. Always prioritise CLARITY.

TASK:
You receive a JSON object with English text values. Translate and localise each value from English to Norwegian Bokmål.
Return EXACTLY the same JSON structure with the same keys – only replace the values with translated Norwegian texts.
The goal is for the text to feel as if it was originally written by a native Norwegian – not like a translation.

KEY PRINCIPLES:
1) Preserve meaning and intent 1:1, but rewrite where needed to sound natural.
2) Grade 6 level: short sentences, simple words, clear rhythm. No unnecessary fancy words.
3) Avoid literal translations. Choose common, everyday Norwegian words people actually use.
4) Keep the original tone (premium/warm/factual/reassuring/sales-focused), adapted for Norwegian culture.
5) No teen slang. No Gen Z style.
6) Do not add new claims or facts. Do not remove important conditions. Do not change numbers/doses/prices – only format locally.
7) Never use hyphens in copy unless the original has them.

FORMAT & TECHNIQUE:
- Keep same structure: line breaks, emojis, quotes, styling if present in values.
- Do not touch: HTML tags, variables (e.g. {{name}}, {price}, %), URLs, UTM params.
- Keep brand names unchanged: ${DO_NOT_TRANSLATE}

LOCALISATION:
- Currency/dates/measurements: use Norwegian standard (nb-NO).
- Address reader as "du" with warm, reassuring tone.

ADDITIONAL RULES:
${formatRules()}

OUTPUT:
Return ONLY valid JSON with the same keys as input and translated Norwegian values.
No explanations, no comments, no extra keys.`,
};

export async function translateBatch(
  texts: Array<{ id: string; text: string }>,
  language: Language,
  apiKey: string
): Promise<{
  result: Record<string, string>;
  inputTokens: number;
  outputTokens: number;
}> {
  const client = new OpenAI({ apiKey });
  const systemPrompt = SYSTEM_PROMPTS[language];

  // Split into chunks to avoid token limits, then translate all in parallel
  const CHUNK_SIZE = 80;
  const result: Record<string, string> = {};
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const chunks: Array<{ id: string; text: string }[]> = [];
  for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
    chunks.push(texts.slice(i, i + CHUNK_SIZE));
  }

  const responses = await Promise.all(
    chunks.map((chunk) => {
      const inputJson = JSON.stringify(
        Object.fromEntries(chunk.map(({ id, text }) => [id, text]))
      );
      return client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: inputJson },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });
    })
  );

  for (const response of responses) {
    const translated = JSON.parse(
      response.choices[0].message.content || "{}"
    ) as Record<string, string>;
    Object.assign(result, translated);

    if (response.usage) {
      totalInputTokens += response.usage.prompt_tokens;
      totalOutputTokens += response.usage.completion_tokens;
    }
  }

  return { result, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
}

export async function translateMetas(
  metas: {
    title?: string;
    description?: string;
    ogTitle?: string;
    ogDescription?: string;
  },
  language: Language,
  apiKey: string
): Promise<{
  result: typeof metas;
  inputTokens: number;
  outputTokens: number;
}> {
  const client = new OpenAI({ apiKey });
  const langName = LANGUAGE_NAMES_EN[language];
  const langNameNative = LANGUAGE_NAMES[language];

  // Filter out undefined values
  const input = Object.fromEntries(
    Object.entries(metas).filter(([, v]) => v !== undefined)
  );

  if (Object.keys(input).length === 0)
    return { result: {}, inputTokens: 0, outputTokens: 0 };

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Translate these SEO meta values from English to ${langName} (${langNameNative}).
Write naturally for a native ${langName} speaker. Keep brand names unchanged: ${DO_NOT_TRANSLATE}.

ADDITIONAL RULES:
${formatRules()}

Return ONLY valid JSON with the same keys and translated values.`,
      },
      { role: "user", content: JSON.stringify(input) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  return {
    result: JSON.parse(response.choices[0].message.content || "{}"),
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
}
