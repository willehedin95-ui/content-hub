// Telegram Bot API utilities — raw fetch, no SDK

const TELEGRAM_API = "https://api.telegram.org";

// All Telegram fetches time out after 10s (audit 2026-07-07, P3) - a hung
// Telegram API must never stall a cron or publish flow.
const TG_TIMEOUT_MS = 10_000;

/**
 * Escape a value for interpolation into a Telegram HTML-mode message.
 * Only <, > and & are special in Telegram's HTML parse mode.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Check if a workspace has Telegram notifications disabled.
 * Set `settings.notifications_disabled = true` on a workspace to silence all
 * telegram sends for that workspace. Pass the workspace row (or just its
 * settings). Returns true when notifications are suppressed.
 */
export function isTelegramDisabled(
  wsOrSettings: { settings?: unknown } | Record<string, unknown> | null | undefined
): boolean {
  if (!wsOrSettings) return false;
  const settings =
    "settings" in wsOrSettings && wsOrSettings.settings
      ? (wsOrSettings.settings as Record<string, unknown>)
      : (wsOrSettings as Record<string, unknown>);
  return settings?.notifications_disabled === true;
}

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
    signal: AbortSignal.timeout(TG_TIMEOUT_MS),
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
    signal: AbortSignal.timeout(TG_TIMEOUT_MS),
  });
  if (!fileRes.ok) throw new Error(`getFile failed: ${fileRes.status}`);
  const fileData = await fileRes.json();
  const filePath = fileData.result?.file_path;
  if (!filePath) throw new Error("No file_path in getFile response");

  // Step 2: download the file
  const downloadRes = await fetch(
    `${TELEGRAM_API}/file/bot${token}/${filePath}`,
    { signal: AbortSignal.timeout(3 * TG_TIMEOUT_MS) } // file download - allow longer
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
  if (!secret) return false; // Reject if not configured
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

/** Send a message with an inline keyboard */
export async function sendMessageWithInlineKeyboard(
  chatId: number | string,
  text: string,
  buttons: Array<Array<{ text: string; callback_data: string }>>,
  options?: { disable_web_page_preview?: boolean }
): Promise<{ message_id?: number }> {
  const token = getBotToken();
  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: { inline_keyboard: buttons },
      ...options,
    }),
    signal: AbortSignal.timeout(TG_TIMEOUT_MS),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error(`[Telegram] sendMessageWithInlineKeyboard failed: ${res.status} ${err}`);
    return {};
  }
  const data = await res.json();
  return { message_id: data.result?.message_id };
}

/** Answer a callback query (acknowledge button press) */
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<void> {
  const token = getBotToken();
  const res = await fetch(`${TELEGRAM_API}/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
    }),
    signal: AbortSignal.timeout(TG_TIMEOUT_MS),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error(`[Telegram] answerCallbackQuery failed: ${res.status} ${err}`);
  }
}

/** Edit the text of an existing message */
export async function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  options?: { reply_markup?: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } }
): Promise<void> {
  const token = getBotToken();
  const res = await fetch(`${TELEGRAM_API}/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      ...options,
    }),
    signal: AbortSignal.timeout(TG_TIMEOUT_MS),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error(`[Telegram] editMessageText failed: ${res.status} ${err}`);
  }
}

/** Edit the caption of a photo/media message (use instead of editMessageText for photo messages) */
export async function editMessageCaption(
  chatId: number | string,
  messageId: number,
  caption: string,
): Promise<void> {
  const token = getBotToken();
  const res = await fetch(`${TELEGRAM_API}/bot${token}/editMessageCaption`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      caption,
    }),
    signal: AbortSignal.timeout(TG_TIMEOUT_MS),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error(`[Telegram] editMessageCaption failed: ${res.status} ${err}`);
  }
}

/**
 * Send a media group (album) of photos with optional caption on the first.
 * Returns the message IDs of all sent messages.
 * NOTE: Telegram does not support inline keyboards on media groups.
 * Send a follow-up message with sendMessageWithInlineKeyboard for buttons.
 */
