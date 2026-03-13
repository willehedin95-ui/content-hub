import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { createServerSupabase } from "@/lib/supabase";
import type { InvoiceService } from "@/types";

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

// --- IMAP ---

function getImapConfig() {
  const host = process.env.INVOICE_IMAP_HOST || "imap.hostinger.com";
  const port = parseInt(process.env.INVOICE_IMAP_PORT || "993", 10);
  const user = process.env.INVOICE_IMAP_EMAIL;
  const pass = process.env.INVOICE_IMAP_PASSWORD;
  if (!user || !pass) throw new Error("INVOICE_IMAP_EMAIL and INVOICE_IMAP_PASSWORD must be set");
  return { host, port, secure: true, auth: { user, pass } };
}

function getSmtpConfig() {
  const host = process.env.INVOICE_SMTP_HOST || "smtp.hostinger.com";
  const port = parseInt(process.env.INVOICE_SMTP_PORT || "465", 10);
  const user = process.env.INVOICE_SMTP_EMAIL || process.env.INVOICE_IMAP_EMAIL;
  const pass = process.env.INVOICE_SMTP_PASSWORD || process.env.INVOICE_IMAP_PASSWORD;
  if (!user || !pass) throw new Error("SMTP credentials must be set");
  return { host, port, secure: true, auth: { user, pass } };
}

