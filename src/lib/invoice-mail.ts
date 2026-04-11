import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import Anthropic from "@anthropic-ai/sdk";
import dns from "dns";
import net from "net";
import { createServerSupabase } from "@/lib/supabase-admin";
import type { InvoiceService } from "@/types";

// Hardcoded fallback IPs for hosts that Vercel can't resolve via getaddrinfo.
// These are Cloudflare-fronted and stable.
const KNOWN_HOST_IPS: Record<string, string> = {
  "imap.hostinger.com": "172.65.188.64",
  "smtp.hostinger.com": "172.65.255.143",
};

/**
 * Resolve a hostname to an IP, bypassing Vercel's broken OS DNS resolver.
 * Strategy: 1) try Node dns.resolve4 with Google/Cloudflare DNS,
 * 2) fall back to hardcoded IPs for known hosts, 3) use hostname as-is.
 */
async function resolveHost(hostname: string): Promise<{ ip: string; servername: string | false }> {
  hostname = hostname.trim();
  if (net.isIP(hostname)) {
    return { ip: hostname, servername: false };
  }

  // Try Node's DNS resolver (uses UDP to external DNS, not OS getaddrinfo)
  try {
    const resolver = new dns.promises.Resolver({ timeout: 3000, tries: 1 });
    resolver.setServers(["8.8.8.8", "1.1.1.1"]);
    const addresses = await resolver.resolve4(hostname);
    if (addresses.length > 0) {
      console.log(`[dns] Resolved ${hostname} -> ${addresses[0]}`);
      return { ip: addresses[0], servername: hostname };
    }
  } catch (e) {
    console.warn(`[dns] resolve4 failed for ${hostname}: ${e instanceof Error ? e.message : e}`);
  }

  // Fallback to hardcoded IPs for known hosts
  const fallback = KNOWN_HOST_IPS[hostname];
  if (fallback) {
    console.log(`[dns] Using hardcoded IP for ${hostname} -> ${fallback}`);
    return { ip: fallback, servername: hostname };
  }

  return { ip: hostname, servername: false };
}

// --- Types ---

interface PdfAttachment {
  filename: string;
  size: number;
  part: string; // BODYSTRUCTURE part id
}

interface InvoiceEmail {
  uid: number;
  from: string;
  subject: string;
  date: Date;
  pdfAttachments: PdfAttachment[];
}

interface ForwardResult {
  success: boolean;
  error?: string;
}

// --- Config ---

interface ImapAccountConfig {
  accountId: string;
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}

/** Get all configured IMAP accounts */
function getImapAccounts(): ImapAccountConfig[] {
  const accounts: ImapAccountConfig[] = [];

  // Primary: Hostinger
  const hostingerUser = process.env.INVOICE_IMAP_EMAIL?.trim();
  const hostingerPass = process.env.INVOICE_IMAP_PASSWORD?.trim();
  if (hostingerUser && hostingerPass) {
    accounts.push({
      accountId: "hostinger",
      host: (process.env.INVOICE_IMAP_HOST || "imap.hostinger.com").trim(),
      port: parseInt((process.env.INVOICE_IMAP_PORT || "993").trim(), 10),
      secure: true,
      auth: { user: hostingerUser, pass: hostingerPass },
    });
  }

  // Rasmus Gmail
  const gmailUser = process.env.INVOICE_GMAIL_RASMUS_EMAIL;
  const gmailPass = process.env.INVOICE_GMAIL_RASMUS_PASSWORD;
  if (gmailUser && gmailPass) {
    accounts.push({
      accountId: "gmail-rasmus",
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });
  }

  return accounts;
}

/** Get a specific IMAP account by id */
function getImapAccountById(accountId: string): ImapAccountConfig {
  const accounts = getImapAccounts();
  const acct = accounts.find((a) => a.accountId === accountId);
  if (!acct) throw new Error(`IMAP account "${accountId}" not configured`);
  return acct;
}

function getImapConfig(): ImapAccountConfig {
  // Legacy: returns the primary hostinger account
  return getImapAccountById("hostinger");
}

function getSmtpConfig() {
  const host = process.env.INVOICE_SMTP_HOST || "smtp.hostinger.com";
  const port = parseInt(process.env.INVOICE_SMTP_PORT || "465", 10);
  const user = process.env.INVOICE_SMTP_EMAIL || process.env.INVOICE_IMAP_EMAIL;
  const pass = process.env.INVOICE_SMTP_PASSWORD || process.env.INVOICE_IMAP_PASSWORD;
  if (!user || !pass) throw new Error("SMTP credentials must be set");
  return { host, port, secure: true, auth: { user, pass } };
}

const JUNI_RECEIPTS_EMAIL = "q1k5n1k0@receipts.juni.co";
const JUNI_INVOICES_EMAIL = "q1k5n1k0@invoices.juni.co";

function getForwardEmail(target: "receipts" | "invoices" = "receipts"): string {
  return target === "invoices" ? JUNI_INVOICES_EMAIL : JUNI_RECEIPTS_EMAIL;
}

