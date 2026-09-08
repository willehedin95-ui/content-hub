/**
 * One-off: deploy a neutral holding page to the expertpanelen CF Pages
 * project THROUGH the per-workspace override path (runWithCfProjectOverride),
 * so the override is proven against the real publishPage() before the test
 * page is built. Reads the workspace settings from Supabase like the publish
 * route does. Run: npx tsx scripts/expertpanelen-holding-page.ts
 */
process.loadEnvFile?.(".env.local");

async function main() {
  const { publishPage, runWithCfProjectOverride, cfOverrideFromWorkspaceSettings, getProjectName, getProjectCustomDomain } =
    await import("../src/lib/cloudflare-pages");
  const { createServerSupabase } = await import("../src/lib/supabase-admin");
  const db = createServerSupabase();
  const { data: ws, error } = await db.from("workspaces").select("id, settings").eq("slug", "expertpanelen").single();
  if (error || !ws) throw new Error(`workspace lookup failed: ${error?.message}`);
  const override = cfOverrideFromWorkspaceSettings(ws.settings as Record<string, unknown>);
  if (!override) throw new Error("expertpanelen workspace has no cf_pages_project_by_language");

  const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Expertpanelen</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#fbfbf9;color:#1a1a1a}main{text-align:center;padding:2rem}h1{font-size:2rem;margin:0 0 .5rem;letter-spacing:-.02em}p{margin:0;color:#555}</style></head><body><main><h1>Expertpanelen</h1><p>Vi öppnar snart.</p></main></body></html>`;

  await runWithCfProjectOverride(override, async () => {
    console.log("resolved project:", getProjectName("sv"), "domain:", getProjectCustomDomain("sv"));
    // Root path: publishPage writes /<slug>/index.html, so an empty slug lands on /index.html
    const result = await publishPage(html, "", "sv");
    console.log("deploy:", result);
  });
  console.log("outside scope project:", getProjectName("sv"));
}
main().catch((e) => { console.error(e); process.exit(1); });
