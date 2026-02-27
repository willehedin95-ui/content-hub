import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import sharp from "sharp";
import {
  sendMessage,
  downloadFile,
  validateWebhookSecret,
  extractUrls,
  detectPlatform,
} from "@/lib/telegram";

export const maxDuration = 120;

/**
 * Use OpenAI vision to detect the ad image area in a screenshot,
 * then crop it with sharp. Returns the cropped buffer, or the
 * original buffer if detection fails.
 */
async function autoCropAdImage(buffer: Buffer): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return buffer;

  try {
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (!width || !height) return buffer;

    const base64 = buffer.toString("base64");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `This is a screenshot of a social media ad from Instagram or Facebook. I need to crop just the ad creative image/visual — remove the app UI (status bar, navigation, username header, like/comment buttons, caption text, etc.). Return ONLY a JSON object with the crop coordinates as percentages of the image dimensions: {"top": number, "left": number, "width": number, "height": number} where all values are 0-100 representing percentages. For example {"top": 15, "left": 0, "width": 100, "height": 50} means start at 15% from top, 0% from left, spanning 100% width and 50% height. Focus on the main visual/creative content of the ad only.`,
              },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${base64}` },
              },
            ],
          },
        ],
        max_tokens: 100,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      console.error("[AutoCrop] OpenAI API error:", res.status);
      return buffer;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return buffer;

    const coords = JSON.parse(content);
    const cropTop = Math.round((coords.top / 100) * height);
    const cropLeft = Math.round((coords.left / 100) * width);
    const cropWidth = Math.round((coords.width / 100) * width);
    const cropHeight = Math.round((coords.height / 100) * height);

    // Sanity check
    if (cropWidth < 50 || cropHeight < 50) return buffer;
    if (cropLeft + cropWidth > width) return buffer;
    if (cropTop + cropHeight > height) return buffer;

    return await sharp(buffer)
      .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch (err) {
    console.error("[AutoCrop] Failed:", err);
    return buffer;
  }
}

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
      // Get largest photo (last in array)
      const photo = message.photo[message.photo.length - 1];
      const { buffer, mimeType } = await downloadFile(photo.file_id);

      // Auto-crop to extract just the ad creative
      const croppedBuffer = await autoCropAdImage(buffer);

      // Upload cropped image to Supabase Storage
      const filename = `saved-ads/${Date.now()}-${photo.file_id}.jpg`;
      const { error: uploadErr } = await db.storage
        .from("translated-images")
        .upload(filename, croppedBuffer, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadErr) {
        console.error("[Telegram] Storage upload failed:", uploadErr);
        await sendMessage(chatId, "Failed to save image. Please try again.");
        return NextResponse.json({ ok: true });
      }

      const { data: publicUrl } = db.storage
        .from("translated-images")
        .getPublicUrl(filename);

      const mediaUrl = publicUrl.publicUrl;

      // Check caption for URLs (user might include the ad URL)
      const caption = message.caption || "";
      const captionUrls = extractUrls(caption);
      const sourceUrl = captionUrls[0] || null;
      const platform = sourceUrl ? detectPlatform(sourceUrl) : "unknown";
      const userNotes = sourceUrl
        ? caption.replace(sourceUrl, "").trim() || null
        : caption || null;

      // Insert saved ad
      const { data: savedAd, error: insertErr } = await db
        .from("saved_ads")
        .insert({
          source_url: sourceUrl,
          source_platform: platform,
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

      const hubUrl = `${hubBaseUrl}/saved-ads?id=${savedAd.id}`;
      await sendMessage(chatId, `Saved!\n\nView in Hub: ${hubUrl}`);
      return NextResponse.json({ ok: true });
    }

    // --- URL-only path: save URL without scraping ---
    const text = message.text || message.caption || "";
    const urls = extractUrls(text);

    if (urls.length > 0) {
      const url = urls[0];
      const platform = detectPlatform(url);
      const userNotes = text.replace(url, "").trim() || null;

      const { data: savedAd, error: insertErr } = await db
        .from("saved_ads")
        .insert({
          source_url: url,
          source_platform: platform,
          user_notes: userNotes,
          telegram_message_id: messageId,
        })
        .select()
        .single();

      if (insertErr || !savedAd) {
        console.error("[Telegram] Insert failed:", insertErr);
        await sendMessage(chatId, "Failed to save. Please try again.");
        return NextResponse.json({ ok: true });
      }

      const hubUrl = `${hubBaseUrl}/saved-ads?id=${savedAd.id}`;
      await sendMessage(
        chatId,
        `URL saved! For the best result, send a screenshot of the ad too.\n\nView in Hub: ${hubUrl}`
      );
      return NextResponse.json({ ok: true });
    }

    // --- No URL and no photo ---
    await sendMessage(
      chatId,
      "Send me a screenshot of an ad to save it. You can add the URL as a caption."
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
