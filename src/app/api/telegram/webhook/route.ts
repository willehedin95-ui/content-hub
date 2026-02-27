import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import {
  sendMessage,
  downloadFile,
  validateWebhookSecret,
  extractUrls,
  detectPlatform,
  formatCashSummary,
} from "@/lib/telegram";
import { runCashAnalysis } from "./cash-analysis";
import { scrapePost } from "./scrape";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  // Validate webhook secret
  const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
  if (!validateWebhookSecret(secretHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = await req.json().catch(() => null);
  if (!update?.message) {
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  const chatId = message.chat.id;
  const messageId = message.message_id?.toString();

  const db = createServerSupabase();
  const hubBaseUrl =
    process.env.APP_URL || "https://content-hub-nine-theta.vercel.app";

  try {
    // --- Screenshot path: message has photo ---
    if (message.photo && message.photo.length > 0) {
      await sendMessage(chatId, "Got it! Analyzing screenshot...");

      // Get largest photo (last in array)
      const photo = message.photo[message.photo.length - 1];
      const { buffer, mimeType } = await downloadFile(photo.file_id);

      // Upload to Supabase Storage
      const filename = `saved-ads/${Date.now()}-${photo.file_id}.jpg`;
      const { error: uploadErr } = await db.storage
        .from("translated-images")
        .upload(filename, buffer, { contentType: mimeType, upsert: true });

      if (uploadErr) {
        console.error("[Telegram] Storage upload failed:", uploadErr);
        await sendMessage(chatId, "Failed to save image. Please try again.");
        return NextResponse.json({ ok: true });
      }

      const { data: publicUrl } = db.storage
        .from("translated-images")
        .getPublicUrl(filename);

      const mediaUrl = publicUrl.publicUrl;
      const userNotes = message.caption || null;

      // Insert saved ad
      const { data: savedAd, error: insertErr } = await db
        .from("saved_ads")
        .insert({
          source_platform: "unknown",
          media_url: mediaUrl,
          media_type: "image",
          thumbnail_url: mediaUrl,
          user_notes: userNotes,
          telegram_message_id: messageId,
        })
        .select()
        .single();

      if (insertErr || !savedAd) {
        console.error("[Telegram] Insert failed:", insertErr);
        await sendMessage(chatId, "Failed to save ad. Please try again.");
        return NextResponse.json({ ok: true });
      }

      // Run CASH analysis
      const analysis = await runCashAnalysis(
        db,
        savedAd.id,
        mediaUrl,
        null,
        userNotes
      );

      if (analysis) {
        const hubUrl = `${hubBaseUrl}/saved-ads?id=${savedAd.id}`;
        await sendMessage(chatId, formatCashSummary(analysis, hubUrl));
      } else {
        await sendMessage(
          chatId,
          `Saved! Analysis failed — you can re-analyze from the Hub.\n\n${hubBaseUrl}/saved-ads?id=${savedAd.id}`
        );
      }

      return NextResponse.json({ ok: true });
    }

    // --- URL path: message has URL in text ---
    const text = message.text || message.caption || "";
    const urls = extractUrls(text);

    if (urls.length > 0) {
      const url = urls[0]; // Take the first URL
      const platform = detectPlatform(url);

      await sendMessage(
        chatId,
        `Got it! Scraping ${platform !== "unknown" ? platform : "post"}...`
      );

      // Scrape the post
      const scraped = await scrapePost(url, platform);

      // Upload media to Supabase Storage if we got a media URL
      let storedMediaUrl = scraped.media_url;
      if (scraped.media_url && scraped.media_type === "image") {
        try {
          const imgRes = await fetch(scraped.media_url);
          if (imgRes.ok) {
            const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
            const ext = scraped.media_url.includes(".png") ? "png" : "jpg";
            const filename = `saved-ads/${Date.now()}-scraped.${ext}`;
            await db.storage
              .from("translated-images")
              .upload(filename, imgBuffer, {
                contentType: `image/${ext === "png" ? "png" : "jpeg"}`,
                upsert: true,
              });
            const { data: pub } = db.storage
              .from("translated-images")
              .getPublicUrl(filename);
            storedMediaUrl = pub.publicUrl;
          }
        } catch (e) {
          console.error("[Telegram] Image re-upload failed:", e);
          // Keep original URL as fallback
        }
      }

      // Extract user notes (text minus the URL)
      const userNotes = text.replace(url, "").trim() || null;

      // Insert saved ad
      const { data: savedAd, error: insertErr } = await db
        .from("saved_ads")
        .insert({
          source_url: url,
          source_platform: platform,
          media_url: storedMediaUrl,
          media_type: scraped.media_type,
          thumbnail_url: scraped.thumbnail_url || storedMediaUrl,
          headline: scraped.headline,
          body: scraped.body,
          destination_url: scraped.destination_url,
          brand_name: scraped.brand_name,
          user_notes: userNotes,
          telegram_message_id: messageId,
          raw_scrape_data: scraped.raw_data,
        })
        .select()
        .single();

      if (insertErr || !savedAd) {
        console.error("[Telegram] Insert failed:", insertErr);
        await sendMessage(chatId, "Failed to save ad. Please try again.");
        return NextResponse.json({ ok: true });
      }

      // Run CASH analysis (only for images)
      if (scraped.media_type === "image" && storedMediaUrl) {
        const analysis = await runCashAnalysis(
          db,
          savedAd.id,
          storedMediaUrl,
          {
            headline: scraped.headline,
            body: scraped.body,
            brand: scraped.brand_name,
          },
          userNotes
        );

        if (analysis) {
          const hubUrl = `${hubBaseUrl}/saved-ads?id=${savedAd.id}`;
          await sendMessage(chatId, formatCashSummary(analysis, hubUrl));
        } else {
          await sendMessage(
            chatId,
            `Saved! Analysis failed — you can re-analyze from the Hub.\n\n${hubBaseUrl}/saved-ads?id=${savedAd.id}`
          );
        }
      } else {
        const hubUrl = `${hubBaseUrl}/saved-ads?id=${savedAd.id}`;
        await sendMessage(
          chatId,
          `Saved!${scraped.media_type === "video" ? " Video ads can't be auto-analyzed yet." : ""}\n\nView in Hub: ${hubUrl}`
        );
      }

      return NextResponse.json({ ok: true });
    }

    // --- No URL and no photo — just text ---
    await sendMessage(
      chatId,
      "Send me an ad URL (Instagram or Facebook) or a screenshot to save it."
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Telegram] Webhook error:", err);
    await sendMessage(chatId, "Something went wrong. Please try again.").catch(
      () => {}
    );
    return NextResponse.json({ ok: true });
  }
}
