// One-off smoke test: publish a placeholder page from the `pages` table to the
// `doginwork-pages` Cloudflare Pages project (custom domain pages.doginwork.se).
//
// TODO: Remove after sales page Chunk 2 lands (valpkurs.deploy via real lib function)
//
// Verifies the new options.projectName + options.domain overrides in
// publishPage() route correctly to a per-workspace CF project. Run with:
//   npx tsx scripts/smoke-publish-doginwork.ts
//
// Loads .env.local manually (matches recover-halsobladet.ts pattern - no
// dotenv dep in this project; Next.js loads env automatically at runtime but
// scripts need to do it themselves).
//
// Reads the page row by id, pulls workspace.settings.lp_publish for project +
// domain, then calls publishPage with explicit overrides. Existing legacy
// callsites (omitting options) are unaffected by this change.

import fs from "fs";
import path from "path";

const envPath = path.join(__dirname, "..", ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=][^=]*)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const val = match[2].trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "");
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

const PAGE_ID = process.env.PAGE_ID || "b76c8144-4837-4b87-b3be-dc37887c6867";

async function main() {
  // Dynamic imports so env vars are loaded before modules that read them at import-time.
  const { createServerSupabase } = await import("../src/lib/supabase-admin");
  const { publishPage } = await import("../src/lib/cloudflare-pages");

  console.log(`[smoke] page_id = ${PAGE_ID}`);
  const db = createServerSupabase();

  const { data: page, error: pageErr } = await db
    .from("pages")
    .select("id, slug, workspace_id, original_html, source_language")
    .eq("id", PAGE_ID)
    .single();
  if (pageErr || !page) {
    throw new Error(`Failed to load page: ${pageErr?.message ?? "not found"}`);
  }
  console.log(`[smoke] loaded page slug=${page.slug} workspace=${page.workspace_id}`);

  const { data: ws, error: wsErr } = await db
    .from("workspaces")
    .select("settings")
    .eq("id", page.workspace_id)
    .single();
  if (wsErr || !ws) {
    throw new Error(`Failed to load workspace: ${wsErr?.message ?? "not found"}`);
  }

  const lp = (ws.settings as { lp_publish?: { project?: string; domain?: string } })
    ?.lp_publish;
  if (!lp?.project || !lp?.domain) {
    throw new Error(
      `workspace.settings.lp_publish.{project,domain} not configured`,
    );
  }
  console.log(`[smoke] target project=${lp.project} domain=${lp.domain}`);

  if (!page.original_html) {
    throw new Error(
      `page.original_html is null for id=${PAGE_ID} - cannot smoke-publish an empty page`,
    );
  }

  const result = await publishPage(
    page.original_html,
    page.slug,
    (page.source_language as "sv") ?? "sv",
    undefined,
    undefined,
    undefined,
    undefined,
    { projectName: lp.project, domain: lp.domain },
  );
  console.log("[smoke] deploy result:", JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("[smoke] failed:", err);
  process.exit(1);
});