/** Extract PDF attachments from BODYSTRUCTURE */
function findPdfs(
  struct: Record<string, unknown> | Record<string, unknown>[],
  parentPart = ""
): PdfAttachment[] {
  const pdfs: PdfAttachment[] = [];

  if (Array.isArray(struct)) {
    for (let i = 0; i < struct.length; i++) {
      const child = struct[i];
      if (child && typeof child === "object") {
        const part = parentPart ? `${parentPart}.${i + 1}` : `${i + 1}`;
        pdfs.push(...findPdfs(child as Record<string, unknown>, part));
      }
    }
    return pdfs;
  }

  const s = struct as Record<string, unknown>;

  if (s.childNodes && Array.isArray(s.childNodes)) {
    for (let i = 0; i < s.childNodes.length; i++) {
      const child = s.childNodes[i] as Record<string, unknown>;
      const part = child.part as string || (parentPart ? `${parentPart}.${i + 1}` : `${i + 1}`);
      pdfs.push(...findPdfs(child, part));
    }
    return pdfs;
  }

  const type = ((s.type as string) || "").toLowerCase();
  const subtype = ((s.subtype as string) || "").toLowerCase();
  const dispositionParams = (s.dispositionParameters || s.parameters || {}) as Record<string, string>;
  const filename =
    dispositionParams.filename ||
    dispositionParams.name ||
    ((s.parameters as Record<string, string>)?.name) ||
    "";

  const isPdf =
    (type === "application" && subtype === "pdf") ||
    filename.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    pdfs.push({
      filename: filename || "invoice.pdf",
      size: (s.size as number) || 0,
      part: (s.part as string) || parentPart,
    });
  }

  return pdfs;
}

// --- Shared IMAP session ---

