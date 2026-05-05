/**
 * One-off: trigger blog autopilot for doginwork workspace, language=sv.
 * Bypasses the cron auth + force-flag dance so we can fire it locally
 * with .env.local creds.
 *
 * Run: npx --yes -p dotenv-cli@7 dotenv -e .env.local -- npx tsx
 *      scripts/run-doginwork-autopilot.ts
 */
import { runBlogAutopilot, generateBlogImagesAndRepublish } from "../src/lib/blog-autopilot";

const WORKSPACE_ID = "0150243c-c33c-40d9-a780-dc41291d18f9";

async function main() {
  console.log(`[run-doginwork-autopilot] Triggering for workspace ${WORKSPACE_ID}, lang=sv, force=true`);
  const result = await runBlogAutopilot(WORKSPACE_ID, "sv", { force: true });
  console.log("\n=== Result ===");
  console.log("Action:", result.action);
  console.log("Message:", result.message);
  if (result.slug) console.log("Slug:", result.slug);
  if (result.url) console.log("URL:", result.url);
  if (result.imageJob) {
    console.log("\nGenerating blog images (background)...");
    await generateBlogImagesAndRepublish(result.imageJob);
    console.log("Image generation done.");
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
