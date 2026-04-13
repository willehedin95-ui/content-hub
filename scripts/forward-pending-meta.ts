#!/usr/bin/env npx tsx
/**
 * Forward pending Meta receipt logs to Juni.
 *
 * Usage: npx tsx scripts/forward-pending-meta.ts
 *
 * Finds all Meta invoice logs with status "pending", downloads the email
 * from IMAP, generates PDF from HTML body, stores in Supabase, and forwards to Juni.
 */

import * as fs from "fs";
import * as path from "path";

// Set NODE_ENV for local execution (htmlToPdf uses local Chrome in dev mode)
(process.env as Record<string, string>).NODE_ENV = "development";

// Load .env.local manually (no dotenv dependency)
const envPath = path.join(__dirname, "..", ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=][^=]*)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const val = match[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

import { createClient } from "@supabase/supabase-js";

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const db = createClient(supabaseUrl, supabaseKey);

  // Find all pending Meta receipt logs
  const META_SERVICE_ID = "1be045a3-3588-4812-9984-db47e30eae07";

  const { data: logs, error } = await db
    .from("invoice_logs")
    .select("id, period, status, email_subject, email_uid, imap_account_id, pdf_storage_path")
    .eq("service_id", META_SERVICE_ID)
    .eq("status", "pending")
    .order("email_date", { ascending: true });

  if (error) {
    console.error("Failed to fetch logs:", error.message);
    process.exit(1);
  }

  if (!logs || logs.length === 0) {
    console.log("No pending Meta receipt logs found.");
    process.exit(0);
  }

  console.log(`Found ${logs.length} pending Meta receipt logs:`);
  for (const log of logs) {
    console.log(`  - ${log.id.slice(0, 8)}: ${log.period} | ${log.email_subject}`);
  }

  // Import forwardLogToJuni
  const { forwardLogToJuni } = await import("../src/lib/invoice-mail");

  let sent = 0;
  let errors = 0;

  for (const log of logs) {
    const shortId = log.id.slice(0, 8);
    console.log(`\n${shortId}: Forwarding "${log.email_subject}"...`);

    try {
      const result = await forwardLogToJuni(log.id);
      if (result.success) {
        console.log(`${shortId}: SENT to Juni`);
        sent++;
      } else {
        console.error(`${shortId}: FAILED - ${result.error}`);
        errors++;
      }
    } catch (e) {
      console.error(`${shortId}: ERROR - ${e instanceof Error ? e.message : e}`);
      errors++;
    }
  }

  console.log(`\nDone: ${sent} sent, ${errors} errors`);
  process.exit(errors > 0 ? 1 : 0);
}

main();