/** Create a connected IMAP client with mailbox lock (retries on DNS/network errors) */
async function createImapSession(account?: ImapAccountConfig): Promise<{
  client: ImapFlow;
  lock: { release: () => void };
  uidValidity: number;
}> {
  const config = account || getImapConfig();

  // Pre-resolve DNS to avoid Vercel's EBUSY getaddrinfo failures
  const { ip, servername } = await resolveHost(config.host);

  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const client = new ImapFlow({
      host: ip,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
      logger: false,
      socketTimeout: 15_000,
      ...(servername ? { servername, tls: { servername } } : {}),
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const uidValidity = Number((client.mailbox as any)?.uidValidity || 0);
      return { client, lock, uidValidity };
    } catch (e) {
      await client.logout().catch(() => {});
      const msg = e instanceof Error ? e.message : String(e);
      const code = e instanceof Error ? (e as NodeJS.ErrnoException).code : undefined;
      const isRetryable = /EBUSY|ETIMEOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN/i.test(msg);
      if (!isRetryable || attempt === MAX_RETRIES) throw e;
      console.warn(`[invoice-mail] IMAP connect attempt ${attempt}/${MAX_RETRIES} failed: ${msg} (code: ${code}), retrying in ${attempt * 2}s...`);
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }

  throw new Error("IMAP connect failed after retries");
}

/** Close an IMAP session safely */
async function closeImapSession(session: { client: ImapFlow; lock: { release: () => void } }) {
  try { session.lock.release(); } catch { /* already released */ }
  await session.client.logout().catch(() => {});
}

/** Fetch new emails since a given UID using an existing session */
async function fetchNewEmails(
  client: ImapFlow,
  sinceUid: number,
  maxAge60Days = true
): Promise<InvoiceEmail[]> {
  const emails: InvoiceEmail[] = [];

  const searchCriteria: Record<string, unknown> = {};
  if (sinceUid > 0) {
    searchCriteria.uid = `${sinceUid + 1}:*`;
  } else if (maxAge60Days) {
    const since = new Date();
    since.setDate(since.getDate() - 60);
    searchCriteria.since = since;
  }

  const rawUids = await client.search(searchCriteria, { uid: true });
  if (!rawUids || rawUids.length === 0) return emails;

  const newUids = rawUids.map((u: number | bigint) => Number(u)).filter((u) => u > sinceUid);
  if (newUids.length === 0) return emails;

  for (const uid of newUids) {
    try {
      const msgResult = await client.fetchOne(String(uid), {
        uid: true,
        envelope: true,
        bodyStructure: true,
      }, { uid: true });

      if (!msgResult) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = msgResult as any;
      if (!msg.envelope) continue;

      const fromAddress = msg.envelope.from?.[0]?.address || "";
      const pdfAttachments = findPdfs(msg.bodyStructure as Record<string, unknown>);

      emails.push({
        uid: Number(msg.uid),
        from: fromAddress,
        subject: msg.envelope.subject || "(no subject)",
        date: msg.envelope.date ? new Date(msg.envelope.date) : new Date(),
        pdfAttachments,
      });
    } catch (e) {
      console.error(`[invoice-mail] Error fetching UID ${uid}:`, e);
    }
  }

  return emails;
}

/** Download the full raw RFC822 source of an email using an existing session */
async function downloadFullEmail(client: ImapFlow, uid: number): Promise<Buffer> {
  const { content } = await client.download(String(uid), undefined, { uid: true });
  const chunks: Buffer[] = [];
  for await (const chunk of content) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Download full email using a standalone connection (for retryForward/reprocess) */
async function downloadFullEmailStandalone(uid: number, accountId?: string): Promise<Buffer> {
  const account = accountId ? getImapAccountById(accountId) : undefined;
  const session = await createImapSession(account);
  try {
    return await downloadFullEmail(session.client, uid);
  } finally {
    await closeImapSession(session);
  }
}

/** Match email against service conditions (sender and/or subject patterns).
 *  Scores all matching services and returns the best match:
 *  - "all" mode matches score higher than "any" mode (both conditions met)
 *  - sender+subject match scores higher than sender-only or subject-only
 *  - longer pattern matches score higher (more specific)
 */
function matchEmailToService(
  email: InvoiceEmail,
  services: InvoiceService[]
): InvoiceService | null {
  const fromLower = email.from.toLowerCase();
  const subjectLower = email.subject.toLowerCase();

  let bestMatch: InvoiceService | null = null;
  let bestScore = 0;

  for (const svc of services) {
    const hasSenderPatterns = svc.sender_patterns.length > 0;
    const hasSubjectPatterns = svc.subject_patterns.length > 0;

    // Must have at least one type of condition
    if (!hasSenderPatterns && !hasSubjectPatterns) continue;

    const senderMatch = hasSenderPatterns && svc.sender_patterns.some((p) =>
      fromLower.includes(p.toLowerCase())
    );
    const subjectMatch = hasSubjectPatterns && svc.subject_patterns.some((p) =>
      subjectLower.includes(p.toLowerCase())
    );

    const mode = svc.match_mode || "any";
    let matched = false;

    if (mode === "any") {
      matched = senderMatch || subjectMatch;
    } else {
      // AND: all configured groups must match
      if (hasSenderPatterns && !senderMatch) continue;
      if (hasSubjectPatterns && !subjectMatch) continue;
      matched = true;
    }

    if (!matched) continue;

    // Score: prefer matches that satisfy more conditions
    let score = 0;
    if (senderMatch) score += 10;  // sender match is strong signal
    if (subjectMatch) score += 5;
    if (mode === "all" && senderMatch && subjectMatch) score += 20; // both matched in strict mode
    // Bonus for pattern specificity (longer patterns = more specific)
    const maxSenderLen = hasSenderPatterns ? Math.max(...svc.sender_patterns.map(p => p.length)) : 0;
    score += Math.min(maxSenderLen, 10); // cap at 10 bonus points

    if (score > bestScore) {
      bestScore = score;
      bestMatch = svc;
    }
  }
  return bestMatch;
}

// --- Invoice heuristics ---

const INVOICE_KEYWORDS = [
  // English — strong signals for actual invoices/receipts
  "invoice", "receipt", "billing", "statement",
  // Swedish
  "faktura", "kvitto",
];

/** Check if an unmatched email looks like an invoice/receipt based on subject keywords */
function looksLikeInvoice(email: InvoiceEmail): boolean {
  const subjectLower = email.subject.toLowerCase();
  return INVOICE_KEYWORDS.some((kw) => subjectLower.includes(kw));
}

// --- SMTP ---

/** Forward the original email as-is to Juni (preserving body content for AI matching) */
async function forwardToJuni(
  serviceName: string,
  period: string,
  originalEmailRaw: Buffer,
  originalSubject: string,
  forwardTarget: "receipts" | "invoices" = "receipts"
): Promise<ForwardResult> {
  const smtpConfig = getSmtpConfig();
  const forwardEmail = getForwardEmail(forwardTarget);

  // Pre-resolve DNS to avoid Vercel's EBUSY getaddrinfo failures
  const { ip, servername } = await resolveHost(smtpConfig.host);
  const transporter = nodemailer.createTransport({
    ...smtpConfig,
    host: ip,
    ...(servername ? { tls: { servername } } : {}),
  });

  try {
    const rawStr = originalEmailRaw.toString();

    await transporter.sendMail({
      envelope: {
        from: smtpConfig.auth.user,
        to: forwardEmail,
      },
      raw: rewriteEmailHeaders(rawStr, {
        from: smtpConfig.auth.user,
        to: forwardEmail,
        subject: `Fwd: ${originalSubject}`,
      }),
    });
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[invoice-mail] SMTP forward error:`, msg);
    return { success: false, error: msg };
  }
}

/** Rewrite From/To/Subject headers in a raw email while preserving the body */
function rewriteEmailHeaders(
  raw: string,
  headers: { from: string; to: string; subject: string }
): string {
  const divider = raw.includes("\r\n\r\n") ? "\r\n\r\n" : "\n\n";
  const dividerIndex = raw.indexOf(divider);
  if (dividerIndex === -1) return raw;

  const headerSection = raw.substring(0, dividerIndex);
  const body = raw.substring(dividerIndex);

  const lines = headerSection.split(/\r?\n/);
  const newLines: string[] = [];
  let skipContinuation = false;

  for (const line of lines) {
    if (/^\s/.test(line) && skipContinuation) continue;
    skipContinuation = false;

    const lower = line.toLowerCase();
    if (lower.startsWith("from:") || lower.startsWith("to:") || lower.startsWith("subject:")) {
      skipContinuation = true;
      continue;
    }
    newLines.push(line);
  }

  const nl = raw.includes("\r\n") ? "\r\n" : "\n";
  const newHeaders = [
    `From: ${headers.from}`,
    `To: ${headers.to}`,
    `Subject: ${headers.subject}`,
    ...newLines,
  ].join(nl);

  return newHeaders + body;
}

// --- PDF Generation ---

/** Extract HTML body from a raw RFC822 email using mailparser */
async function extractHtmlFromEmail(rawEmail: Buffer): Promise<string | null> {
  const parsed = await simpleParser(rawEmail);
  return parsed.html || null;
}

/** Generate a PDF from HTML using puppeteer + chromium */
async function htmlToPdf(html: string): Promise<Buffer> {
  const isLocal = process.env.NODE_ENV === "development";
  const browser = await puppeteer.launch({
    args: isLocal ? ["--no-sandbox"] : chromium.args,
    executablePath: isLocal
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : await chromium.executablePath(),
    headless: true,
    defaultViewport: { width: 800, height: 1200 },
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 15000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/** Forward an email to Juni with a generated PDF attachment */
async function forwardWithGeneratedPdf(
  serviceName: string,
  originalSubject: string,
  rawEmail: Buffer,
  pdfBuffer: Buffer,
  forwardTarget: "receipts" | "invoices" = "receipts"
): Promise<ForwardResult> {
  const smtpConfig = getSmtpConfig();
  const forwardEmail = getForwardEmail(forwardTarget);

  // Pre-resolve DNS to avoid Vercel's EBUSY getaddrinfo failures
  const { ip, servername } = await resolveHost(smtpConfig.host);
  const transporter = nodemailer.createTransport({
    ...smtpConfig,
    host: ip,
    ...(servername ? { tls: { servername } } : {}),
  });

  try {
    // Parse original email to get body content
    const parsed = await simpleParser(rawEmail);

    await transporter.sendMail({
      from: smtpConfig.auth.user,
      to: forwardEmail,
      subject: `Fwd: ${originalSubject}`,
      html: parsed.html || undefined,
      text: parsed.text || undefined,
      attachments: [
        {
          filename: `${serviceName.replace(/[^a-zA-Z0-9]/g, "_")}_receipt.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[invoice-mail] SMTP forward (generated PDF) error:`, msg);
    return { success: false, error: msg };
  }
}

// --- Amount Extraction ---

/** Extract invoice amount and currency from email HTML using Claude Haiku */
async function extractAmount(
  html: string
): Promise<{ amount: number; currency: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey });
    // Strip HTML tags for a shorter prompt, keep just the text
    const text = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3000); // Keep it short for Haiku

    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: `Extract the total invoice/receipt amount and currency from this email text. Return ONLY a JSON object like {"amount": 29.99, "currency": "USD"}. If you can't find an amount, return {"amount": null, "currency": null}. No markdown fences.\n\nEmail text:\n${text}`,
        },
      ],
    });

    const raw = res.content[0].type === "text" ? res.content[0].text : "";
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.amount && parsed.currency) {
      return { amount: Number(parsed.amount), currency: String(parsed.currency) };
    }
    return null;
  } catch (e) {
    console.error("[invoice-mail] Amount extraction failed:", e);
    return null;
  }
}

