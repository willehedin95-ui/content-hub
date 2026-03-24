#!/usr/bin/env npx tsx
/**
 * Deploy sitemap.xml + robots.txt to all 3 CF Pages projects.
 * Usage: npx tsx scripts/deploy-sitemaps.ts
 */
import * as fs from "fs";
import * as path from "path";

// Load .env.local manually
const envPath = path.join(__dirname, "..", ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=][^=]*)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const val = match[2].trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

import { deploySitemapAndRobots } from "../src/lib/cloudflare-pages";
import type { Language } from "../src/types";

async function main() {
  const languages: Language[] = ["sv", "da", "no"];

  for (const lang of languages) {
    console.log(`Deploying sitemap for ${lang}...`);
    try {
      const result = await deploySitemapAndRobots(lang);
      console.log(`  Done: ${result.sitemapUrl} (deploy: ${result.deploy_id})`);
    } catch (err) {
      console.error(`  Error [${lang}]:`, (err as Error).message);
    }
  }
}

main();
