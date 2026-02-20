import OpenAI from "openai";
import { Language } from "@/types";
import { formatRules } from "./translation-rules";
import { formatLocalization } from "./localization";
import { OPENAI_MODEL } from "./constants";
import { withRetry, isTransientError } from "./retry";

const LANGUAGE_NAMES: Record<Language, string> = {
  sv: "svenska",
  da: "dansk",
  no: "norsk (bokmål)",
  de: "deutsch",
};

const LANGUAGE_NAMES_EN: Record<Language, string> = {
  sv: "Swedish",
  da: "Danish",
  no: "Norwegian (Bokmål)",
  de: "German",
};

const COUNTRIES: Record<Language, string> = {
  sv: "Sweden",
  da: "Denmark",
  no: "Norway",
  de: "Germany",
};

const DO_NOT_TRANSLATE = "HappySleep, Hydro13, SwedishBalance, Nordic Cradle, HappySleep Ergo, Hälsobladet";

/**
 * Translate the entire HTML body in one shot — GPT sees the full page as a
 * flowing narrative and translates all visible text in place. This mirrors
 * the proven workflow: paste full text into GPT, get back perfect translation.
 *
 * No JSON, no fragments, no blocks — just the complete HTML in, complete
 * translated HTML out.
 */
export async function translateFullHtml(
  bodyHtml: string,
  language: Language,
  apiKey: string,
): Promise<{
  result: string;
  inputTokens: number;
  outputTokens: number;
}> {
  const client = new OpenAI({ apiKey });
  const langName = LANGUAGE_NAMES_EN[language];
  const langNameNative = LANGUAGE_NAMES[language];
  const country = COUNTRIES[language];

  const localizationBlock = formatLocalization(language);

  const systemPrompt = `You are a senior native ${langName} (${langNameNative}) copywriter and translator with deep understanding of how people in ${country} think, talk and buy (target audience ~35–65). You write simply, clearly and naturally. You always prioritise CLARITY. A confused mind says no.

TASK:
You will receive the complete HTML of an English web page (an advertorial / landing page for a health/sleep product).
Translate ALL visible text content into natural, fluent ${langName}.
Return the COMPLETE translated HTML with the EXACT same structure — only the visible text content should change.
The goal is for the page to read as if it was ORIGINALLY WRITTEN by a native ${langName} speaker — not like a translation.

KEY PRINCIPLES:
1) Preserve meaning and intent 1:1, but rewrite where needed to sound natural in ${langName}.
2) Grade 6 level: short sentences, simple words, clear rhythm. No unnecessary fancy words.
3) Avoid literal translations and calques from English. Choose common, everyday ${langName} words people actually use.
4) Keep the original tone (premium/warm/factual/reassuring/sales-focused), adapted for ${langName} culture.
5) No teen slang. No Gen Z style.
6) Do not add new claims, facts, or promises. Do not remove important conditions. Do not change numbers/doses/prices — only format locally.
7) Never use hyphens in sales copy unless the original text has them.

HTML PRESERVATION (CRITICAL — read carefully):
- Preserve ALL HTML tags, attributes, classes, IDs, data attributes, and structure EXACTLY as they are.
- Only translate the visible TEXT CONTENT between and around tags.
- DO translate: visible text, alt attributes on images, title attributes, placeholder attributes.
- Do NOT translate or modify: URLs, href values, src values, CSS classes, inline styles, JavaScript, data-* attributes, id attributes.
- Do NOT add, remove, reorder, or modify any HTML tags or their attributes (except translating alt/title/placeholder text).
- Preserve all whitespace, line breaks, and formatting in the HTML structure.
- Keep brand/product names EXACTLY as-is (never translate): ${DO_NOT_TRANSLATE}

${localizationBlock ? `LOCALISATION:\n${localizationBlock}\n` : ""}ADDITIONAL RULES:
${formatRules()}

IMPORTANT: Return ONLY the translated HTML. No explanations, no markdown code fences, no comments before or after. Just the raw HTML exactly as it should be saved.`;

  const response = await withRetry(
    () =>
      client.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: bodyHtml },
        ],
        temperature: 0.3,
      }),
    { maxAttempts: 3, initialDelayMs: 2000, isRetryable: isTransientError }
  );

  const choice = response.choices[0];
  if (!choice?.message?.content) {
    throw new Error("No response from GPT");
  }

  // Detect truncated output — GPT hit the token limit and returned incomplete HTML
  if (choice.finish_reason === "length") {
    throw new Error("Translation was truncated (output too long). Try a shorter page or split it.");
  }

  let translatedHtml = choice.message.content;

  // Strip markdown code fences if GPT wrapped the output
  translatedHtml = translatedHtml
    .replace(/^```html?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  return {
    result: translatedHtml,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
}

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
${formatLocalization("da")}
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
${formatLocalization("no")}
- Currency/dates/measurements: use Norwegian standard (nb-NO).
- Address reader as "du" with warm, reassuring tone.

ADDITIONAL RULES:
${formatRules()}

OUTPUT:
Return ONLY valid JSON with the same keys as input and translated Norwegian values.
No explanations, no comments, no extra keys.`,

  de: `DU BIST: Ein erfahrener, muttersprachlicher Copywriter + Übersetzer auf Deutsch, mit tiefem Verständnis dafür, wie Menschen in Deutschland denken, sprechen und kaufen (Zielgruppe ca. 35–65). Du schreibst einfach, klar und natürlich. Du priorisierst immer KLARHEIT. Ein verwirrter Kopf sagt nein.

AUFTRAG:
Du bekommst ein JSON-Objekt mit englischen Textwerten. Übersetze und lokalisiere jeden Wert vom Englischen ins Deutsche.
Gib EXAKT dieselbe JSON-Struktur mit denselben Schlüsseln zurück – ersetze nur die Werte durch übersetzte deutsche Texte.
Das Ziel ist, dass der Text sich anfühlt, als wäre er ursprünglich von einem Muttersprachler in Deutschland geschrieben – nicht wie eine Übersetzung.

WICHTIGSTE PRINZIPIEN:
1) Bewahre die Bedeutung und Intention 1:1, aber formuliere um, wo nötig, damit es natürlich klingt.
2) Klasse-6-Niveau: kurze Sätze, einfache Wörter, klarer Rhythmus. Keine unnötigen "feinen Wörter".
3) Vermeide direkt übersetzte Ausdrücke und "Denglisch". Wähle gängige, alltägliche Wörter, die Menschen tatsächlich verwenden.
4) Behalte den Ton des Originals (premium/warm/sachlich/vertrauensvoll/verkaufsorientiert), aber passe für die lokale Kultur an.
5) Kein Jugendslang. Kein Gen-Z-Stil.
6) Füge keine neuen Claims, Versprechen oder Fakten hinzu. Entferne keine wichtigen Bedingungen. Ändere keine Zahlen/Dosierungen/Preise – formatiere nur lokal (z.B.: Dezimalkomma, Währung in EUR wenn relevant).
7) Bei juristischen/Policy-Texten: Priorisiere Genauigkeit und Klarheit (trotzdem leicht lesbar), und ändere nicht die Bedeutung.
8) Bei Verkaufstexten: Priorisiere Fluss, Gefühl und Einfachheit – aber ohne das Kernmessage zu ändern.
9) Verwende niemals Bindestriche in Copy, es sei denn, der Originaltext hat sie. Bindestriche sind nicht natürlich in der Umgangssprache.

FORMAT & TECHNIK (MUSS BEFOLGT WERDEN):
- Behalte dieselbe Struktur: Zeilenumbrüche, Emojis, Zitate, Styling wenn vorhanden.
- Nicht anfassen: HTML-Tags, Variablen (z.B.: {{name}}, {price}, %), URLs, UTM-Parameter, Produkt-SKU.
- Behalte Markennamen und Produktnamen unverändert: ${DO_NOT_TRANSLATE}

LOKALISIERUNG:
${formatLocalization("de")}
- Währung/Daten/Maße/Dezimalstellen: verwende deutschen Standard (de-DE).
- Anrede: verwende "Sie" in formellen Kontexten, "du" in lockerer Ansprache mit warmer, vertrauensvoller Tonalität.

ZUSÄTZLICHE REGELN:
${formatRules()}

AUSGABE:
Gib NUR gültiges JSON mit denselben Schlüsseln wie die Eingabe und übersetzten deutschen Werten zurück.
Keine Erklärungen, keine Kommentare, keine zusätzlichen Schlüssel.`,
};

