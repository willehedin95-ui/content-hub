// Publishes the Valpakademin sales page to pages.doginwork.se/valpkurs via
// the existing publishPage pipeline. Two-step build flow:
//
//   1. Python builds the full HTML body to /tmp/sales-page-body.html
//        cd doginwork/scripts && python3 sales_page_html_body.py /tmp/sales-page-body.html
//
//   2. This TS script reads the file, upserts the pages-row, then calls
//      publishPage() with workspace.settings.lp_publish.{project,domain}
//      so we hit the doginwork-pages CF project (not the SV default).
//
// Avoids exec/execSync per content-hub security hook - we read the Python
// output as a plain file.
//
// Usage (from worktree root):
//   npx --yes -p dotenv-cli@7 dotenv -e .env.local -- \
//     npx --yes tsx scripts/publish-doginwork-pages.ts [slug] [html-file]
//
// Defaults: slug=valpkurs, html-file=/tmp/sales-page-body.html

import { existsSync, readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

import { publishPage } from "../src/lib/cloudflare-pages";

const WORKSPACE_ID = "0150243c-c33c-40d9-a780-dc41291d18f9";
const SLUG = process.argv[2] ?? "valpkurs";
const HTML_FILE = process.argv[3] ?? "/tmp/sales-page-body.html";
const LANGUAGE = "sv" as const;

async function main() {
  if (!existsSync(HTML_FILE)) {
    throw new Error(
      `HTML file not found: ${HTML_FILE}\n` +
      `Build first:\n` +
      `  cd doginwork/scripts && python3 sales_page_html_body.py ${HTML_FILE}`,
    );
  }
  const html = readFileSync(HTML_FILE, "utf-8");
  if (html.length < 5000) {
    throw new Error(
      `HTML file too small (${html.length} bytes) - likely incomplete build. ` +
      `Expected at least 5 000 bytes for a full sales page.`,
    );
  }
  console.log(`[publish] Read ${html.length} bytes from ${HTML_FILE}`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars. " +
      "Did you run with `dotenv -e .env.local`?",
    );
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  // Fetch workspace settings to get the CF project + custom domain. Chunk 1
  // populated workspace.settings.lp_publish for doginwork.
  const { data: workspace, error: wsErr } = await supabase
    .from("workspaces")
    .select("settings")
    .eq("id", WORKSPACE_ID)
    .single();
  if (wsErr || !workspace) {
    throw new Error(`Workspace fetch failed: ${wsErr?.message ?? "no row"}`);
  }
  const lp = (workspace.settings as { lp_publish?: { project?: string; domain?: string } } | null)?.lp_publish;
  if (!lp?.project || !lp?.domain) {
    throw new Error(
      "workspace.settings.lp_publish missing project or domain (set in Chunk 1)",
    );
  }
  console.log(`[publish] Target project=${lp.project} domain=${lp.domain}`);

  // Upsert the page row so we have a DB record matching what's deployed.
  const { data: page, error: upsertErr } = await supabase
    .from("pages")
    .upsert(
      {
        workspace_id: WORKSPACE_ID,
        slug: SLUG,
        product: "valpakademin",
        source_url: "internal://sales-page",
        original_html: html,
        source_language: LANGUAGE,
        status: "published",
      },
      { onConflict: "workspace_id,slug" },
    )
    .select()
    .single();
  if (upsertErr) {
    throw new Error(`Pages upsert failed: ${upsertErr.message}`);
  }
  console.log(`[publish] Upserted page id=${page.id}`);

  // publishPage signature (from chunk 1 update):
  //   (html, slug, language, additionalFiles?, onProgress?, analytics?, customCode?, options?)
  const result = await publishPage(
    html,
    SLUG,
    LANGUAGE,
    undefined, // additionalFiles
    undefined, // onProgress
    undefined, // analytics (pixel is inlined in head)
    undefined, // customCode
    { projectName: lp.project, domain: lp.domain },
  );

  console.log(`[publish] Done. URL: ${result.url ?? "(no url returned)"}`);
}

main().catch((err) => {
  console.error("Publish failed:", err);
  process.exit(1);
});
