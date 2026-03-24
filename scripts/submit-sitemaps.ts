#!/usr/bin/env npx tsx
/**
 * Submit sitemaps to Google Search Console for all configured properties.
 * Usage: npx tsx scripts/submit-sitemaps.ts
 */
import * as fs from "fs";
import * as path from "path";

// Load .env.local manually (handles quoted values)
const envPath = path.join(__dirname, "..", ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=][^=]*)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let val = match[2].trim();
    // Strip surrounding double quotes
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

import { submitSitemap, listSitemaps } from "../src/lib/gsc";

const PROPERTIES = [
  { property: "https://halsobladet.com/", sitemap: "https://halsobladet.com/sitemap.xml" },
  { property: "https://smarthelse.dk/", sitemap: "https://smarthelse.dk/sitemap.xml" },
  { property: "https://helseguiden.com/", sitemap: "https://helseguiden.com/sitemap.xml" },
];

async function main() {
  for (const { property, sitemap } of PROPERTIES) {
    console.log(`Submitting ${sitemap} to GSC property ${property}...`);
    const result = await submitSitemap(property, sitemap);
    if (result.ok) {
      console.log(`  Submitted successfully`);
    } else {
      console.error(`  Error: ${result.error}`);
    }
  }

  console.log("\nListing sitemaps...");
  for (const { property } of PROPERTIES) {
    const sitemaps = await listSitemaps(property);
    console.log(`  ${property}:`, sitemaps.length > 0 ? sitemaps : "none");
  }
}

main();
