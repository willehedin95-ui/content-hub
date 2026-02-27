// Telegram Bot API utilities — raw fetch, no SDK

const TELEGRAM_API = "https://api.telegram.org";

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return token;
}

/** Send a text message to a chat */
export async function sendMessage(
  chatId: number | string,
  text: string,
  options?: {
    parse_mode?: "HTML" | "MarkdownV2";
    disable_web_page_preview?: boolean;
  }
): Promise<void> {
  const token = getBotToken();
  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...options }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error(`[Telegram] sendMessage failed: ${res.status} ${err}`);
  }
}

/** Download a file from Telegram by file_id. Returns the raw Buffer. */
export async function downloadFile(
  fileId: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const token = getBotToken();

  // Step 1: get file path
  const fileRes = await fetch(`${TELEGRAM_API}/bot${token}/getFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!fileRes.ok) throw new Error(`getFile failed: ${fileRes.status}`);
  const fileData = await fileRes.json();
  const filePath = fileData.result?.file_path;
  if (!filePath) throw new Error("No file_path in getFile response");

  // Step 2: download the file
  const downloadRes = await fetch(
    `${TELEGRAM_API}/file/bot${token}/${filePath}`
  );
  if (!downloadRes.ok)
    throw new Error(`File download failed: ${downloadRes.status}`);
  const buffer = Buffer.from(await downloadRes.arrayBuffer());
  const mimeType = downloadRes.headers.get("content-type") || "image/jpeg";

  return { buffer, mimeType };
}

/** Validate the X-Telegram-Bot-Api-Secret-Token header */
export function validateWebhookSecret(headerValue: string | null): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return true; // Skip validation if not configured
  return headerValue === secret;
}

/** Extract URLs from a message text */
export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  return text.match(urlRegex) ?? [];
}

/** Detect platform from URL */
export function detectPlatform(
  url: string
): "instagram" | "facebook" | "unknown" {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (
      hostname.includes("instagram.com") ||
      hostname.includes("instagr.am")
    )
      return "instagram";
    if (
      hostname.includes("facebook.com") ||
      hostname.includes("fb.com") ||
      hostname.includes("fb.watch")
    )
      return "facebook";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** Format a CASH analysis summary for Telegram */
export function formatCashSummary(
  analysis: Record<string, unknown>,
  hubUrl: string
): string {
  const parts: string[] = ["Saved & analyzed!"];

  if (analysis.angle) parts.push(`Angle: ${analysis.angle}`);
  if (analysis.awareness_level)
    parts.push(`Awareness: ${analysis.awareness_level}`);
  if (analysis.style) parts.push(`Style: ${analysis.style}`);
  if (analysis.concept_type) parts.push(`Concept: ${analysis.concept_type}`);

  const hooks = analysis.hooks as string[] | undefined;
  if (hooks?.length) parts.push(`Hook: "${hooks[0]}"`);

  if (analysis.concept_description)
    parts.push(`\n${analysis.concept_description}`);

  parts.push(`\nView in Hub: ${hubUrl}`);

  return parts.join("\n");
}
