/**
 * Postmark DMARC Digests API wrapper.
 *
 * Free aggregate DMARC report service. One domain per API token on free plan.
 * Currently configured for get-renew.com only; swedishbalance.se/.org and
 * doginwork.com use plain `p=none` without reporting (can add later).
 *
 * Docs: https://dmarc.postmarkapp.com/docs/
 * Token stored in POSTMARK_DMARC_API_TOKEN env var.
 */

const BASE_URL = "https://dmarc.postmarkapp.com";

function getToken(): string {
  const token = process.env.POSTMARK_DMARC_API_TOKEN?.trim();
  if (!token) throw new Error("POSTMARK_DMARC_API_TOKEN not set");
  return token;
}

export function isPostmarkDmarcConfigured(): boolean {
  return !!process.env.POSTMARK_DMARC_API_TOKEN;
}

async function request<T>(
  path: string,
  method: "GET" | "POST" = "GET"
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "X-Api-Token": getToken(),
      Accept: "application/json",
    },
    // Postmark is fast, no need for long timeout
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Postmark DMARC ${res.status} ${res.statusText}: ${body.slice(0, 200)}`
    );
  }
  return res.json() as Promise<T>;
}

export interface PostmarkDmarcRecord {
  domain: string;
  public_token: string;
  created_at: string;
  reporting_uri: string;
  email: string;
}

/** Verification status of the published DNS DMARC record */
export interface PostmarkVerifyResult {
  verified: boolean;
  host?: string;
  value?: string;
  dns_data?: string[];
}

/** Summary entry returned by /records/my/reports */
export interface PostmarkReportSummary {
  id: number;
  domain: string;
  date_range_begin: string;  // ISO
  date_range_end: string;    // ISO
  organization_name: string; // e.g. "google.com"
  email?: string;
  extra_contact_info?: string;
  report_id?: string;
  created_at: string;
}

/** Individual "record" inside a report - one per unique source IP */
export interface PostmarkReportRecord {
  source_ip: string;
  count: number;
  policy_evaluated: {
    disposition: "none" | "quarantine" | "reject";
    dkim: "pass" | "fail";
    spf: "pass" | "fail";
    reasons?: Array<{ type: string; comment?: string }>;
  };
  identifiers: {
    header_from: string;
    envelope_from?: string;
    envelope_to?: string;
  };
  auth_results: {
    dkim?: Array<{
      domain: string;
      selector?: string;
      result: "pass" | "fail" | "policy" | "neutral" | "temperror" | "permerror" | "none";
    }>;
    spf?: Array<{
      domain: string;
      scope?: "mfrom" | "helo";
      result: "pass" | "fail" | "neutral" | "softfail" | "temperror" | "permerror" | "none";
    }>;
  };
}

/** Full report payload returned by /reports/{id} */
export interface PostmarkReportDetail extends PostmarkReportSummary {
  records: PostmarkReportRecord[];
  policy_published?: {
    domain: string;
    adkim?: "r" | "s";
    aspf?: "r" | "s";
    p?: "none" | "quarantine" | "reject";
    sp?: "none" | "quarantine" | "reject";
    pct?: number;
  };
}

interface PaginatedResponse<T> {
  entries: T[];
  meta: {
    total: number;
    next: number | null;
    next_url: string | null;
  };
}

/** Get the DMARC record currently tracked by this API token */
export async function getMyRecord(): Promise<PostmarkDmarcRecord> {
  return request<PostmarkDmarcRecord>("/records/my");
}

/** Verify the DNS DMARC record is still published correctly (uses POST per Postmark API) */
export async function verifyMyRecord(): Promise<PostmarkVerifyResult> {
  return request<PostmarkVerifyResult>("/records/my/verify", "POST");
}

/**
 * List aggregate DMARC reports received for this domain.
 * Default: latest 50 reports.
 */
export async function listReports(
  limit = 50,
  after?: number
): Promise<PaginatedResponse<PostmarkReportSummary>> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (after !== undefined) params.set("after", String(after));
  return request<PaginatedResponse<PostmarkReportSummary>>(
    `/records/my/reports?${params.toString()}`
  );
}

/** Get full details of a specific report, including per-IP records */
export async function getReport(id: number): Promise<PostmarkReportDetail> {
  return request<PostmarkReportDetail>(`/reports/${id}`);
}

/**
 * Aggregate report stats across multiple reports into a single summary.
 * Useful for the dashboard card.
 */
export interface DmarcAggregateSummary {
  report_count: number;
  total_messages: number;
  dkim_pass: number;
  spf_pass: number;
  dmarc_pass: number;  // either dkim or spf aligned
  dkim_fail: number;
  spf_fail: number;
  dmarc_fail: number;
  unique_source_ips: number;
  by_organization: Record<string, number>;
  unknown_sources: Array<{
    source_ip: string;
    count: number;
    header_from: string;
    auth_results: PostmarkReportRecord["auth_results"];
  }>;
}

export function summarizeReports(
  reports: PostmarkReportDetail[],
  knownSourceDomains: string[] = [
    "shopifyemail.com",
    "_spf.shopify.com",
    "shops.shopify.com",
    "klaviyomail.com",
    "klaviyodns.com",
    "_spf.klaviyo.com",
    "freshemail.io",
    "hostinger.com",
    "postmarkapp.com",
  ]
): DmarcAggregateSummary {
  const summary: DmarcAggregateSummary = {
    report_count: reports.length,
    total_messages: 0,
    dkim_pass: 0,
    spf_pass: 0,
    dmarc_pass: 0,
    dkim_fail: 0,
    spf_fail: 0,
    dmarc_fail: 0,
    unique_source_ips: 0,
    by_organization: {},
    unknown_sources: [],
  };

  const seenIps = new Set<string>();

  for (const report of reports) {
    summary.by_organization[report.organization_name] =
      (summary.by_organization[report.organization_name] ?? 0) + 1;

    for (const record of report.records ?? []) {
      const count = record.count ?? 0;
      summary.total_messages += count;
      seenIps.add(record.source_ip);

      if (record.policy_evaluated.dkim === "pass") summary.dkim_pass += count;
      else summary.dkim_fail += count;

      if (record.policy_evaluated.spf === "pass") summary.spf_pass += count;
      else summary.spf_fail += count;

      const dmarcPass =
        record.policy_evaluated.dkim === "pass" ||
        record.policy_evaluated.spf === "pass";
      if (dmarcPass) summary.dmarc_pass += count;
      else summary.dmarc_fail += count;

      // Flag mail from sources that don't match any known domain
      const dkimDomains = (record.auth_results.dkim ?? []).map((d) => d.domain);
      const spfDomains = (record.auth_results.spf ?? []).map((s) => s.domain);
      const allDomains = [...dkimDomains, ...spfDomains];
      const isKnown = allDomains.some((d) =>
        knownSourceDomains.some((known) => d.includes(known))
      );

      if (!isKnown && !dmarcPass) {
        summary.unknown_sources.push({
          source_ip: record.source_ip,
          count,
          header_from: record.identifiers.header_from,
          auth_results: record.auth_results,
        });
      }
    }
  }

  summary.unique_source_ips = seenIps.size;
  return summary;
}
