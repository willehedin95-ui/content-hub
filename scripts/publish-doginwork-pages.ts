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

  // Manual upsert: select-then-update/insert. Pages-tabellen saknar unique
  // constraint pa (workspace_id, slug) och har faktiska duplicates (3 rader
  // pa slug=valps-vanligaste-beteendeproblem 2026-05-08), sa onConflict skulle
  // krascha med PostgREST 42P10. Manuell lookup ar dessutom defensiv mot fler
  // duplicates som kan uppsta innan dedup-migrationen kors.
  const { data: existing, error: lookupErr } = await supabase
    .from("pages")
    .select("id")
    .eq("workspace_id", WORKSPACE_ID)
    .eq("slug", SLUG)
    .limit(1)
    .maybeSingle();
  if (lookupErr) {
    throw new Error(`Pages lookup failed: ${lookupErr.message}`);
  }

  // Required (NOT NULL) columns per pages-schema: name, product, page_type,
  // source_url, original_html, slug, source_language, status, content_type.
  const pageRow = {
    workspace_id: WORKSPACE_ID,
    slug: SLUG,
    name: "Valpakademin Sales Page",
    product: "valpakademin",
    page_type: "advertorial",
    source_url: "internal://sales-page",
    original_html: html,
    source_language: LANGUAGE,
    status: "ready",
  };

  let pageId: string;
  if (existing) {
    const { data: updated, error: updateErr } = await supabase
      .from("pages")
      .update(pageRow)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (updateErr || !updated) {
      throw new Error(`Pages update failed: ${updateErr?.message ?? "no row"}`);
    }
    pageId = updated.id;
    console.log(`[publish] Updated existing page id=${pageId}`);
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from("pages")
      .insert(pageRow)
      .select("id")
      .single();
    if (insertErr || !inserted) {
      throw new Error(`Pages insert failed: ${insertErr?.message ?? "no row"}`);
    }
    pageId = inserted.id;
    console.log(`[publish] Inserted new page id=${pageId}`);
  }

  if (process.env.DRY_RUN === "true") {
    console.log(`[publish] DRY_RUN=true - skipping publishPage() call. Page row OK.`);
    return;
  }

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
