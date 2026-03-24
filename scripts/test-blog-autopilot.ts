/**
 * Test script — run the blog autopilot locally (no Vercel timeout).
 * Usage: npx tsx scripts/test-blog-autopilot.ts
 */
import fs from "fs";
import path from "path";

// Load .env.local manually (Next.js doesn't install dotenv)
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

async function main() {
  // Dynamic import after env is loaded
  const { runBlogAutopilot } = await import("../src/lib/blog-autopilot");

  const HAPPYSLEEP_WORKSPACE_ID = "c40221e2-96fb-4774-92db-74ec0227b262";

  console.log("[test] Starting blog autopilot (force mode)...\n");
  const start = Date.now();

  const result = await runBlogAutopilot(HAPPYSLEEP_WORKSPACE_ID, "sv", { force: true });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n[test] Done in ${elapsed}s`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("[test] Fatal error:", err);
  process.exit(1);
});
