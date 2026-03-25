/**
 * One-time DataForSEO keyword research for Danish and Norwegian blog content plans.
 * Discovers best keywords per market, maps to SV topic areas, outputs content plan entries.
 *
 * Usage: npx tsx scripts/research-blog-keywords.ts
 * Cost: ~$0.20 (4 API calls)
 */

import * as fs from "fs";
import * as path from "path";

// Load .env.local manually (no dotenv dependency)
const envPath = path.join(__dirname, "..", ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const val = match[2].trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

// Inline DataForSEO client (avoid import issues with Next.js modules)
const LOCATION_CODES: Record<string, number> = { SE: 2752, NO: 2578, DK: 2208 };
const LANGUAGE_CODES: Record<string, string> = { SE: "sv", NO: "no", DK: "da" };

function getAuth(): string {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error("Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in .env.local");
  return Buffer.from(`${login}:${password}`).toString("base64");
}

interface KeywordResult {
  keyword: string;
  searchVolume: number | null;
  competition: string | null;
  competitionIndex: number | null;
  cpc: number | null;
}

async function dfsPost(endpoint: string, body: unknown[]): Promise<any> {
  const res = await fetch(`https://api.dataforseo.com/v3${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Basic ${getAuth()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`DataForSEO error (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  if (data.status_code !== 20000) throw new Error(`DataForSEO API error: ${data.status_message}`);
  return data;
}

async function getKeywordSuggestions(seeds: string[], market: "SE" | "NO" | "DK"): Promise<KeywordResult[]> {
  const data = await dfsPost("/keywords_data/google_ads/keywords_for_keywords/live", [{
    keywords: seeds.slice(0, 20),
    location_code: LOCATION_CODES[market],
    language_code: LANGUAGE_CODES[market],
    sort_by: "search_volume",
  }]);
  const task = data.tasks?.[0];
  if (!task || task.status_code !== 20000) throw new Error(`Task error: ${task?.status_message}`);
  console.log(`  Cost: $${data.cost.toFixed(4)}`);
  return (task.result ?? []).map((r: any) => ({
    keyword: r.keyword,
    searchVolume: r.search_volume,
    competition: r.competition,
    competitionIndex: r.competition_index,
    cpc: r.cpc,
  }));
}

// The 10 SV topic areas we want to find DA/NO equivalents for
const TOPIC_AREAS = [
  { id: "best-pillow", svSlug: "basta-kudden", template: "listicle", category: "best-test", patterns: /pude|pute|kudde|pillow|bedst|best/i },
  { id: "side-sleeper", svSlug: "kudde-for-sidosovare", template: "buying-guide", category: "guides", patterns: /sidesover|sidesov|side.*pude|side.*pute/i },
  { id: "neck-pain", svSlug: "nacksmarta-pa-natten", template: "problem-solution", category: "problems", patterns: /nakke|nack|cervical|smerter.*nakke|vondt.*nakke/i },
  { id: "foam-vs-latex", svSlug: "minnesskum-vs-latex-kudde", template: "comparison", category: "comparison", patterns: /memory.?foam|minneskum|latex|skum/i },
  { id: "replace-pillow", svSlug: "hur-ofta-byta-kudde", template: "problem-solution", category: "care", patterns: /bytte|skifte|udskift|levetid|holdbarheds/i },
  { id: "wash-pillow", svSlug: "tvatta-kudde", template: "problem-solution", category: "care", patterns: /vask|vaske|rengør|ren.*pude|ren.*pute/i },
  { id: "sleep-health", svSlug: "somn-och-halsa", template: "science", category: "research", patterns: /søvn.*hels|søvn.*sundh|sov.*hels|søvn.*krop/i },
  { id: "sleep-positions", svSlug: "sovstallningar", template: "problem-solution", category: "sleep-better", patterns: /sovestilling|soveposisjon|ligge.*stil/i },
  { id: "stop-snoring", svSlug: "sluta-snarka", template: "listicle", category: "problems", patterns: /snork|snark|anti.*snork/i },
  { id: "ergonomic-pillow", svSlug: "ergonomisk-kudde-bast-i-test", template: "buying-guide", category: "best-test", patterns: /ergonom|nakke.*pude|nakke.*pute|cervical/i },
];

function classifyKeyword(kw: string): string | null {
  for (const topic of TOPIC_AREAS) {
    if (topic.patterns.test(kw)) return topic.id;
  }
  return null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  console.log("=== DataForSEO Keyword Research for DA/NO Blog ===\n");

  const markets: Array<{ code: "DK" | "NO"; lang: string; seeds: string[] }> = [
    {
      code: "DK",
      lang: "da",
      seeds: [
        "bedste pude", "pude til nakkesmerter", "memory foam pude",
        "søvn problemer", "bedste hovedpude", "pude sidesover",
        "ergonomisk pude", "snorken", "sovestilling", "vaske pude",
        "søvn og sundhed", "hvornår skifte pude",
      ],
    },
    {
      code: "NO",
      lang: "no",
      seeds: [
        "beste pute", "pute for nakkesmerter", "memory foam pute",
        "søvnproblemer", "beste hodepute", "pute sidesover",
        "ergonomisk pute", "snorking", "soveposisjon", "vaske pute",
        "søvn og helse", "når bytte pute",
      ],
    },
  ];

  for (const market of markets) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`  ${market.code} (${market.lang}) — Keyword Research`);
    console.log(`${"=".repeat(70)}\n`);

    console.log(`Fetching suggestions for ${market.code}...`);
    const suggestions = await getKeywordSuggestions(market.seeds, market.code);

    // Filter for relevant keywords with decent volume
    const relevant = suggestions
      .filter((s) => (s.searchVolume ?? 0) >= 50)
      .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0));

    console.log(`\nFound ${relevant.length} keywords with 50+ monthly searches\n`);

    // Group by topic area
    const grouped: Record<string, KeywordResult[]> = {};
    const unclassified: KeywordResult[] = [];

    for (const kw of relevant) {
      const topic = classifyKeyword(kw.keyword);
      if (topic) {
        if (!grouped[topic]) grouped[topic] = [];
        grouped[topic].push(kw);
      } else {
        unclassified.push(kw);
      }
    }

    // Print grouped results
    for (const topic of TOPIC_AREAS) {
      const kws = grouped[topic.id] ?? [];
      console.log(`\n--- ${topic.id} (SV: ${topic.svSlug}) ---`);
      if (kws.length === 0) {
        console.log("  No keywords found for this topic");
        continue;
      }
      for (const kw of kws.slice(0, 8)) {
        const comp = kw.competitionIndex !== null ? `CI:${kw.competitionIndex}` : "CI:?";
        const cpc = kw.cpc !== null ? `CPC:$${kw.cpc.toFixed(2)}` : "CPC:?";
        console.log(`  ${kw.searchVolume?.toString().padStart(6)} /mo  ${comp.padEnd(6)}  ${cpc.padEnd(10)}  "${kw.keyword}"`);
      }
      // Recommend primary keyword (highest volume with <60 competition)
      const best = kws.find((k) => (k.competitionIndex ?? 100) < 60) ?? kws[0];
      console.log(`  >>> RECOMMENDED PRIMARY: "${best.keyword}" (${best.searchVolume}/mo)`);
    }

    // Print top unclassified (potential new article ideas)
    console.log(`\n--- UNCLASSIFIED (potential new topics) ---`);
    for (const kw of unclassified.slice(0, 20)) {
      const comp = kw.competitionIndex !== null ? `CI:${kw.competitionIndex}` : "CI:?";
      console.log(`  ${kw.searchVolume?.toString().padStart(6)} /mo  ${comp.padEnd(6)}  "${kw.keyword}"`);
    }

    // Print ALL high-volume keywords (500+) for reference
    console.log(`\n--- ALL KEYWORDS WITH 500+ SEARCHES/MO ---`);
    const highVolume = relevant.filter((k) => (k.searchVolume ?? 0) >= 500);
    for (const kw of highVolume) {
      const topic = classifyKeyword(kw.keyword) ?? "???";
      const comp = kw.competitionIndex !== null ? `CI:${kw.competitionIndex}` : "CI:?";
      console.log(`  ${kw.searchVolume?.toString().padStart(6)} /mo  ${comp.padEnd(6)}  [${topic.padEnd(15)}]  "${kw.keyword}"`);
    }
  }

  console.log("\n\nDone! Use the recommended keywords above to build content plans.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