export async function translateBatch(
  texts: Array<{ id: string; text: string }>,
  language: Language,
  apiKey: string,
  options?: { pageContext?: string; qualityFeedback?: string }
): Promise<{
  result: Record<string, string>;
  inputTokens: number;
  outputTokens: number;
}> {
  const client = new OpenAI({ apiKey });
  let systemPrompt = SYSTEM_PROMPTS[language];

  // Add full page context so the AI understands what it's translating
  if (options?.pageContext) {
    systemPrompt += `\n\nFULL PAGE CONTEXT (read this FIRST to understand the story/topic, then translate the JSON values below with this context in mind — do NOT include this context in your output):\n---\n${options.pageContext.slice(0, 6000)}\n---`;
  }

  // Add quality feedback for fix/improve passes
  if (options?.qualityFeedback) {
    systemPrompt += `\n\nQUALITY ISSUES FROM PREVIOUS ATTEMPT (fix these specific problems in your translation):\n${options.qualityFeedback}`;
  }

  // Split into chunks to avoid token limits, then translate all in parallel
  const CHUNK_SIZE = 80;
  const result: Record<string, string> = {};
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const chunks: Array<{ id: string; text: string }[]> = [];
  for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
    chunks.push(texts.slice(i, i + CHUNK_SIZE));
  }

  const settled = await Promise.allSettled(
    chunks.map((chunk) => {
      const inputJson = JSON.stringify(
        Object.fromEntries(chunk.map(({ id, text }) => [id, text]))
      );
      return withRetry(
        () =>
          client.chat.completions.create({
            model: OPENAI_MODEL,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: inputJson },
            ],
            response_format: { type: "json_object" },
            temperature: 0.3,
          }),
        { maxAttempts: 3, initialDelayMs: 2000, isRetryable: isTransientError }
      );
    })
  );

  const failedChunks: string[] = [];
  for (const outcome of settled) {
    if (outcome.status === "rejected") {
      failedChunks.push(outcome.reason instanceof Error ? outcome.reason.message : "Unknown error");
      continue;
    }
    const response = outcome.value;
    try {
      const translated = JSON.parse(
        response.choices[0].message.content || "{}"
      ) as Record<string, string>;
      Object.assign(result, translated);
    } catch {
      failedChunks.push("Failed to parse translation chunk response");
    }

    if (response.usage) {
      totalInputTokens += response.usage.prompt_tokens;
      totalOutputTokens += response.usage.completion_tokens;
    }
  }

  if (failedChunks.length > 0 && failedChunks.length === chunks.length) {
    throw new Error(`All translation chunks failed: ${failedChunks[0]}`);
  }

  return { result, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
}

