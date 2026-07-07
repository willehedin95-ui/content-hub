import { Resend } from "resend";

const escHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c)
  );

function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  return new Resend(apiKey);
}

/**
 * Plain-text critical alert email. Used as fallback when a critical Telegram
 * notification fails to send (audit 2026-07-07, I3) - Telegram down must not
 * mean all alarms silently vanish.
 */
export async function sendCriticalAlertEmail(
  subject: string,
  body: string
): Promise<void> {
  const to = process.env.ALERT_EMAIL || "wille.hedin@hotmail.com";
  const resend = getResend();

  await resend.emails.send({
    from: "Content Hub Alerts <noreply@updates.contenttools.app>",
    to,
    subject: `[ALERT] ${subject}`,
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <h2 style="font-size:16px;color:#991b1b;margin-bottom:12px;">${escHtml(subject)}</h2>
        <pre style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;font-size:13px;color:#111827;white-space:pre-wrap;word-break:break-word;">${escHtml(body)}</pre>
        <p style="font-size:12px;color:#9ca3af;margin-top:16px;">
          Sent by Content Hub because the Telegram notification failed.
        </p>
      </div>
    `,
  });
}

export async function sendJobCompleteEmail(
  to: string,
  jobName: string,
  imageCount: number,
  languageCount: number
): Promise<void> {
  const resend = getResend();

  await resend.emails.send({
    from: "Content Hub <noreply@updates.contenttools.app>",
    to,
    subject: `Batch complete: ${jobName}`,
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="font-size:18px;color:#111827;margin-bottom:16px;">Batch Translation Complete</h2>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:16px;">
          <p style="font-size:16px;font-weight:600;color:#111827;margin:0 0 8px;">${escHtml(jobName)}</p>
          <p style="font-size:14px;color:#6b7280;margin:0;">
            ${imageCount} images &times; ${languageCount} languages translated
          </p>
        </div>
        <p style="font-size:12px;color:#9ca3af;">
          Sent by Content Hub
        </p>
      </div>
    `,
  });
}
