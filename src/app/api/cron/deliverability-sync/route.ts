import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import {
  isPostmasterConfigured,
  listDomains,
  listTrafficStats,
  extractDate,
  extractDomain,
} from "@/lib/postmaster";
import {
  isPostmarkDmarcConfigured,
  listReports,
  getReport,
} from "@/lib/postmark-dmarc";

export const maxDuration = 120;

const DOMAINS_TO_TRACK = [
  "get-renew.com",
  "swedishbalance.se",
  "swedishbalance.org",
  "doginwork.com",
];

// Alert thresholds
const SPAM_RATE_WARNING = 0.003; // 0.3%
const SPAM_RATE_CRITICAL = 0.01; // 1.0%

async function sendTelegramAlert(message: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!botToken || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
      }),
    });
  } catch (err) {
    console.error("[deliverability-sync] Telegram send failed:", err);
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isManual = req.nextUrl.searchParams.get("manual") === "true";
  if (!isManual && (!cronSecret || authHeader !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerSupabase();
  const errors: Array<{ source: string; domain?: string; error: string }> = [];
  let postmasterOk = false;
  let postmasterDaysFetched = 0;
  let postmasterDomainsSynced = 0;
  let dmarcOk = false;
  let dmarcReportsFetched = 0;

  // --------------------------------------------------------------------------
  // 1. Pull Gmail Postmaster Tools traffic stats for all 4 domains
  // --------------------------------------------------------------------------
  if (isPostmasterConfigured()) {
    try {
      const available = await listDomains();
      const availableNames = new Set(available.map((d) => extractDomain(d.name)));

      for (const domain of DOMAINS_TO_TRACK) {
        if (!availableNames.has(domain)) {
          errors.push({
            source: "postmaster",
            domain,
            error: "Service account not delegated",
          });
          continue;
        }
        try {
          const stats = await listTrafficStats(domain, 30);
          postmasterDomainsSynced += 1;

          for (const stat of stats) {
            const date = extractDate(stat.name);
            if (!date) continue;

            await db
              .from("postmaster_traffic_stats")
              .upsert(
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
            postmasterDaysFetched += 1;
          }

          // Alert if most recent day exceeds spam threshold
          const latest = stats
            .slice()
            .sort((a, b) => (b.name > a.name ? 1 : -1))[0];
          if (latest?.userReportedSpamRatio != null) {
            const rate = latest.userReportedSpamRatio;
            if (rate >= SPAM_RATE_CRITICAL) {
              await sendTelegramAlert(
                `🚨 *CRITICAL spam rate: ${domain}*\n` +
                  `User-reported spam rate: ${(rate * 100).toFixed(3)}%\n` +
                  `(Gmail threshold: 0.3%. Above 1% risks delivery blocks.)`
              );
            } else if (rate >= SPAM_RATE_WARNING) {
              await sendTelegramAlert(
                `⚠️ *Spam rate warning: ${domain}*\n` +
                  `User-reported spam rate: ${(rate * 100).toFixed(3)}%\n` +
                  `(Gmail threshold: 0.3%. Investigate soon.)`
              );
            }
          }
        } catch (err) {
          errors.push({
            source: "postmaster",
            domain,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      postmasterOk = errors.filter((e) => e.source === "postmaster").length === 0;
    } catch (err) {
      errors.push({
        source: "postmaster",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // --------------------------------------------------------------------------
  // 2. Pull new Postmark DMARC aggregate reports (get-renew.com only)
  // --------------------------------------------------------------------------
  if (isPostmarkDmarcConfigured()) {
    try {
      const { entries } = await listReports(100);
      for (const summary of entries) {
        // Skip if already stored
        const { data: existing } = await db
          .from("dmarc_reports")
          .select("id")
          .eq("postmark_report_id", summary.id)
          .maybeSingle();
        if (existing) continue;

        try {
          const full = await getReport(summary.id);

          // Compute stats
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
          dmarcReportsFetched += 1;

          // Alert on misaligned mail
          if (dmarcFail > 0 && totalMessages > 0) {
            const failRatio = dmarcFail / totalMessages;
            if (failRatio >= 0.1) {
              await sendTelegramAlert(
                `⚠️ *DMARC alignment failures: ${full.domain}*\n` +
                  `${dmarcFail}/${totalMessages} messages (${(failRatio * 100).toFixed(1)}%) failed DMARC.\n` +
                  `Reporter: ${full.organization_name}\n` +
                  `Check /deliverability for details.`
              );
            }
          }
        } catch (err) {
          errors.push({
            source: "postmark-dmarc",
            error: `Report ${summary.id}: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }
      dmarcOk = errors.filter((e) => e.source === "postmark-dmarc").length === 0;
    } catch (err) {
      errors.push({
        source: "postmark-dmarc",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // --------------------------------------------------------------------------
  // 3. Log the run
  // --------------------------------------------------------------------------
  await db.from("deliverability_sync_log").insert({
    postmaster_ok: postmasterOk,
    postmaster_domains_synced: postmasterDomainsSynced,
    postmaster_days_fetched: postmasterDaysFetched,
    dmarc_ok: dmarcOk,
    dmarc_reports_fetched: dmarcReportsFetched,
    errors: errors.length > 0 ? errors : null,
  });

  return NextResponse.json({
    ok: errors.length === 0,
    postmaster: {
      ok: postmasterOk,
      domains_synced: postmasterDomainsSynced,
      days_fetched: postmasterDaysFetched,
    },
    dmarc: {
      ok: dmarcOk,
      reports_fetched: dmarcReportsFetched,
    },
    errors,
  });
}
