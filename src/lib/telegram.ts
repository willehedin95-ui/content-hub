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
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error(`[Telegram] editMessageText failed: ${res.status} ${err}`);
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

// ============================================================================
// PIPELINE NOTIFICATION FUNCTIONS
// ============================================================================

/**
 * Send Telegram notification (pipeline-specific)
 */
export async function sendTelegramNotification(
  chatId: string,
  message: string,
  parseMode: "Markdown" | "HTML" = "Markdown"
): Promise<{ success: boolean; message_id?: number }> {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.warn("[telegram] TELEGRAM_BOT_TOKEN not set, skipping notification");
      return { success: false };
    }

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[telegram] Send error:", data);
      return { success: false };
    }

    return { success: true, message_id: data.result.message_id };
  } catch (error) {
    console.error("[telegram] Error:", error);
    return { success: false };
  }
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

${product} • ${markets.join(" + ")} markets

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

"${conceptName}"
✅ ${imageCount} images generated

Next steps:
• Assign landing page
• Add to Meta queue

👉 Review: ${process.env.NEXT_PUBLIC_APP_URL}/pipeline
  `.trim();
}
