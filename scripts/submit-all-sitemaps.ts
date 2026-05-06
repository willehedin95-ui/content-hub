/**
 * Manual sitemap submit to GSC for all configured workspaces.
 * One-shot used after the trailing-slash canonical fix to force Google to
 * re-fetch sitemaps with the new URL form.
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

  const submissions = [
    { property: "https://halsobladet.com/", sitemap: "https://halsobladet.com/sitemap.xml" },
    { property: "https://smarthelse.dk/", sitemap: "https://smarthelse.dk/sitemap.xml" },
    { property: "https://helseguiden.com/", sitemap: "https://helseguiden.com/sitemap.xml" },
    { property: "sc-domain:get-renew.com", sitemap: "https://get-renew.com/sitemap.xml" },
  ];

  for (const s of submissions) {
    try {
      await sc.sitemaps.submit({ siteUrl: s.property, feedpath: s.sitemap });
      console.log(`✓ ${s.property} → ${s.sitemap}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`✗ ${s.property}  ${msg.slice(0, 100)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