export async function sendMediaGroup(
  chatId: number | string,
  photoUrls: string[],
  caption?: string
): Promise<{ message_ids: number[] }> {
  if (photoUrls.length === 0) return { message_ids: [] };
  // Telegram allows max 10 media items; we'll cap at that
  const media = photoUrls.slice(0, 10).map((url, i) => ({
    type: "photo" as const,
    media: url,
    ...(i === 0 && caption ? { caption } : {}),
  }));

  const token = getBotToken();
  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMediaGroup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, media }),
    signal: AbortSignal.timeout(TG_TIMEOUT_MS),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error(`[Telegram] sendMediaGroup failed: ${res.status} ${err}`);
    return { message_ids: [] };
  }
  const data = await res.json();
  const ids = (data.result ?? []).map((m: { message_id: number }) => m.message_id);
  return { message_ids: ids };
}

/** Send a photo with caption and optional inline keyboard */
export async function sendPhoto(
  chatId: number | string,
  photoUrl: string,
  caption: string,
  buttons?: Array<Array<{ text: string; callback_data: string }>>
): Promise<{ message_id?: number }> {
  const token = getBotToken();
  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoUrl,
      caption,
      ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
    }),
    signal: AbortSignal.timeout(TG_TIMEOUT_MS),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error(`[Telegram] sendPhoto failed: ${res.status} ${err}`);
    return {};
  }
  const data = await res.json();
  return { message_id: data.result?.message_id };
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

// ============================================================================
// PIPELINE NOTIFICATION FUNCTIONS
// ============================================================================

/**
 * Send Telegram notification (pipeline/cron alerts).
 *
 * Parse mode is HTML (audit 2026-07-07, P2) - callers format with <b>/<code>/
 * <a href> and MUST escape interpolated values with escapeHtml(). The old
 * Markdown mode rendered escTg backslashes as visible text and could
 * parse-fail silently on unescaped user data.
 *
 * Pass { critical: true } for ALARM-class notifications (cron failures,
 * watchdog, deliverability): if the Telegram send fails for any reason the
 * message falls back to a Resend email (audit I3) so alarms never vanish
 * silently.
 */
export async function sendTelegramNotification(
  chatId: string,
  message: string,
  options?: { parseMode?: "HTML" | "Markdown"; critical?: boolean }
): Promise<{ success: boolean; message_id?: number }> {
  const parseMode = options?.parseMode ?? "HTML";
  let failReason = "";

  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.warn("[telegram] TELEGRAM_BOT_TOKEN not set, skipping notification");
      failReason = "TELEGRAM_BOT_TOKEN not set";
    } else {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: parseMode,
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(TG_TIMEOUT_MS),
      });

      const data = await response.json().catch(() => null);

      if (response.ok && data?.ok) {
        return { success: true, message_id: data.result?.message_id };
      }
      failReason = `HTTP ${response.status}: ${JSON.stringify(data).slice(0, 300)}`;
      console.error("[telegram] Send error:", failReason);
    }
  } catch (error) {
    failReason = error instanceof Error ? error.message : String(error);
    console.error("[telegram] Error:", error);
  }

  // Critical alarms fall back to email when Telegram is down/misconfigured.
  if (options?.critical) {
    try {
      const { sendCriticalAlertEmail } = await import("./email");
      const plainText = message.replace(/<[^>]+>/g, "");
      await sendCriticalAlertEmail(
        "Telegram alert delivery failed",
        `Telegram send failed (${failReason}). Original alert:\n\n${plainText}`
      );
      console.warn("[telegram] Critical alert fell back to email");
    } catch (emailErr) {
      console.error("[telegram] Email fallback ALSO failed:", emailErr);
    }
  }

  return { success: false };
}

/**
 * Format "concepts ready" notification
 */
export function formatConceptsReadyMessage(
  batchId: string,
  count: number,
  product: string,
  markets: string[]
): string {
  return `
✅ ${count} new concepts ready for review!

${escapeHtml(product)} • ${escapeHtml(markets.join(" + "))} markets

👉 Review now: ${process.env.NEXT_PUBLIC_APP_URL}/pipeline
  `.trim();
}

/**
 * Format "images complete" notification
 */
export function formatImagesCompleteMessage(
  conceptNumber: number,
  conceptName: string,
  imageCount: number
): string {
  return `
🎨 Concept #${conceptNumber} images ready!

"${escapeHtml(conceptName)}"
✅ ${imageCount} images generated

Next steps:
• Assign landing page
• Add to Meta queue

👉 Review: ${process.env.NEXT_PUBLIC_APP_URL}/pipeline
  `.trim();
}
