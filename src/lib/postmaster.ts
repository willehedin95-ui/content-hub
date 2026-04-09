import { google } from "googleapis";

/**
 * Google Postmaster Tools API wrapper.
 *
 * Requires the service account to be manually added as a user to each domain
 * in the Postmaster Tools UI (https://postmaster.google.com/managedomains).
 * IAM federation is not supported - must be done per-domain.
 *
 * Service account: claude-code-william@claude-code-william.iam.gserviceaccount.com
 * Scope: https://www.googleapis.com/auth/postmaster.readonly
 */

const postmaster = google.gmailpostmastertools("v1");

function getAuth() {
  const email = process.env.GDRIVE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GDRIVE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error("Postmaster: Google service account not configured");
  }
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/postmaster.readonly"],
  });
}

export function isPostmasterConfigured(): boolean {
  return !!(
    process.env.GDRIVE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GDRIVE_PRIVATE_KEY
  );
}

/** Reputation tier as reported by Gmail Postmaster Tools */
export type ReputationTier = "HIGH" | "MEDIUM" | "LOW" | "BAD" | "REPUTATION_CATEGORY_UNSPECIFIED";

export interface PostmasterDomain {
  name: string;           // e.g. "domains/get-renew.com"
  createTime?: string;
  permission: string;     // OWNER | READER | NONE
}

/** Raw traffic stats payload from the API */
export interface PostmasterTrafficStats {
  name: string;                           // domains/{domain}/trafficStats/YYYYMMDD
  userReportedSpamRatio?: number;         // 0.0 - 1.0
  ipReputations?: Array<{
    reputation: ReputationTier;
    ipCount?: string;                     // stringified int
    sampleIps?: string[];
  }>;
  domainReputation?: ReputationTier;
  dkimSuccessRatio?: number;
  spfSuccessRatio?: number;
  dmarcSuccessRatio?: number;
  outboundEncryptionRatio?: number;
  inboundEncryptionRatio?: number;
  deliveryErrors?: Array<{
    errorType: string;
    errorClass: string;
    errorRatio: number;
  }>;
  spammyFeedbackLoops?: Array<{
    id: string;
    spamRatio: number;
  }>;
}

/** List all domains the service account has access to in Postmaster Tools */
export async function listDomains(): Promise<PostmasterDomain[]> {
  const auth = getAuth();
  const res = await postmaster.domains.list({ auth });
  return (res.data.domains ?? []) as PostmasterDomain[];
}

/**
 * List daily traffic stats for a domain.
 *
 * @param domain - bare domain like "get-renew.com" (without "domains/" prefix)
 * @param days   - how many days of history to pull (default 30)
 */
export async function listTrafficStats(
  domain: string,
  days = 30
): Promise<PostmasterTrafficStats[]> {
  const auth = getAuth();
  const parent = `domains/${domain}`;

  // Gmail Postmaster Tools returns data with 2-day lag; request slightly more.
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 2);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);

  const toPostmasterDate = (d: Date) => ({
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  });

  try {
    const res = await postmaster.domains.trafficStats.list({
      auth,
      parent,
      "startDate.year": toPostmasterDate(startDate).year,
      "startDate.month": toPostmasterDate(startDate).month,
      "startDate.day": toPostmasterDate(startDate).day,
      "endDate.year": toPostmasterDate(endDate).year,
      "endDate.month": toPostmasterDate(endDate).month,
      "endDate.day": toPostmasterDate(endDate).day,
      pageSize: 100,
    });
    return (res.data.trafficStats ?? []) as PostmasterTrafficStats[];
  } catch (err) {
    // Postmaster Tools returns 404 "Requested entity was not found" when
    // a domain has no traffic stats yet (too low volume, or newly verified).
    // Treat as empty rather than an error.
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("Requested entity was not found") ||
      message.includes("404")
    ) {
      return [];
    }
    throw err;
  }
}

/** Extract YYYY-MM-DD date from a traffic stats resource name */
export function extractDate(trafficStatsName: string): string {
  // Format: domains/{domain}/trafficStats/YYYYMMDD
  const m = trafficStatsName.match(/trafficStats\/(\d{4})(\d{2})(\d{2})$/);
  if (!m) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Extract bare domain from a "domains/{domain}" resource name */
export function extractDomain(domainName: string): string {
  return domainName.replace(/^domains\//, "");
}

/** Quick connectivity test - lists domains and returns count */
export async function testPostmasterConnection(): Promise<{
  ok: boolean;
  domainCount?: number;
  error?: string;
}> {
  try {
    const domains = await listDomains();
    return { ok: true, domainCount: domains.length };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