const HTML_PRESERVATION_INSTRUCTION = `
CRITICAL — HTML TAG PRESERVATION:
Each value may contain inline HTML tags (<strong>, <em>, <span>, <a href="...">, <br>, etc.).
You MUST preserve ALL HTML tags exactly as they are. Only translate the TEXT CONTENT between and around tags.
- Do NOT add, remove, reorder, or modify any HTML tags or their attributes.
- Example: "Our <strong>premium</strong> sleep pillow" → "Vår <strong>premium</strong> sömnkudde"
- Example: "<a href='/shop'>Shop now</a> for better sleep" → "<a href='/shop'>Handla nu</a> för bättre sömn"
- If a value has no HTML tags, translate it as plain text.
- Treat each JSON value as a complete sentence or heading — translate it as a natural, fluent unit.

CRITICAL — NAME CONSISTENCY:
When the page tells a story involving characters/people, you MUST use the SAME localized name for each person across ALL JSON values. Before translating, decide what each character's name will be, then use it consistently everywhere. Never mix different names for the same character.`;

/**
 * Translate blocks of HTML content (complete paragraphs, headings, list items).
 * Each block preserves inline HTML tags — GPT translates the text while keeping
 * the tag structure intact. This produces dramatically better quality than
 * fragment-based translation because GPT sees full sentences in context.
 */
