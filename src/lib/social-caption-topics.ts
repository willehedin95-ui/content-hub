/**
 * What a caption is about is picked in CODE, not by the model (2026-10-08).
 *
 * Three prompt-only attempts in one day all fell back on the same few lines
 * from the brief ("efter 50", "smakar bär, inte fisk", "12 500 mg", "efter 25
 * tappar du en procent") however the prompt was worded. So each caption gets
 * one topic that its neighbours in the feed do not already have, and a
 * caption that drifts onto a neighbour's topic is rejected and rewritten.
 */
export interface Topic { key: string; group: "product" | "life"; brief: string; re: RegExp }

export const TOPICS: Topic[] = [
  // What the product is and why (shopenvana.com's own arguments).
  { key: "dos", group: "product", brief: "Dosen: 12 500 mg per shot, studier pekar på runt 10 000 mg, de flesta kapslar ger 2 500-5 000 mg.", re: /12\s?500|10\s?000 mg|\bdos(en)?\b/i },
  { key: "smak", group: "product", brief: "Smaken: bär, inte fisk, och sockerfri.", re: /\bbär\b|inte fisk|sockerfri|smakar/i },
  { key: "flytande", group: "product", brief: "Flytande i stället för kapslar och pulver: häll upp och klart, inget att svälja eller röra ut.", re: /flytande|kapsl|pulver/i },
  { key: "ingredienser", group: "product", brief: "13 aktiva ingredienser i samma flaska, bland annat elastin, hyaluronsyra, MSM, C-vitamin, biotin, zink, selen och astaxanthin.", re: /13 (aktiva )?ingredienser|elastin|hyaluron|biotin|astaxanthin|\bmsm\b/i },
  { key: "peptider", group: "product", brief: "Små peptider som kroppen tar upp och läser som en signal att bygga eget kollagen.", re: /peptid|dalton|signal/i },
  { key: "kvalitet", group: "product", brief: "Tillverkad i Sverige, testad för tungmetaller, ASC-certifierad fisk.", re: /tungmetall|\basc\b|tillverkad i sverige|svensktillverk/i },
  { key: "garanti", group: "product", brief: "60 dagars resultatgaranti: ser du ingen skillnad får du pengarna tillbaka.", re: /garanti|pengarna tillbaka|60 dagar/i },
  { key: "prenumeration", group: "product", brief: "Prenumeration utan bindning: pausa när du vill, från 449 kr.", re: /prenumer|bindning|pausa|449/i },
  { key: "frakt", group: "product", brief: "Fri frakt, hemma på 1-3 dagar.", re: /fri frakt|1-3 dagar/i },
  { key: "tidslinje", group: "product", brief: "Vad som händer vecka för vecka: huden först, sedan naglarna, håret sist.", re: /vecka \d|veckor|tidslinje/i },
  { key: "forlust", group: "product", brief: "Kroppen gör mindre kollagen med åren, och det går fortare i klimakteriet.", re: /procent|efter 25|tappar (du )?kollagen|mindre kollagen|fortare i klimakteriet|snabbare i klimakteriet/i },
  { key: "betyg", group: "product", brief: "4,7 av 5 i betyg från kunderna.", re: /4,7|betyg|recension/i },
  { key: "vana", group: "product", brief: "Att det blir av: flaskan där du ändå står varje morgon, en vana som inte tar tid.", re: /\bvana\b|rutin|varje morgon/i },
  // Life around it, no product fact.
  { key: "sol", group: "life", brief: "Ett konkret tips om solskydd, även på hösten och på händer och hals.", re: /sol(skydd|kräm)|\bspf\b/i },
  { key: "somn", group: "life", brief: "Ett konkret tips om sömn eller kvällen.", re: /sömn|\bsova\b|\bsover\b|kudde|lägger dig|kvällen|lamporna/i },
  { key: "vatten", group: "life", brief: "Ett konkret tips om att dricka vatten eller om fukt i huden.", re: /\bvatten\b|ljummet/i },
  { key: "mat", group: "life", brief: "Ett konkret tips om mat, till exempel protein i varje måltid eller C-vitamin.", re: /protein|måltid|frukost|grönsaker/i },
  { key: "rorelse", group: "life", brief: "Rörelse: promenaden, att lyfta tungt, att trappan räknas.", re: /promenad|styrk|lyfta|träning|trappan/i },
  { key: "egentid", group: "life", brief: "Att ta en stund för sig själv utan dåligt samvete.", re: /ta plats|unna|förtjän|prioriter|samvete|egen stund|din stund|ingen ursäkt|sätter andra/i },
  { key: "vanner", group: "life", brief: "Vänner, skratt och sällskap.", re: /skratt|vänner|väninn|sällskap/i },
  { key: "hosten", group: "life", brief: "Hösten: mörkare kvällar, torrare luft och huden som märker det.", re: /höst|mörka kvällar|mörknar|torr luft|torkar ut|oktober|november/i },
  { key: "sjalvkansla", group: "life", brief: "Självkänsla: att trivas i sin hud och slippa jaga yngre.", re: /yngre|trivs|självkänsla|som du är/i },
  { key: "alder", group: "life", brief: "Att bli äldre på egna villkor (sägs om läsaren, aldrig om kvinnan på bilden).", re: /efter 50|50\+|femtio|åldras|ålder|äldre/i },
];

const topicOf = (key: string) => TOPICS.find((t) => t.key === key)!;
const body = (c: string) => c.replace(/(\s*#\S+)+\s*$/, "");

/** Topics already present in these captions. */
export function topicsIn(captions: string[]): Set<string> {
  const used = new Set<string>();
  for (const c of captions) for (const t of TOPICS) if (t.re.test(body(c))) used.add(t.key);
  return used;
}

/**
 * Pick a topic none of the neighbours use. Product images lean on product
 * topics and person images on life topics, but both draw from both.
 */
export function pickTopic(kind: string, neighbours: string[], avoid: Set<string> = new Set()): Topic {
  const used = topicsIn(neighbours);
  const free = TOPICS.filter((t) => !used.has(t.key) && !avoid.has(t.key));
  const pool = free.length ? free : TOPICS.filter((t) => !avoid.has(t.key));
  const prefer = kind === "product" ? "product" : "life";
  const weighted = pool.flatMap((t) => (t.group === prefer ? [t, t] : [t]));
  return weighted[Math.floor(Math.random() * weighted.length)];
}

/** Topics of `caption` that a neighbour already has (other than the one it was asked to write about). */
export function clashes(caption: string, chosen: string, neighbours: string[]): string[] {
  const used = topicsIn(neighbours);
  return TOPICS.filter((t) => t.key !== chosen && used.has(t.key) && t.re.test(body(caption))).map((t) => t.key);
}

export { topicOf };
