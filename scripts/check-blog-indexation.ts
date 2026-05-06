/**
 * Check GSC indexation status for all published blog articles.
 * Usage: npx tsx scripts/check-blog-indexation.ts [--limit N]
 */
import { google } from "googleapis";
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(__dirname, "../.env.local");
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  const k = t.slice(0, i);
  let v = t.slice(i + 1);
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/\\n/g, "\n");
  if (!process.env[k]) process.env[k] = v;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function sb(path: string): Promise<unknown> {
  const r = await fetch(`${supabaseUrl}/rest/v1${path}`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  });
  return r.json();
}

interface InspectResult {
  inspectionResult?: {
    indexStatusResult?: {
      verdict?: string;
      coverageState?: string;
      lastCrawlTime?: string;
      pageFetchState?: string;
      googleCanonical?: string;
      indexingState?: string;
    };
  };
}

async function main() {
  const limit = parseInt(process.argv.find(a => a.startsWith("--limit="))?.split("=")[1] ?? "0") || 0;

  const trans = (await sb(
    "/translations?select=published_url,language,page_id,seo_title,created_at&status=eq.published&published_url=not.is.null&order=created_at.desc&limit=500"
  )) as Array<{ published_url: string; language: string; page_id: string; seo_title: string; created_at: string }>;
  const pages = (await sb("/pages?select=id,workspace_id,slug&content_type=eq.seo_blog&limit=500")) as Array<{
    id: string;
    workspace_id: string;
    slug: string;
  }>;
  const pageMap = new Map(pages.map(p => [p.id, p]));
  const wsName: Record<string, string> = {
    "c40221e2-96fb-4774-92db-74ec0227b262": "happysleep",
    "6a18a542-4e8a-4d51-bc56-afd49fd1d9b7": "hydro13",
    "0150243c-c33c-40d9-a780-dc41291d18f9": "doginwork",
  };

  const articles = trans
    .map(t => {
      const p = pageMap.get(t.page_id);
      if (!p) return null;
      return {
        url: t.published_url,
        lang: t.language,
        ws: wsName[p.workspace_id] ?? "?",
        slug: p.slug,
        created: t.created_at.slice(0, 10),
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  console.log(`Inspecting ${articles.length} blog articles\n`);

  // Map URL to its GSC property
  const propertyFor: Record<string, string> = {
    "halsobladet.com": "https://halsobladet.com/",
    "smarthelse.dk": "https://smarthelse.dk/",
    "helseguiden.com": "https://helseguiden.com/",
    "get-renew.com": "sc-domain:get-renew.com",
    "doginwork.se": "sc-domain:doginwork.se",
    "quiz.doginwork.se": "sc-domain:doginwork.se",
  };

  const auth = new google.auth.JWT({
    email: process.env.GDRIVE_SERVICE_ACCOUNT_EMAIL!,
    key: process.env.GDRIVE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/webmasters"],
  });
  const sc = google.searchconsole({ version: "v1", auth });

  let processed = 0;
  const results: Array<{ url: string; ws: string; verdict: string; coverage: string; lastCrawl: string }> = [];

  const toProcess = limit ? articles.slice(0, limit) : articles;
  for (const a of toProcess) {
    const host = new URL(a.url).hostname.replace(/^www\./, "");
    const property = propertyFor[host];
    if (!property) {
      results.push({ url: a.url, ws: a.ws, verdict: "—", coverage: "no_property", lastCrawl: "" });
      continue;
    }

    try {
      const res = (await sc.urlInspection.index.inspect({
        requestBody: { inspectionUrl: a.url, siteUrl: property, languageCode: "sv-SE" },
      })) as { data: InspectResult };
      const r = res.data.inspectionResult?.indexStatusResult;
      results.push({
        url: a.url,
        ws: a.ws,
        verdict: r?.verdict ?? "?",
        coverage: r?.coverageState ?? "?",
        lastCrawl: (r?.lastCrawlTime ?? "").slice(0, 10),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "err";
      results.push({ url: a.url, ws: a.ws, verdict: "ERR", coverage: msg.slice(0, 50), lastCrawl: "" });
    }
    processed++;
    if (processed % 10 === 0) console.error(`  [${processed}/${toProcess.length}]`);

    // GSC URL Inspection rate limit: 600/min, so ~100ms gap is safe
    await new Promise(r => setTimeout(r, 200));
  }

  // Summary
  const byVerdict: Record<string, number> = {};
  const byWs: Record<string, Record<string, number>> = {};
  for (const r of results) {
    byVerdict[r.verdict] = (byVerdict[r.verdict] ?? 0) + 1;
    byWs[r.ws] = byWs[r.ws] ?? {};
    byWs[r.ws][r.verdict] = (byWs[r.ws][r.verdict] ?? 0) + 1;
  }

  console.log("\n=== INDEXATION VERDICT ===");
  for (const [v, c] of Object.entries(byVerdict).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v}: ${c}`);
  }
  console.log("\n=== PER WORKSPACE ===");
  for (const [ws, counts] of Object.entries(byWs)) {
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    const parts = Object.entries(counts).map(([v, n]) => `${v}=${n}`).join(", ");
    console.log(`  ${ws} (${total}): ${parts}`);
  }

  console.log("\n=== PER ARTICLE ===");
  console.log(`${"WS".padEnd(11)} ${"VERDICT".padEnd(20)} ${"COVERAGE".padEnd(38)} ${"CRAWLED".padEnd(11)} URL`);
  for (const r of results) {
    console.log(
      `${r.ws.padEnd(11)} ${r.verdict.padEnd(20)} ${r.coverage.padEnd(38)} ${(r.lastCrawl || "—").padEnd(11)} ${r.url}`
    );
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