export async function translateBlocks(
  blocks: Array<{ id: string; tag: string; html: string }>,
  language: Language,
  apiKey: string,
  options?: { pageContext?: string; qualityFeedback?: string }
): Promise<{
  result: Record<string, string>;
  inputTokens: number;
  outputTokens: number;
}> {
  const client = new OpenAI({ apiKey });
  let systemPrompt = SYSTEM_PROMPTS[language] + HTML_PRESERVATION_INSTRUCTION;

  if (options?.pageContext) {
    systemPrompt += `\n\nFULL PAGE CONTEXT (read this FIRST to understand the story/topic, then translate the JSON values below with this context in mind — do NOT include this context in your output):\n---\n${options.pageContext.slice(0, 6000)}\n---`;
  }

  if (options?.qualityFeedback) {
    systemPrompt += `\n\nQUALITY ISSUES FROM PREVIOUS ATTEMPT (fix these specific problems in your translation):\n${options.qualityFeedback}`;
  }

  // Large chunk size — most landing pages (50-150 blocks) fit in 1-2 chunks,
  // ensuring consistent name localization across the entire page
  const CHUNK_SIZE = 120;
  const result: Record<string, string> = {};
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const chunks: Array<{ id: string; tag: string; html: string }[]> = [];
  for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
    chunks.push(blocks.slice(i, i + CHUNK_SIZE));
  }

  const settled = await Promise.allSettled(
    chunks.map((chunk) => {
      const inputJson = JSON.stringify(
        Object.fromEntries(chunk.map(({ id, html }) => [id, html]))
      );
      return withRetry(
        () =>
          client.chat.completions.create({
            model: OPENAI_MODEL,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: inputJson },
            ],
            response_format: { type: "json_object" },
            temperature: 0.3,
          }),
        { maxAttempts: 3, initialDelayMs: 2000, isRetryable: isTransientError }
      );
    })
  );

  const failedChunks: string[] = [];
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === "rejected") {
      failedChunks.push(outcome.reason instanceof Error ? outcome.reason.message : "Unknown error");
      continue;
    }
    const response = outcome.value;
    try {
      const translated = JSON.parse(
        response.choices[0].message.content || "{}"
      ) as Record<string, string>;

      // Validate tag structure for each translated block
      const chunk = chunks[i];
      for (const { id, html: originalHtml } of chunk) {
        const translatedHtml = translated[id];
        if (!translatedHtml) continue;

        const origTags = extractTagNames(originalHtml);
        const transTags = extractTagNames(translatedHtml);
        if (origTags !== transTags) {
          console.warn(
            `[translateBlocks] Tag mismatch for ${id}: expected [${origTags}] got [${transTags}]`
          );
        }
      }

      Object.assign(result, translated);
    } catch {
      failedChunks.push("Failed to parse translation chunk response");
    }

    if (response.usage) {
      totalInputTokens += response.usage.prompt_tokens;
      totalOutputTokens += response.usage.completion_tokens;
    }
  }

  if (failedChunks.length > 0 && failedChunks.length === chunks.length) {
    throw new Error(`All translation chunks failed: ${failedChunks[0]}`);
  }

  return { result, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
}