// --- Original date extraction from forwarded emails ---

const SWEDISH_MONTHS: Record<string, number> = {
  januari: 0, februari: 1, mars: 2, april: 3, maj: 4, juni: 5,
  juli: 6, augusti: 7, september: 8, oktober: 9, november: 10, december: 11,
};

const ENGLISH_MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

/**
 * Extract the original email date from a forwarded email body.
 * When Outlook forwards an email, it includes headers like:
 *   Swedish: "Skickat: den 15 februari 2025 20:47"
 *   English: "Sent: Saturday, February 15, 2025 8:47 PM"
 * Returns the parsed date, or null if not found.
 */
function extractOriginalEmailDate(bodyHtml: string | null): Date | null {
  if (!bodyHtml) return null;

  // Strip HTML to plain text
  const text = bodyHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ");

  // Swedish pattern: "Datum: måndag, 16 februari 2026 15:15"
  // Note: \S+ instead of \w+ to match Swedish chars like å, ö, ä
  const sweMatch = text.match(
    /(?:Skickat|Datum|Sänt)\s*:\s*(?:den\s+)?(?:\S+[,.]?\s+)?(\d{1,2})\s+(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+(\d{4})/i
  );
  if (sweMatch) {
    const day = parseInt(sweMatch[1]);
    const month = SWEDISH_MONTHS[sweMatch[2].toLowerCase()];
    const year = parseInt(sweMatch[3]);
    if (month !== undefined && year > 2000) {
      return new Date(year, month, day);
    }
  }

  // English pattern: "Sent: Saturday, February 15, 2025 8:47 PM" (Month DD, YYYY)
  const engMatch = text.match(
    /(?:Sent|Date)\s*:\s*(?:\S+,?\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i
  );
  if (engMatch) {
    const month = ENGLISH_MONTHS[engMatch[1].toLowerCase()];
    const day = parseInt(engMatch[2]);
    const year = parseInt(engMatch[3]);
    if (month !== undefined && year > 2000) {
      return new Date(year, month, day);
    }
  }

  // English variant: "DD Month YYYY"
  const engMatch2 = text.match(
    /(?:Sent|Date)\s*:\s*(?:\S+,?\s+)?(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s+(\d{4})/i
  );
  if (engMatch2) {
    const day = parseInt(engMatch2[1]);
    const month = ENGLISH_MONTHS[engMatch2[2].toLowerCase()];
    const year = parseInt(engMatch2[3]);
    if (month !== undefined && year > 2000) {
      return new Date(year, month, day);
    }
  }

  return null;
}

// --- Orchestrator ---

function emailPeriod(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function processInvoices(): Promise<{
  processed: number;
  forwarded: number;
  errors: number;
  skipped: number;
  remaining: number;
  errorDetails?: string[];
}> {
  const accounts = getImapAccounts();
  if (accounts.length === 0) throw new Error("No IMAP accounts configured");

  let totalProcessed = 0;
  let totalForwarded = 0;
  let totalErrors = 0;
  let totalSkipped = 0;
  let totalRemaining = 0;
  const errorDetails: string[] = [];

  for (const account of accounts) {
    try {
      console.log(`[invoice-mail] Scanning account: ${account.accountId}`);
      const result = await processAccount(account);
      totalProcessed += result.processed;
      totalForwarded += result.forwarded;
      totalErrors += result.errors;
      totalSkipped += result.skipped;
      totalRemaining += result.remaining;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[invoice-mail] Error scanning ${account.accountId}:`, msg);
      errorDetails.push(`${account.accountId}: ${msg}`);
      totalErrors++;
    }
  }

  return { processed: totalProcessed, forwarded: totalForwarded, errors: totalErrors, skipped: totalSkipped, remaining: totalRemaining, errorDetails: errorDetails.length > 0 ? errorDetails : undefined };
}

/** Process a single IMAP account */
async function processAccount(account: ImapAccountConfig): Promise<{
  processed: number;
  forwarded: number;
  errors: number;
  skipped: number;
  remaining: number;
}> {
  const db = createServerSupabase();
  const accountId = account.accountId;

  // 1. Load IMAP state for this account
  const { data: imapState } = await db
    .from("invoice_imap_state")
    .select("*")
    .eq("account_id", accountId)
    .single();

  if (!imapState) {
    console.warn(`[invoice-mail] No imap_state row for "${accountId}", skipping`);
    return { processed: 0, forwarded: 0, errors: 0, skipped: 0, remaining: 0 };
  }

  // 2. Open single IMAP session (reused for all operations)
  const session = await createImapSession(account);
  const currentValidity = session.uidValidity;

  let lastUid = imapState.last_processed_uid as number;
  if (imapState.last_uid_validity && currentValidity !== imapState.last_uid_validity) {
    console.log(`[invoice-mail] [${accountId}] UIDVALIDITY changed, resetting last_processed_uid`);
    lastUid = 0;
  }

  // 3. Load active services
  const { data: services } = await db
    .from("invoice_services")
    .select("*")
    .eq("is_active", true);

  if (!services || services.length === 0) {
    await closeImapSession(session);
    return { processed: 0, forwarded: 0, errors: 0, skipped: 0, remaining: 0 };
  }

  // 4. Fetch new emails (headers only — fast, reuses session)
  const allEmails = await fetchNewEmails(session.client, lastUid);
  const MAX_EMAILS_PER_BATCH = 15;
  const emails = allEmails.slice(0, MAX_EMAILS_PER_BATCH);
  const remaining = allEmails.length - emails.length;
  console.log(`[invoice-mail] [${accountId}] Found ${allEmails.length} new emails since UID ${lastUid}${remaining > 0 ? ` (processing ${emails.length}, ${remaining} remaining)` : ""}`);

  let forwarded = 0;
  let errors = 0;
  let skipped = 0;
  let maxUid = lastUid;

  // Helper: save progress so we don't re-scan on next run
  async function saveProgress(uid: number) {
    if (uid > lastUid) {
      await db
        .from("invoice_imap_state")
        .update({
          last_processed_uid: uid,
          last_uid_validity: currentValidity,
          last_run_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("account_id", accountId);
    }
  }

  for (const email of emails) {
    const uid = Number(email.uid);
    if (uid > maxUid) maxUid = uid;

    const service = matchEmailToService(email, services as InvoiceService[]);
    if (!service) {
      // Only store as unmatched if subject contains invoice keywords
      if (looksLikeInvoice(email)) {
        const umPeriod = emailPeriod(email.date);
        const { data: existingUnmatched } = await db
          .from("invoice_logs")
          .select("id")
          .is("service_id", null)
          .eq("email_uid", String(email.uid))
          .eq("imap_account_id", accountId)
          .maybeSingle();
        if (!existingUnmatched) {
          await db.from("invoice_logs").insert({
            service_id: null,
            period: umPeriod,
            status: "unmatched",
            email_uid: String(email.uid),
            email_subject: email.subject,
            email_from: email.from,
            email_date: email.date.toISOString(),
            imap_account_id: accountId,
          });
        }
      }
      skipped++;
      // Save progress after every batch of skipped emails
      if (skipped % 20 === 0) await saveProgress(maxUid);
      continue;
    }

    // Check for existing log (same service + same email_uid + same account)
    const { data: existing } = await db
      .from("invoice_logs")
      .select("id")
      .eq("service_id", service.id)
      .eq("email_uid", String(email.uid))
      .eq("imap_account_id", accountId)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    try {
      const fullEmail = await downloadFullEmail(session.client, email.uid);
      // Extract HTML for amount detection and original date extraction
      const emailHtml = await extractHtmlFromEmail(fullEmail);

      // Check for original email date in forwarded email body
      // (e.g. Outlook "Skickat: den 15 februari 2025 20:47")
      const originalDate = extractOriginalEmailDate(emailHtml);
      const effectiveDate = originalDate || email.date;
      const period = emailPeriod(effectiveDate);

      if (originalDate) {
        console.log(`[invoice-mail] [${accountId}] Found original date ${originalDate.toISOString()} in forwarded email (envelope: ${email.date.toISOString()})`);
      }

      const hasPdf = email.pdfAttachments.length > 0;
      const pdfFilename = hasPdf ? email.pdfAttachments[0].filename : null;

      if (!hasPdf && !emailHtml) {
        await db.from("invoice_logs").insert({
          service_id: service.id,
          period,
          status: "received_no_pdf",
          email_uid: String(email.uid),
          email_subject: email.subject,
          email_from: email.from,
          email_date: effectiveDate.toISOString(),
          error_message: "No PDF attachment and no HTML body",
          imap_account_id: accountId,
        });
        skipped++;
        continue;
      }

      // Try to extract amount from email body (non-blocking)
      const amountInfo = emailHtml ? await extractAmount(emailHtml).catch(() => null) : null;

      // Store PDF to Supabase storage as backup
      let pdfStoragePath: string | null = null;
      if (hasPdf) {
        try {
          const parsed = await simpleParser(fullEmail);
          const pdfAtt = parsed.attachments?.find(
            (a) => a.contentType === "application/pdf" || a.filename?.toLowerCase().endsWith(".pdf")
          );
          if (pdfAtt) {
            const safeName = (pdfAtt.filename || "invoice.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
            const storagePath = `${service.id}/${period}/${email.uid}_${safeName}`;
            const { error: uploadErr } = await db.storage
              .from("invoice-pdfs")
              .upload(storagePath, pdfAtt.content, {
                contentType: "application/pdf",
                upsert: true,
              });
            if (!uploadErr) {
              pdfStoragePath = storagePath;
            } else {
              console.error(`[invoice-mail] Failed to store PDF: ${uploadErr.message}`);
            }
          }
        } catch (parseErr) {
          console.error(`[invoice-mail] Failed to parse email for PDF storage:`, parseErr);
        }
      }

      // Auto-forward to Juni
      let logStatus: "forwarded" | "ready" = "ready";
      let forwardedAt: string | null = null;
      try {
        const forwardTarget = (service.forward_to || "receipts") as "receipts" | "invoices";
        const result = await forwardToJuni(
          service.name, period, fullEmail, email.subject, forwardTarget
        );
        if (result.success) {
          logStatus = "forwarded";
          forwardedAt = new Date().toISOString();
          console.log(`[invoice-mail] [${accountId}] Auto-forwarded ${service.name} (${period}) to Juni`);
        } else {
          console.warn(`[invoice-mail] [${accountId}] Auto-forward failed for ${service.name}: ${result.error}`);
        }
      } catch (fwdErr) {
        console.error(`[invoice-mail] [${accountId}] Auto-forward error for ${service.name}:`, fwdErr);
      }

      await db.from("invoice_logs").insert({
        service_id: service.id,
        period,
        status: logStatus,
        email_uid: String(email.uid),
        email_subject: email.subject,
        email_from: email.from,
        email_date: effectiveDate.toISOString(),
        pdf_filename: pdfFilename,
        pdf_size_bytes: hasPdf ? fullEmail.length : null,
        amount: amountInfo?.amount || null,
        currency: amountInfo?.currency || null,
        imap_account_id: accountId,
        pdf_storage_path: pdfStoragePath,
        forwarded_at: forwardedAt,
      });
      forwarded++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.from("invoice_logs").insert({
        service_id: service.id,
        period: emailPeriod(email.date),
        status: "error",
        email_uid: String(email.uid),
        email_subject: email.subject,
        email_from: email.from,
        email_date: email.date.toISOString(),
        error_message: msg,
        imap_account_id: accountId,
      });
      errors++;
    }

    // Save progress after each processed email
    await saveProgress(maxUid);
  }

  // 5. Close IMAP session — done with all email operations
  await closeImapSession(session);

  // 6. Final save — always update last_run_at even if no new emails
  await saveProgress(maxUid);
  await db
    .from("invoice_imap_state")
    .update({ last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("account_id", accountId);

  return { processed: emails.length, forwarded, errors, skipped, remaining };
}

/** Test IMAP connection */
export async function testImapConnection(): Promise<{ exists: number; uidValidity: number }> {
  const session = await createImapSession();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mb = session.client.mailbox as any;
    return {
      exists: Number(mb?.exists || 0),
      uidValidity: session.uidValidity,
    };
  } finally {
    await closeImapSession(session);
  }
}

/** Retry forwarding a specific email by UID for a given service */
export async function retryForward(
  emailUid: number,
  service: InvoiceService,
  accountId?: string
): Promise<{ success: boolean; error?: string }> {
  const db = createServerSupabase();

  try {
    const fullEmail = await downloadFullEmailStandalone(emailUid, accountId);
    const parsed = await simpleParser(fullEmail);
    const hasPdf = parsed.attachments?.some(
      (a) => a.contentType === "application/pdf" || a.filename?.toLowerCase().endsWith(".pdf")
    );

    // Extract original date from forwarded email body
    const originalDate = extractOriginalEmailDate(parsed.html || null);
    const effectiveDate = originalDate || parsed.date || new Date();
    const period = emailPeriod(effectiveDate);
    const subject = parsed.subject || "(no subject)";
    const from = parsed.from?.value?.[0]?.address || "";

    if (hasPdf) {
      const result = await forwardToJuni(service.name, period, fullEmail, subject, service.forward_to || "receipts");
      const pdfAttachment = parsed.attachments?.find(
        (a) => a.contentType === "application/pdf" || a.filename?.toLowerCase().endsWith(".pdf")
      );
      await db.from("invoice_logs").insert({
        service_id: service.id,
        period,
        status: result.success ? "forwarded" : "error",
        email_uid: String(emailUid),
        email_subject: subject,
        email_from: from,
        email_date: effectiveDate.toISOString(),
        forwarded_at: result.success ? new Date().toISOString() : null,
        pdf_filename: pdfAttachment?.filename || "invoice.pdf",
        error_message: result.error || null,
        imap_account_id: accountId || "hostinger",
      });
      return result;
    }

    // No PDF — generate from HTML
    const html = parsed.html || null;
    if (!html) {
      return { success: false, error: "No HTML body found in email" };
    }

    const pdfBuffer = await htmlToPdf(html);
    const pdfFilename = `${service.name.replace(/[^a-zA-Z0-9]/g, "_")}_receipt.pdf`;
    const result = await forwardWithGeneratedPdf(service.name, subject, fullEmail, pdfBuffer, service.forward_to || "receipts");

    await db.from("invoice_logs").insert({
      service_id: service.id,
      period,
      status: result.success ? "forwarded" : "error",
      email_uid: String(emailUid),
      email_subject: subject,
      email_from: from,
      email_date: effectiveDate.toISOString(),
      forwarded_at: result.success ? new Date().toISOString() : null,
      pdf_filename: pdfFilename,
      pdf_size_bytes: pdfBuffer.length,
      error_message: result.error || null,
      imap_account_id: accountId || "hostinger",
    });
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

/**
 * Download an email from IMAP and extract the first PDF attachment.
 * Used by the download endpoint as a fallback when PDF isn't in storage.
 */
export async function downloadAndExtractPdf(
  emailUid: number,
  accountId: string
): Promise<{ buffer: Buffer; filename: string } | null> {
  const fullEmail = await downloadFullEmailStandalone(emailUid, accountId);
  const parsed = await simpleParser(fullEmail);
  const pdfAtt = parsed.attachments?.find(
    (a) => a.contentType === "application/pdf" || a.filename?.toLowerCase().endsWith(".pdf")
  );
  if (!pdfAtt) return null;
  return { buffer: pdfAtt.content, filename: pdfAtt.filename || "invoice.pdf" };
}

/**
 * Forward a log entry to Juni.
 * Strategy 1: If PDF is in Supabase storage, download and forward via SMTP.
 * Strategy 2: If email UID exists, download from IMAP and forward.
 */
export async function forwardLogToJuni(
  logId: string
): Promise<{ success: boolean; error?: string }> {
  const db = createServerSupabase();

  const { data: log, error: logErr } = await db
    .from("invoice_logs")
    .select("*, invoice_services(*)")
    .eq("id", logId)
    .single();

  if (logErr || !log) return { success: false, error: "Log not found" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = (log as any).invoice_services as InvoiceService;
  if (!service) return { success: false, error: "Service not found for this log" };

  // Strategy 1: Forward from Supabase storage (manually uploaded or backed-up PDFs)
  if (log.pdf_storage_path) {
    try {
      const { data: pdfData, error: dlErr } = await db.storage
        .from("invoice-pdfs")
        .download(log.pdf_storage_path);

      if (dlErr || !pdfData) {
        console.warn(`[invoice-mail] Storage download failed, trying IMAP fallback: ${dlErr?.message}`);
      } else {
        const buffer = Buffer.from(await pdfData.arrayBuffer());
        const smtpConfig = getSmtpConfig();
        const forwardEmail = getForwardEmail((service.forward_to || "receipts") as "receipts" | "invoices");
        const { ip, servername } = await resolveHost(smtpConfig.host);
        const transporter = nodemailer.createTransport({
          ...smtpConfig,
          host: ip,
          ...(servername ? { tls: { servername } } : {}),
        });

        await transporter.sendMail({
          from: smtpConfig.auth.user,
          to: forwardEmail,
          subject: `Invoice: ${service.name} - ${log.period}`,
          text: `Invoice/receipt for ${service.name}, period ${log.period}.`,
          attachments: [{
            filename: log.pdf_filename || "invoice.pdf",
            content: buffer,
            contentType: "application/pdf",
          }],
        });

        await db.from("invoice_logs").update({
          status: "forwarded",
          forwarded_at: new Date().toISOString(),
          error_message: null,
          updated_at: new Date().toISOString(),
        }).eq("id", logId);

        return { success: true };
      }
    } catch (e) {
      console.warn(`[invoice-mail] Storage forward failed, trying IMAP fallback:`, e);
    }
  }

  // Strategy 2: Forward from IMAP (email-based)
  const emailUid = parseInt(log.email_uid, 10);
  if (!emailUid) return { success: false, error: "No stored PDF and no email UID to forward" };

  try {
    const fullEmail = await downloadFullEmailStandalone(emailUid, log.imap_account_id || "hostinger");
    const parsed = await simpleParser(fullEmail);
    const hasPdf = parsed.attachments?.some(
      (a) => a.contentType === "application/pdf" || a.filename?.toLowerCase().endsWith(".pdf")
    );
    const subject = parsed.subject || log.email_subject || "(no subject)";

    let result: ForwardResult;

    if (hasPdf) {
      result = await forwardToJuni(service.name, log.period, fullEmail, subject, service.forward_to || "receipts");
    } else {
      const html = parsed.html || null;
      if (!html) return { success: false, error: "No HTML body to generate PDF from" };

      const pdfBuffer = await htmlToPdf(html);
      result = await forwardWithGeneratedPdf(service.name, subject, fullEmail, pdfBuffer, service.forward_to || "receipts");
    }

    if (result.success) {
      await db.from("invoice_logs").update({
        status: "forwarded",
        forwarded_at: new Date().toISOString(),
        error_message: null,
        updated_at: new Date().toISOString(),
      }).eq("id", logId);
    } else {
      await db.from("invoice_logs").update({
        status: "error",
        error_message: result.error,
        updated_at: new Date().toISOString(),
      }).eq("id", logId);
    }

    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("invoice_logs").update({
      status: "error",
      error_message: msg,
      updated_at: new Date().toISOString(),
    }).eq("id", logId);
    return { success: false, error: msg };
  }
}

/**
 * Re-check existing invoice logs and fix periods by extracting original dates
 * from forwarded email bodies. Useful for correcting logs where forwarded emails
 * were filed under the forward date instead of the original email date.
 */
export async function reprocessPeriods(): Promise<{
  checked: number;
  fixed: number;
  errors: number;
  details: Array<{ id: string; service: string; oldPeriod: string; newPeriod: string }>;
}> {
  const db = createServerSupabase();

  // Load all forwarded/error logs that have email UIDs (can be re-downloaded)
  const { data: logs } = await db
    .from("invoice_logs")
    .select("id, service_id, period, email_uid, email_date, imap_account_id, invoice_services(name)")
    .in("status", ["forwarded", "error", "received_no_pdf"])
    .not("email_uid", "is", null)
    .order("created_at", { ascending: false });

  if (!logs || logs.length === 0) {
    return { checked: 0, fixed: 0, errors: 0, details: [] };
  }

  let fixed = 0;
  let errorCount = 0;
  const details: Array<{ id: string; service: string; oldPeriod: string; newPeriod: string }> = [];

  for (const log of logs) {
    try {
      const emailUid = parseInt(log.email_uid, 10);
      if (isNaN(emailUid)) continue;

      const fullEmail = await downloadFullEmailStandalone(emailUid, log.imap_account_id || "hostinger");
      const emailHtml = await extractHtmlFromEmail(fullEmail);
      const originalDate = extractOriginalEmailDate(emailHtml);

      if (!originalDate) continue;

      const newPeriod = emailPeriod(originalDate);
      if (newPeriod !== log.period) {
        await db
          .from("invoice_logs")
          .update({
            period: newPeriod,
            email_date: originalDate.toISOString(),
          })
          .eq("id", log.id);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const serviceName = (log as any).invoice_services?.name || "Unknown";
        details.push({
          id: log.id,
          service: serviceName,
          oldPeriod: log.period,
          newPeriod,
        });
        fixed++;
      }
    } catch (e) {
      console.error(`[invoice-mail] Reprocess error for log ${log.id}:`, e);
      errorCount++;
    }
  }

  return { checked: logs.length, fixed, errors: errorCount, details };
}
