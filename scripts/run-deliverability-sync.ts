/**
 * Run the deliverability sync locally (bypasses the Next.js route).
 * Directly imports and executes the same logic as the cron.
 */
import * as fs from "fs";

// Manual .env.local loader (supports multi-line values with backslash continuation)
const envPath = ".env.local";
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, "utf8");
  const lines = raw.split("\n");
  let currentKey: string | null = null;
  let currentValue = "";
  let inQuote: '"' | "'" | null = null;

  const commit = () => {
    if (currentKey) {
      process.env[currentKey] = currentValue;
      currentKey = null;
      currentValue = "";
      inQuote = null;
    }
  };

  for (const line of lines) {
    if (inQuote) {
      // Continue multi-line value
      const endIdx = line.indexOf(inQuote);
      if (endIdx === -1) {
        currentValue += "\n" + line;
      } else {
        currentValue += "\n" + line.slice(0, endIdx);
        commit();
      }
      continue;
    }
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if (val.startsWith('"') || val.startsWith("'")) {
      const q = val[0] as '"' | "'";
      val = val.slice(1);
      const endIdx = val.indexOf(q);
      if (endIdx === -1) {
        // Multi-line - will continue
        currentKey = key;
        currentValue = val;
        inQuote = q;
        continue;
      }
      val = val.slice(0, endIdx);
    }
    process.env[key] = val;
  }
  commit();
}

import { createClient } from "@supabase/supabase-js";
import {
  listDomains,
  listTrafficStats,
  extractDate,
  extractDomain,
} from "../src/lib/postmaster";
import {
  listReports,
  getReport,
} from "../src/lib/postmark-dmarc";

const DOMAINS_TO_TRACK = [
  "get-renew.com",
  "swedishbalance.se",
  "swedishbalance.org",
  "doginwork.com",
];

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log("=== Postmaster Tools sync ===");
  const available = await listDomains();
  const availableNames = new Set(available.map((d) => extractDomain(d.name)));
  console.log(`Delegated: ${[...availableNames].join(", ")}`);

  let totalDays = 0;
  for (const domain of DOMAINS_TO_TRACK) {
    if (!availableNames.has(domain)) {
      console.log(`  ${domain}: NOT DELEGATED`);
      continue;
    }
    const stats = await listTrafficStats(domain, 30);
    console.log(`  ${domain}: ${stats.length} days`);
    for (const stat of stats) {
      const date = extractDate(stat.name);
      if (!date) continue;

      const { error } = await db.from("postmaster_traffic_stats").upsert(
        {
          domain,
          date,
          domain_reputation: stat.domainReputation ?? null,
          user_reported_spam_ratio: stat.userReportedSpamRatio ?? null,
          dkim_success_ratio: stat.dkimSuccessRatio ?? null,
          spf_success_ratio: stat.spfSuccessRatio ?? null,
          dmarc_success_ratio: stat.dmarcSuccessRatio ?? null,
          outbound_encryption_ratio: stat.outboundEncryptionRatio ?? null,
          inbound_encryption_ratio: stat.inboundEncryptionRatio ?? null,
          ip_reputations: stat.ipReputations ?? null,
          delivery_errors: stat.deliveryErrors ?? null,
          spammy_feedback_loops: stat.spammyFeedbackLoops ?? null,
          raw: stat,
        },
        { onConflict: "domain,date" }
      );
      if (error) {
        console.error(`    upsert error:`, error);
      } else {
        totalDays += 1;
      }
    }
  }
  console.log(`Total days upserted: ${totalDays}`);

  console.log("\n=== Postmark DMARC sync ===");
  const { entries } = await listReports(100);
  console.log(`Reports in Postmark: ${entries.length}`);
  let reportsFetched = 0;
  for (const summary of entries) {
    const { data: existing } = await db
      .from("dmarc_reports")
      .select("id")
      .eq("postmark_report_id", summary.id)
      .maybeSingle();
    if (existing) {
      console.log(`  [${summary.id}] already stored`);
      continue;
    }
    const full = await getReport(summary.id);
    let totalMessages = 0;
    let dkimPass = 0;
    let spfPass = 0;
    let dmarcPass = 0;
    let dmarcFail = 0;
    const ips = new Set<string>();
    for (const rec of full.records ?? []) {
      const count = rec.count ?? 0;
      totalMessages += count;
      ips.add(rec.source_ip);
      if (rec.policy_evaluated.dkim === "pass") dkimPass += count;
      if (rec.policy_evaluated.spf === "pass") spfPass += count;
      const passed =
        rec.policy_evaluated.dkim === "pass" ||
        rec.policy_evaluated.spf === "pass";
      if (passed) dmarcPass += count;
      else dmarcFail += count;
    }
    await db.from("dmarc_reports").insert({
      postmark_report_id: summary.id,
      domain: full.domain,
      organization_name: full.organization_name,
      date_range_begin: full.date_range_begin,
      date_range_end: full.date_range_end,
      policy_published: full.policy_published ?? null,
      records: full.records ?? [],
      total_messages: totalMessages,
      dkim_pass: dkimPass,
      spf_pass: spfPass,
      dmarc_pass: dmarcPass,
      dmarc_fail: dmarcFail,
      unique_source_ips: ips.size,
    });
    reportsFetched += 1;
  }
  console.log(`New reports stored: ${reportsFetched}`);

  await db.from("deliverability_sync_log").insert({
    postmaster_ok: true,
    postmaster_domains_synced: availableNames.size,
    postmaster_days_fetched: totalDays,
    dmarc_ok: true,
    dmarc_reports_fetched: reportsFetched,
    errors: null,
  });
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