/** Extract ordered tag names from HTML for structure validation */
function extractTagNames(html: string): string {
  const tags: string[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const name = m[1].toLowerCase();
    if (m[0].endsWith("/>") || ["br", "hr", "img", "input"].includes(name)) continue;
    tags.push(m[0].startsWith("</") ? `/${name}` : name);
  }
  return tags.join(",");
}

/**
 * Replace text only within HTML text content — never inside tags.
 * Splits HTML into alternating [text, tag, text, tag, ...] segments.
 *
 * Fast path: if the find string exists within a single text segment,
 * replaceAll is applied directly to that segment.
 *
 * Fallback: cross-tag matching — the find string is searched in the
 * "virtual text" (all text segments concatenated). When found, the
 * replacement is applied across the affected segments, preserving
 * HTML tags in between.
 */
function safeTextReplace(html: string, find: string, replace: string): string {
  const parts = html.split(/(<[^>]+>)/);

  // Fast path: find exists within a single text segment
  let directMatch = false;
  for (let i = 0; i < parts.length; i += 2) {
    if (parts[i].includes(find)) {
      directMatch = true;
      break;
    }
  }
  if (directMatch) {
    for (let i = 0; i < parts.length; i += 2) {
      if (parts[i].includes(find)) {
        parts[i] = parts[i].replaceAll(find, replace);
      }
    }
    return parts.join("");
  }

  // Cross-tag matching: build virtual text from text segments
  const segs: { partIndex: number; offset: number; length: number }[] = [];
  let virtualText = "";
  for (let i = 0; i < parts.length; i += 2) {
    segs.push({ partIndex: i, offset: virtualText.length, length: parts[i].length });
    virtualText += parts[i];
  }
  if (!virtualText.includes(find)) return html; // Not found at all

  // Collect all non-overlapping match positions
  const positions: number[] = [];
  let searchFrom = 0;
  while (true) {
    const pos = virtualText.indexOf(find, searchFrom);
    if (pos === -1) break;
    positions.push(pos);
    searchFrom = pos + find.length;
  }

  // Apply replacements from end to start (preserves earlier offsets)
  const newParts = [...parts];
  for (let p = positions.length - 1; p >= 0; p--) {
    const matchStart = positions[p];
    const matchEnd = matchStart + find.length;

    // Find the first and last text segments that overlap the match
    let firstSeg = -1, firstOffset = 0;
    let lastSeg = -1, lastOffset = 0;
    for (let s = 0; s < segs.length; s++) {
      const segStart = segs[s].offset;
      const segEnd = segs[s].offset + segs[s].length;
      if (firstSeg === -1 && segEnd > matchStart) {
        firstSeg = s;
        firstOffset = matchStart - segStart;
      }
      if (segEnd >= matchEnd) {
        lastSeg = s;
        lastOffset = matchEnd - segs[s].offset;
        break;
      }
    }
    if (firstSeg === -1 || lastSeg === -1) continue;

    if (firstSeg === lastSeg) {
      // Same segment — simple substring replacement
      const pi = segs[firstSeg].partIndex;
      newParts[pi] =
        newParts[pi].substring(0, firstOffset) + replace + newParts[pi].substring(lastOffset);
    } else {
      // Spans multiple segments: insert replacement in first, clear rest
      const firstPi = segs[firstSeg].partIndex;
      newParts[firstPi] = newParts[firstPi].substring(0, firstOffset) + replace;

      for (let s = firstSeg + 1; s < lastSeg; s++) {
        newParts[segs[s].partIndex] = "";
      }

      const lastPi = segs[lastSeg].partIndex;
      newParts[lastPi] = newParts[lastPi].substring(lastOffset);
    }
  }

  return newParts.join("");
}

