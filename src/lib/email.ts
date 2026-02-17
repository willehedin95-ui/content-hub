import { Resend } from "resend";

function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  return new Resend(apiKey);
}

export async function sendJobCompleteEmail(
  to: string,
  jobName: string,
  imageCount: number,
  languageCount: number,
  driveExported: boolean
): Promise<void> {
  const resend = getResend();

  const driveNote = driveExported
    ? "<p style='color:#059669;margin-top:8px;'>Images have been auto-exported to Google Drive.</p>"
    : "";

  await resend.emails.send({
    from: "Content Hub <noreply@updates.contenttools.app>",
    to,
    subject: `Batch complete: ${jobName}`,
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="font-size:18px;color:#111827;margin-bottom:16px;">Batch Translation Complete</h2>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:16px;">
          <p style="font-size:16px;font-weight:600;color:#111827;margin:0 0 8px;">${jobName}</p>
          <p style="font-size:14px;color:#6b7280;margin:0;">
            ${imageCount} images &times; ${languageCount} languages translated
          </p>
          ${driveNote}
        </div>
        <p style="font-size:12px;color:#9ca3af;">
          Sent by Content Hub
        </p>
      </div>
    `,
  });
}
