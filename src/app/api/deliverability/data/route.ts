import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const DOMAINS = [
  "get-renew.com",
  "swedishbalance.se",
  "swedishbalance.org",
  "doginwork.com",
];

export async function GET() {
  const db = createServerSupabase();

  // Pull last 30 days of traffic stats for all domains
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sinceDate = thirtyDaysAgo.toISOString().split("T")[0];

  const { data: trafficRows } = await db
    .from("postmaster_traffic_stats")
    .select(
      "domain, date, domain_reputation, user_reported_spam_ratio, dkim_success_ratio, spf_success_ratio, dmarc_success_ratio, ip_reputations, delivery_errors, spammy_feedback_loops"
    )
    .gte("date", sinceDate)
    .order("date", { ascending: false });

  // Group by domain
  const postmasterByDomain: Record<string, unknown[]> = {};
  for (const domain of DOMAINS) postmasterByDomain[domain] = [];
  for (const row of trafficRows ?? []) {
    postmasterByDomain[row.domain]?.push(row);
  }

  // Pull DMARC reports (last 30 days)
  const { data: dmarcRows } = await db
    .from("dmarc_reports")
    .select(
      "id, postmark_report_id, domain, organization_name, date_range_begin, date_range_end, total_messages, dkim_pass, spf_pass, dmarc_pass, dmarc_fail, unique_source_ips, records, policy_published"
    )
    .gte("date_range_begin", thirtyDaysAgo.toISOString())
    .order("date_range_begin", { ascending: false });

  // Pull last sync log
  const { data: lastSync } = await db
    .from("deliverability_sync_log")
    .select("*")
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    postmaster: postmasterByDomain,
    dmarc: dmarcRows ?? [],
    last_sync: lastSync,
  });
}