/** Parse GPT corrections JSON and apply find→replace to HTML text content */
function applyCorrections(html: string, rawJson: string): { html: string; applied: number; failed: string[] } {
  let corrections: { find: string; replace: string }[] = [];
  try {
    const parsed = JSON.parse(rawJson);
    corrections = Array.isArray(parsed) ? parsed : (parsed.corrections || []);
  } catch {
    console.warn("[applyCorrections] Failed to parse JSON:", rawJson.slice(0, 200));
    return { html, applied: 0, failed: [] };
  }

  if (corrections.length === 0) {
    console.log("[applyCorrections] GPT returned 0 corrections");
    return { html, applied: 0, failed: [] };
  }

  let result = html;
  let applied = 0;
  const failed: string[] = [];

  for (const { find, replace } of corrections) {
    if (!find || !replace || find === replace) continue;
    const before = result;
    result = safeTextReplace(result, find, replace);
    if (result !== before) {
      applied++;
    } else {
      failed.push(find.slice(0, 80));
    }
  }

  console.log(
    `[applyCorrections] ${corrections.length} corrections from GPT → ${applied} applied, ${failed.length} failed to match`
  );
  if (failed.length > 0) {
    console.log("[applyCorrections] Failed finds:", failed);
  }

  return { html: result, applied, failed };
}

/** Apply a pre-parsed corrections array to HTML (exported for use by fix route) */
export function applyCorrectionsList(
  html: string,
  corrections: { find: string; replace: string }[]
): { html: string; applied: number; failed: string[] } {
  if (!corrections || corrections.length === 0) {
    return { html, applied: 0, failed: [] };
  }

  let result = html;
  let applied = 0;
  const failed: string[] = [];

  for (const { find, replace } of corrections) {
    if (!find || !replace || find === replace) continue;
    const before = result;
    result = safeTextReplace(result, find, replace);
    if (result !== before) {
      applied++;
    } else {
      failed.push(find.slice(0, 80));
    }
  }

  console.log(
    `[applyCorrectionsList] ${corrections.length} corrections → ${applied} applied, ${failed.length} failed to match`
  );
  if (failed.length > 0) {
    console.log("[applyCorrectionsList] Failed finds:", failed);
  }

  return { html: result, applied, failed };
}

const CORRECTIONS_FORMAT = `OUTPUT FORMAT:
Return a JSON object: {"corrections": [{"find": "visible text", "replace": "corrected text"}, ...]}

- "find" must be the VISIBLE TEXT as a reader would see it — do NOT include HTML tags (<strong>, <em>, <span>, etc.) in the find string.
- Copy the visible text character-for-character. The system will match it even when it spans across HTML tags.
- "replace" is the corrected version. Also plain visible text, no HTML tags.
- Each correction is applied to ALL occurrences in the page, so use it for consistency fixes (e.g. replacing a name everywhere).
- For text consistency: provide just the phrase (e.g. {"find": "sömnkudde", "replace": "søvnpude"}) — this replaces it everywhere.
- Only include text that needs changing. Do NOT include unchanged text.
- If no corrections are needed, return {"corrections": []}.
- Return ONLY the JSON object. No markdown, no explanations.`;

/**
 * Polish a freshly assembled translation.
 * Reviews the full translated HTML and returns targeted corrections.
 * With block-level translation, this is a lightweight consistency check
 * rather than a critical artifact-fixer.
 */
