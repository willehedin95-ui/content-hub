import { NextRequest, NextResponse } from "next/server";
import { processInvoices } from "@/lib/invoice-mail";
import { sendMessage } from "@/lib/telegram";

export const maxDuration = 60;

function getChatId(): string {
  return process.env.TELEGRAM_NOTIFY_CHAT_ID || "";
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processInvoices();
    console.log("[cron/invoice-check] Result:", result);

    // Send Telegram notification if new invoices found
    const chatId = getChatId();
    if (chatId && (result.forwarded > 0 || result.errors > 0)) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://contenthub.se";
      const parts: string[] = ["<b>Invoice Scanner</b>"];
      if (result.forwarded > 0) {
        parts.push(`${result.forwarded} new invoice${result.forwarded > 1 ? "s" : ""} ready for review`);
      }
      if (result.errors > 0) {
        parts.push(`${result.errors} error${result.errors > 1 ? "s" : ""}`);
      }
      parts.push(`\n<a href="${appUrl}/invoices">Open Invoice Tracker</a>`);
      await sendMessage(chatId, parts.join("\n"), { parse_mode: "HTML" });
    }

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/invoice-check] Error:", msg);

    // Notify on cron failure
    const chatId = getChatId();
    if (chatId) {
      await sendMessage(chatId, `<b>Invoice Check Failed</b>\n${msg}`, { parse_mode: "HTML" }).catch(() => {});
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
