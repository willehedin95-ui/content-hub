/**
 * One-shot manual sitemap submit for Shopify-published Hydro13 articles.
 * Submits https://get-renew.com/sitemap.xml to GSC under sc-domain:get-renew.com.
 *
 * Use this once after deploying the auto-submit fix; subsequent publishes
 * will trigger the submit automatically.
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

async function main() {
  const auth = new google.auth.JWT({
    email: process.env.GDRIVE_SERVICE_ACCOUNT_EMAIL!,
    key: process.env.GDRIVE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/webmasters"],
  });
  const sc = google.searchconsole({ version: "v1", auth });

  const property = "sc-domain:get-renew.com";
  const sitemapUrl = "https://get-renew.com/sitemap.xml";

  console.log(`Submitting ${sitemapUrl} to ${property}...`);
  await sc.sitemaps.submit({ siteUrl: property, feedpath: sitemapUrl });
  console.log("✓ Submitted");

  console.log("\nListing sitemaps for property:");
  const listed = await sc.sitemaps.list({ siteUrl: property });
  for (const s of listed.data.sitemap ?? []) {
    console.log(`  ${s.path}  lastSubmitted=${s.lastSubmitted}  pending=${s.isPending}`);
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
