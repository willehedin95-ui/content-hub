/**
 * One-off script to reprocess invoice log periods.
 * Usage: node scripts/reprocess-periods.mjs
 */
import { readFileSync } from "fs";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createClient } from "@supabase/supabase-js";

// Load .env.local
const envContent = readFileSync(".env.local", "utf-8");
for (const line of envContent.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  const key = t.slice(0, eq);
  const val = t.slice(eq + 1);
  if (!process.env[key]) process.env[key] = val;
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Swedish month names
const SWEDISH_MONTHS = {
  januari: 0, februari: 1, mars: 2, april: 3, maj: 4, juni: 5,
  juli: 6, augusti: 7, september: 8, oktober: 9, november: 10, december: 11,
};
const ENGLISH_MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function extractOriginalEmailDate(bodyHtml) {
  if (!bodyHtml) return null;
  const text = bodyHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ");

  // Swedish: "Datum: måndag, 16 februari 2026 15:15" (\S+ for Unicode day names)
  const sweMatch = text.match(
    /(?:Skickat|Datum|Sänt)\s*:\s*(?:den\s+)?(?:\S+[,.]?\s+)?(\d{1,2})\s+(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+(\d{4})/i
  );
  if (sweMatch) {
    const day = parseInt(sweMatch[1]);
    const month = SWEDISH_MONTHS[sweMatch[2].toLowerCase()];
    const year = parseInt(sweMatch[3]);
    if (month !== undefined && year > 2000) return new Date(year, month, day);
  }

  // English: "Sent: Saturday, February 15, 2025"
  const engMatch = text.match(
    /(?:Sent|Date)\s*:\s*(?:\S+,?\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i
  );
  if (engMatch) {
    const month = ENGLISH_MONTHS[engMatch[1].toLowerCase()];
    const day = parseInt(engMatch[2]);
    const year = parseInt(engMatch[3]);
    if (month !== undefined && year > 2000) return new Date(year, month, day);
  }

  // English variant: "DD Month YYYY"
  const engMatch2 = text.match(
    /(?:Sent|Date)\s*:\s*(?:\S+,?\s+)?(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s+(\d{4})/i
  );
  if (engMatch2) {
    const day = parseInt(engMatch2[1]);
    const month = ENGLISH_MONTHS[engMatch2[2].toLowerCase()];
    const year = parseInt(engMatch2[3]);
    if (month !== undefined && year > 2000) return new Date(year, month, day);
  }

  return null;
}

function emailPeriod(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function downloadFullEmail(uid) {
  const client = new ImapFlow({
    host: process.env.INVOICE_IMAP_HOST || "imap.hostinger.com",
    port: parseInt(process.env.INVOICE_IMAP_PORT || "993"),
    secure: true,
    auth: {
      user: process.env.INVOICE_IMAP_EMAIL,
      pass: process.env.INVOICE_IMAP_PASSWORD,
    },
    logger: false,
    socketTimeout: 30000,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const { content } = await client.download(String(uid), undefined, { uid: true });
      const chunks = [];
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

async function main() {
  console.log("Reprocessing invoice log periods...\n");

  // Load all forwarded logs
  const { data: logs, error } = await db
    .from("invoice_logs")
    .select("id, service_id, period, email_uid, email_date, email_subject")
    .in("status", ["forwarded", "error", "received_no_pdf"])
    .not("email_uid", "is", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load logs:", error);
    return;
  }

  console.log(`Found ${logs.length} logs to check\n`);

  let fixed = 0;
  let checked = 0;

  for (const log of logs) {
    const emailUid = parseInt(log.email_uid, 10);
    if (isNaN(emailUid)) continue;

    checked++;
    process.stdout.write(`[${checked}/${logs.length}] UID ${emailUid}: ${log.email_subject?.slice(0, 50)}...`);

    try {
      const fullEmail = await downloadFullEmail(emailUid);
      const parsed = await simpleParser(fullEmail);
      const originalDate = extractOriginalEmailDate(parsed.html || null);

      if (!originalDate) {
        console.log(" → no original date found");
        continue;
      }

      const newPeriod = emailPeriod(originalDate);
      if (newPeriod !== log.period) {
        await db
          .from("invoice_logs")
          .update({ period: newPeriod, email_date: originalDate.toISOString() })
          .eq("id", log.id);
        console.log(` → FIXED: ${log.period} → ${newPeriod}`);
        fixed++;
      } else {
        console.log(` → OK (${log.period})`);
      }
    } catch (e) {
      console.log(` → ERROR: ${e.message}`);
    }
  }

  console.log(`\nDone! Checked ${checked}, fixed ${fixed}`);
}

main().catch(console.error);