export async function polishHtml(
  translatedBodyHtml: string,
  language: Language,
  apiKey: string,
  originalBodyHtml?: string,
): Promise<{
  result: string;
  inputTokens: number;
  outputTokens: number;
}> {
  const client = new OpenAI({ apiKey });
  const langName = LANGUAGE_NAMES_EN[language];
  const langNameNative = LANGUAGE_NAMES[language];

  const systemPrompt = `You are a senior native ${langName} (${langNameNative}) editor. You will receive the HTML body of a web page that was translated from English using block-level translation (each paragraph, heading, and list item was translated as a complete unit). While this approach preserves sentence context, there may still be minor issues:

- Inconsistent terminology or phrasing across different sections of the page
- Slight phrasing variations between sections that sound unnatural when read as a whole
- Compound words that should be written together (e.g. "sömn kudde" → "sömnkudde")
- Any remaining awkward or unnatural phrasing
${originalBodyHtml ? `\nORIGINAL ENGLISH HTML (for reference — do NOT copy English text, only use for context):\n<original>\n${originalBodyHtml.slice(0, 20000)}\n</original>` : ""}

RULES:
1) Review the full page and fix any inconsistencies or unnatural phrasing.
2) The text must read as if ORIGINALLY WRITTEN in ${langName} — not as a translation.
3) Keep brand names unchanged: ${DO_NOT_TRANSLATE}
4) Use sentence case only — never title case (except proper nouns).
5) Keep all person names exactly as they appear — do NOT rename or localise any character names.
${formatRules()}

${CORRECTIONS_FORMAT}`;

  const response = await withRetry(
    () =>
      client.chat.completions.create({
        model: OPENAI_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: translatedBodyHtml.slice(0, 60000) },
        ],
        temperature: 0.3,
      }),
    { maxAttempts: 3, initialDelayMs: 2000, isRetryable: isTransientError }
  );

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from GPT");
  }

  return {
    result: applyCorrections(translatedBodyHtml, content).html,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
}

/**
 * Fix quality issues in an existing translated HTML page.
 * Sends the full translated HTML to GPT so it sees everything in context,
 * but asks GPT to return only a JSON list of corrections (find→replace).
 * This is dramatically faster than asking GPT to output the full HTML back.
 */
export async function fixHtml(
  translatedBodyHtml: string,
  language: Language,
  apiKey: string,
  options: {
    qualityFeedback: string;
    originalBodyHtml?: string;
  }
): Promise<{
  result: string;
  inputTokens: number;
  outputTokens: number;
}> {
  const client = new OpenAI({ apiKey });
  const langName = LANGUAGE_NAMES_EN[language];
  const langNameNative = LANGUAGE_NAMES[language];

  const systemPrompt = `You are a senior native ${langName} (${langNameNative}) editor and proofreader. You will receive the HTML body of a translated web page. A quality analysis has found specific problems. Fix them by providing a JSON object with corrections.

QUALITY ISSUES TO FIX:
${options.qualityFeedback}
${options.originalBodyHtml ? `\nORIGINAL ENGLISH HTML (for reference if meaning was lost — do NOT copy English text, only use it to understand intent):\n<original>\n${options.originalBodyHtml.slice(0, 20000)}\n</original>` : ""}

RULES:
1) Fix the specific quality issues listed above. Only correct text that actually has problems.
2) The corrections must read naturally as native ${langName} — not like a translation.
3) Keep brand names unchanged: ${DO_NOT_TRANSLATE}
4) Use sentence case only — never title case (except proper nouns).
5) Keep all person names exactly as they appear — do NOT rename or localise any character names.
${formatRules()}

${CORRECTIONS_FORMAT}`;

  const response = await withRetry(
    () =>
      client.chat.completions.create({
        model: OPENAI_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: translatedBodyHtml.slice(0, 60000) },
        ],
        temperature: 0.3,
      }),
    { maxAttempts: 3, initialDelayMs: 2000, isRetryable: isTransientError }
  );

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from GPT");
  }

  return {
    result: applyCorrections(translatedBodyHtml, content).html,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
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

  const response = await withRetry(
    () =>
      client.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content: `Translate these SEO meta values from English to ${langName} (${langNameNative}).
Write naturally for a native ${langName} speaker. Keep brand names unchanged: ${DO_NOT_TRANSLATE}.
Keep all person names exactly as they appear — do NOT rename them.

ADDITIONAL RULES:
${formatRules()}

Return ONLY valid JSON with the same keys and translated values.`,
          },
          { role: "user", content: JSON.stringify(input) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    { maxAttempts: 3, initialDelayMs: 2000, isRetryable: isTransientError }
  );

  let parsedMetas = {};
  try {
    parsedMetas = JSON.parse(response.choices[0].message.content || "{}");
  } catch {
    // LLM returned malformed JSON — return empty rather than crash
  }

  return {
    result: parsedMetas,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
}