function getForwardEmail(): string {
  const email = process.env.JUNI_FORWARD_EMAIL;
  if (!email) throw new Error("JUNI_FORWARD_EMAIL must be set");
  return email;
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

  // Check childNodes for multipart
  if (s.childNodes && Array.isArray(s.childNodes)) {
    for (let i = 0; i < s.childNodes.length; i++) {
      const child = s.childNodes[i] as Record<string, unknown>;
      const part = child.part as string || (parentPart ? `${parentPart}.${i + 1}` : `${i + 1}`);
      pdfs.push(...findPdfs(child, part));
    }
    return pdfs;
  }

  // Leaf node — check if PDF
  const type = ((s.type as string) || "").toLowerCase();
  const subtype = ((s.subtype as string) || "").toLowerCase();
  const disposition = ((s.disposition as string) || "").toLowerCase();
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

/** Fetch new emails since a given UID */
async function fetchNewEmails(sinceUid: number, maxAge60Days = true): Promise<InvoiceEmail[]> {
  const config = getImapConfig();
  const client = new ImapFlow({
    ...config,
    logger: false,
  });

  const emails: InvoiceEmail[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      // Build search criteria
      const searchCriteria: Record<string, unknown> = {};
      if (sinceUid > 0) {
        searchCriteria.uid = `${sinceUid + 1}:*`;
      } else if (maxAge60Days) {
        const since = new Date();
        since.setDate(since.getDate() - 60);
        searchCriteria.since = since;
      }

      const uids = await client.search(searchCriteria, { uid: true });
      if (!uids || uids.length === 0) return emails;

      // Filter out UIDs we've already processed
      const newUids = uids.filter((u: number) => u > sinceUid);
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

          const from = msg.envelope.from?.[0]
            ? `${msg.envelope.from[0].name || ""} <${msg.envelope.from[0].address || ""}>`
            : "";
          const fromAddress = msg.envelope.from?.[0]?.address || "";

          const pdfAttachments = findPdfs(msg.bodyStructure as Record<string, unknown>);

          emails.push({
            uid: msg.uid,
            from: fromAddress,
            subject: msg.envelope.subject || "(no subject)",
            date: msg.envelope.date ? new Date(msg.envelope.date) : new Date(),
            pdfAttachments,
          });
        } catch (e) {
          console.error(`[invoice-mail] Error fetching UID ${uid}:`, e);
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return emails;
}

/** Download a PDF attachment by UID and part */
async function downloadPdf(uid: number, part: string): Promise<Buffer> {
  const config = getImapConfig();
  const client = new ImapFlow({
    ...config,
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const { content } = await client.download(String(uid), part, { uid: true });
      const chunks: Buffer[] = [];
      for await (const chunk of content) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

/** Get UIDVALIDITY for the INBOX */
async function getUidValidity(): Promise<number> {
  const config = getImapConfig();
  const client = new ImapFlow({
    ...config,
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (client.mailbox as any)?.uidValidity || 0;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

/** Match email sender against service patterns */
function matchEmailToService(
  email: InvoiceEmail,
  services: InvoiceService[]
): InvoiceService | null {
  const fromLower = email.from.toLowerCase();
  const subjectLower = email.subject.toLowerCase();

  for (const svc of services) {
    // Check sender patterns
    const senderMatch = svc.sender_patterns.some((p) =>
      fromLower.includes(p.toLowerCase())
    );
    if (!senderMatch) continue;

    // If subject patterns exist, at least one must match
    if (svc.subject_patterns.length > 0) {
      const subjectMatch = svc.subject_patterns.some((p) =>
        subjectLower.includes(p.toLowerCase())
      );
      if (!subjectMatch) continue;
    }

    return svc;
  }
  return null;
}

// --- SMTP ---

/** Forward a PDF to Juni */
async function forwardToJuni(
  serviceName: string,
  period: string,
  pdf: { content: Buffer; filename: string },
  originalSubject: string
): Promise<ForwardResult> {
  const smtpConfig = getSmtpConfig();
  const forwardEmail = getForwardEmail();

  const transporter = nodemailer.createTransport(smtpConfig);

  try {
    await transporter.sendMail({
      from: smtpConfig.auth.user,
      to: forwardEmail,
      subject: `Invoice: ${serviceName} - ${period} | ${originalSubject}`,
      text: `Auto-forwarded invoice from ${serviceName} for period ${period}.\n\nOriginal subject: ${originalSubject}`,
      attachments: [
        {
          filename: pdf.filename,
          content: pdf.content,
          contentType: "application/pdf",
        },
      ],
    });
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[invoice-mail] SMTP forward error:`, msg);
    return { success: false, error: msg };
  }
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
}> {
  const db = createServerSupabase();

  // 1. Load IMAP state
  const { data: imapState } = await db
    .from("invoice_imap_state")
    .select("*")
    .single();

  if (!imapState) throw new Error("invoice_imap_state row not found");

  // 2. Check UIDVALIDITY — reset if changed
  let lastUid = imapState.last_processed_uid as number;
  const currentValidity = await getUidValidity();
  if (imapState.last_uid_validity && currentValidity !== imapState.last_uid_validity) {
    console.log("[invoice-mail] UIDVALIDITY changed, resetting last_processed_uid");
    lastUid = 0;
  }

  // 3. Load active services
  const { data: services } = await db
    .from("invoice_services")
    .select("*")
    .eq("is_active", true);

  if (!services || services.length === 0) {
    return { processed: 0, forwarded: 0, errors: 0, skipped: 0 };
  }

  // 4. Fetch new emails
  const emails = await fetchNewEmails(lastUid);

  let forwarded = 0;
  let errors = 0;
  let skipped = 0;
  let maxUid = lastUid;

  for (const email of emails) {
    if (email.uid > maxUid) maxUid = email.uid;

    const service = matchEmailToService(email, services as InvoiceService[]);
    if (!service) {
      skipped++;
      continue;
    }

    const period = emailPeriod(email.date);

    // Check if already processed
    const { data: existing } = await db
      .from("invoice_logs")
      .select("id")
      .eq("service_id", service.id)
      .eq("email_uid", String(email.uid))
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    if (email.pdfAttachments.length === 0) {
      // Email matched but no PDF
      await db.from("invoice_logs").insert({
        service_id: service.id,
        period,
        status: "received_no_pdf",
        email_uid: String(email.uid),
        email_subject: email.subject,
        email_from: email.from,
        email_date: email.date.toISOString(),
      });
      skipped++;
      continue;
    }

    // Download first PDF and forward
    const pdfInfo = email.pdfAttachments[0];
    try {
      const pdfContent = await downloadPdf(email.uid, pdfInfo.part);

      const result = await forwardToJuni(
        service.name,
        period,
        { content: pdfContent, filename: pdfInfo.filename },
        email.subject
      );

      if (result.success) {
        await db.from("invoice_logs").insert({
          service_id: service.id,
          period,
          status: "forwarded",
          email_uid: String(email.uid),
          email_subject: email.subject,
          email_from: email.from,
          email_date: email.date.toISOString(),
          forwarded_at: new Date().toISOString(),
          pdf_filename: pdfInfo.filename,
          pdf_size_bytes: pdfContent.length,
        });
        forwarded++;
      } else {
        await db.from("invoice_logs").insert({
          service_id: service.id,
          period,
          status: "error",
          email_uid: String(email.uid),
          email_subject: email.subject,
          email_from: email.from,
          email_date: email.date.toISOString(),
          error_message: result.error,
          pdf_filename: pdfInfo.filename,
        });
        errors++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.from("invoice_logs").insert({
        service_id: service.id,
        period,
        status: "error",
        email_uid: String(email.uid),
        email_subject: email.subject,
        email_from: email.from,
        email_date: email.date.toISOString(),
        error_message: msg,
      });
      errors++;
    }
  }

  // 5. Update IMAP state
  await db
    .from("invoice_imap_state")
    .update({
      last_processed_uid: maxUid,
      last_uid_validity: currentValidity,
      last_run_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  return { processed: emails.length, forwarded, errors, skipped };
}

/** Test IMAP connection — returns mailbox info or throws */
export async function testImapConnection(): Promise<{ exists: number; uidValidity: number }> {
  const config = getImapConfig();
  const client = new ImapFlow({
    ...config,
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mb = client.mailbox as any;
      return {
        exists: mb?.exists || 0,
        uidValidity: mb?.uidValidity || 0,
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}
