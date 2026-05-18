/**
 * Manually trigger blog autopilot for a workspace+language with force=true
 * (bypasses max-per-day rate limit). Useful for ad-hoc publishing without
 * waiting for the next scheduled cron.
 *
 * Usage: npx tsx scripts/trigger-blog-autopilot.ts <workspace> <lang>
 *   workspace: "happysleep" | "hydro13" | "doginwork"
 *   lang: "sv" | "da" | "no"
 *
 * Example: npx tsx scripts/trigger-blog-autopilot.ts hydro13 sv
 */
import fs from "fs";
import path from "path";

const envPath = path.join(__dirname, "..", ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  let value = trimmed.slice(eqIdx + 1);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = value;
}

const WORKSPACE_IDS: Record<string, string> = {
  happysleep: "c40221e2-96fb-4774-92db-74ec0227b262",
  hydro13: "6a18a542-4e8a-4d51-bc56-afd49fd1d9b7",
  doginwork: "0150243c-c33c-40d9-a780-dc41291d18f9",
};

async function main() {
  const workspace = process.argv[2];
  const lang = (process.argv[3] || "sv") as "sv" | "da" | "no";

  if (!workspace || !WORKSPACE_IDS[workspace]) {
    console.error("Usage: npx tsx scripts/trigger-blog-autopilot.ts <happysleep|hydro13|doginwork> <sv|da|no>");
    process.exit(1);
  }

  const { runBlogAutopilot } = await import("../src/lib/blog-autopilot");
  console.log(`[trigger] Running blog autopilot for ${workspace}/${lang} (force=true)...\n`);
  const start = Date.now();
  const result = await runBlogAutopilot(WORKSPACE_IDS[workspace], lang, { force: true });
  console.log(`\n[trigger] Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("[trigger] Fatal error:", err);
  process.exit(1);
});
