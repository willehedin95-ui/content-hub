import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import sharp from "sharp";
import {
  sendMessage,
  downloadFile,
  validateWebhookSecret,
  extractUrls,
  detectPlatform,
  answerCallbackQuery,
  editMessageText,
} from "@/lib/telegram";
import { getCampaignBudget, updateCampaign, listCampaigns } from "@/lib/meta";

export const maxDuration = 120;

interface AnalyzeResult {
  croppedBuffer: Buffer;
  brandName: string | null;
  platform: "instagram" | "facebook" | "unknown";
  adText: string | null;
}

/**
 * Use OpenAI vision to analyze a screenshot:
 * 1. Detect the ad creative area and crop it
 * 2. Extract the brand/account name
 * 3. Detect the platform (Instagram/Facebook)
 * 4. Extract any visible ad text/headline
 */
async function analyzeAndCropScreenshot(buffer: Buffer): Promise<AnalyzeResult> {
  const fallback: AnalyzeResult = {
    croppedBuffer: buffer,
    brandName: null,
    platform: "unknown",
    adText: null,
  };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback;

  try {
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (!width || !height) return fallback;

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
                text: `This is a screenshot of a social media ad. Analyze it and return a JSON object with:

1. "crop" — coordinates to crop ONLY the ad creative image/visual (remove app UI: status bar, navigation, username header, like/comment buttons, caption text). Use percentages (0-100) of image dimensions: {"top": number, "left": number, "width": number, "height": number}

2. "brand_name" — the account/brand name visible in the post header (e.g. "Nike", "Travel lover"). Return null if not visible.

3. "platform" — "instagram" or "facebook" based on the app UI. Return "unknown" if unclear.

4. "ad_text" — the main ad copy/caption text visible in the screenshot. Return null if not visible or too small to read.

Example: {"crop": {"top": 12, "left": 0, "width": 100, "height": 55}, "brand_name": "Nike", "platform": "instagram", "ad_text": "Just Do It. Shop now."}`,
              },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${base64}` },
              },
            ],
          },
        ],
        max_tokens: 300,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      console.error("[Analyze] OpenAI API error:", res.status);
      return fallback;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return fallback;

    const result = JSON.parse(content);

    // Crop the image
    let croppedBuffer = buffer;
    const crop = result.crop;
    if (crop) {
      const cropTop = Math.round((crop.top / 100) * height);
      const cropLeft = Math.round((crop.left / 100) * width);
      const cropWidth = Math.round((crop.width / 100) * width);
      const cropHeight = Math.round((crop.height / 100) * height);

      if (
        cropWidth >= 50 &&
        cropHeight >= 50 &&
        cropLeft + cropWidth <= width &&
        cropTop + cropHeight <= height
      ) {
        croppedBuffer = await sharp(buffer)
          .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
          .jpeg({ quality: 90 })
          .toBuffer();
      }
    }

    return {
      croppedBuffer,
      brandName: result.brand_name || null,
      platform: result.platform === "instagram" || result.platform === "facebook"
        ? result.platform
        : "unknown",
      adText: result.ad_text || null,
    };
  } catch (err) {
    console.error("[Analyze] Failed:", err);
    return fallback;
  }
}

export async function POST(req: NextRequest) {
  // Validate webhook secret
  const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
  if (!validateWebhookSecret(secretHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = await req.json().catch(() => null);

  // --- Callback query handler (inline keyboard button presses) ---
  if (update?.callback_query) {
    return handleCallbackQuery(update.callback_query);
  }

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
      const { buffer } = await downloadFile(photo.file_id);

      // Analyze screenshot: auto-crop + extract brand name, platform, ad text
      const { croppedBuffer, brandName, platform: detectedPlatform, adText } =
        await analyzeAndCropScreenshot(buffer);

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
      const captionPlatform = sourceUrl ? detectPlatform(sourceUrl) : null;
      // Prefer platform from URL detection, fall back to vision detection
      const platform = captionPlatform || detectedPlatform;
      const userNotes = sourceUrl
        ? caption.replace(sourceUrl, "").trim() || null
        : caption || null;

      // Insert saved ad with extracted metadata
      const { data: savedAd, error: insertErr } = await db
        .from("saved_ads")
        .insert({
          source_url: sourceUrl,
          source_platform: platform,
          media_url: mediaUrl,
          media_type: "image",
          thumbnail_url: mediaUrl,
          brand_name: brandName,
          body: adText,
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
      const brandLabel = brandName ? ` (${brandName})` : "";
      await sendMessage(chatId, `Saved${brandLabel}!\n\nView in Hub: ${hubUrl}`);
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

// --- Callback query handler for inline keyboard buttons ---
interface CallbackQuery {
  id: string;
  from: { id: number };
  message?: { chat: { id: number }; message_id: number; text?: string };
  data?: string;
}

async function handleCallbackQuery(query: CallbackQuery): Promise<NextResponse> {
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;
  const data = query.data;

  if (!chatId || !messageId || !data) {
    await answerCallbackQuery(query.id);
    return NextResponse.json({ ok: true });
  }

  try {
    if (data === "budget_apply_all") {
      await answerCallbackQuery(query.id, "Applying budget shifts...");
      await applyBudgetShifts(chatId, messageId);
    } else if (data === "budget_skip") {
      await answerCallbackQuery(query.id, "Budget shifts skipped");
      await editMessageText(chatId, messageId, "⚡ Budget shifts — skipped.");
    } else if (data === "graduate_all") {
      await answerCallbackQuery(query.id, "Graduating winners...");
      await graduateWinners(chatId, messageId);
    } else if (data === "graduate_skip") {
      await answerCallbackQuery(query.id, "Winner graduation skipped");
      await editMessageText(chatId, messageId, "⭐ Winner graduation — skipped.");
    } else {
      await answerCallbackQuery(query.id);
    }
  } catch (err) {
    console.error("[Telegram] Callback query error:", err);
    await answerCallbackQuery(query.id, "Something went wrong");
    await sendMessage(chatId, `Error applying budget shifts: ${err instanceof Error ? err.message : "Unknown error"}`);
  }

  return NextResponse.json({ ok: true });
}

async function applyBudgetShifts(chatId: number, messageId: number): Promise<void> {
  // Fetch current efficiency recommendations
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://content-hub-nine-theta.vercel.app";
  const cronSecret = process.env.CRON_SECRET;
  const briefRes = await fetch(`${baseUrl}/api/morning-brief`, {
    headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
  });

  if (!briefRes.ok) {
    await editMessageText(chatId, messageId, "⚡ Budget shifts — failed to fetch data.");
    return;
  }

  const briefData = await briefRes.json();
  const scoring: Array<{
    campaign_id: string;
    campaign_name: string;
    current_budget_share: number;
    recommended_budget_share: number;
    recommendation: string;
  }> = briefData.signals?.efficiency_scoring ?? [];

  const shifts = scoring.filter((s) => s.recommendation !== "maintain");
  if (shifts.length === 0) {
    await editMessageText(chatId, messageId, "⚡ No budget shifts needed — all campaigns are balanced.");
    return;
  }

  // Get current campaign budgets from Meta
  const campaigns = await listCampaigns();
  const budgetsBefore: Map<string, { name: string; daily_budget: number }> = new Map();
  for (const c of campaigns) {
    try {
      const info = await getCampaignBudget(c.id);
      // Meta returns daily_budget in cents
      budgetsBefore.set(c.id, { name: info.name, daily_budget: Number(info.daily_budget) });
    } catch {
      // Campaign might not have a daily budget (lifetime budget or CBO)
    }
  }

  if (budgetsBefore.size === 0) {
    await editMessageText(chatId, messageId, "⚡ Budget shifts — no campaign budgets found (might be CBO at ad set level).");
    return;
  }

  // Calculate total daily budget
  const totalBudget = Array.from(budgetsBefore.values()).reduce((s, c) => s + c.daily_budget, 0);

  // Apply new budgets based on recommended shares
  const results: string[] = [];
  for (const s of scoring) {
    const current = budgetsBefore.get(s.campaign_id);
    if (!current) continue;

    const newBudget = Math.round((s.recommended_budget_share / 100) * totalBudget);
    if (newBudget === current.daily_budget) continue;

    try {
      // Meta API expects budget in cents (string)
      await updateCampaign(s.campaign_id, { daily_budget: String(newBudget) });
      const oldUsd = (current.daily_budget / 100).toFixed(0);
      const newUsd = (newBudget / 100).toFixed(0);
      const icon = s.recommendation === "increase" ? "↑" : "↓";
      results.push(`  ${icon} ${s.campaign_name}: $${oldUsd}/d → $${newUsd}/d`);
      await new Promise((r) => setTimeout(r, 500)); // Rate limiting
    } catch (err) {
      results.push(`  ❌ ${s.campaign_name}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  if (results.length === 0) {
    await editMessageText(chatId, messageId, "⚡ Budget shifts — no changes needed (budgets already match recommendations).");
    return;
  }

  await editMessageText(
    chatId,
    messageId,
    `✅ Budget shifts applied:\n\n${results.join("\n")}\n\nTotal daily budget: $${(totalBudget / 100).toFixed(0)}/d`
  );
}

async function graduateWinners(chatId: number, messageId: number): Promise<void> {
  // Fetch current consistent winners from morning brief
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://content-hub-nine-theta.vercel.app";
  const cronSecret = process.env.CRON_SECRET;
  const briefRes = await fetch(`${baseUrl}/api/morning-brief`, {
    headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
  });

  if (!briefRes.ok) {
    await editMessageText(chatId, messageId, "⭐ Winner graduation — failed to fetch data.");
    return;
  }

  const briefData = await briefRes.json();
  const winners: Array<{
    ad_id: string;
    adset_id: string | null;
    ad_name: string | null;
    campaign_name: string | null;
    consistent_days: number;
    avg_roas: number;
  }> = briefData.signals?.consistent_winners ?? [];

  if (winners.length === 0) {
    await editMessageText(chatId, messageId, "⭐ No consistent winners to graduate right now.");
    return;
  }

  // For each winner, increase its ad set's daily budget by 20%
  const results: string[] = [];
  const seenAdSets = new Set<string>();

  for (const w of winners) {
    if (!w.adset_id || seenAdSets.has(w.adset_id)) continue;
    seenAdSets.add(w.adset_id);

    try {
      // Fetch current ad set budget
      const adsetInfo = await metaFetchAdSetBudget(w.adset_id);
      if (!adsetInfo.daily_budget || Number(adsetInfo.daily_budget) === 0) {
        results.push(`  ℹ️ ${w.ad_name || "Unnamed"}: ad set has no daily budget (CBO campaign)`);
        continue;
      }

      const currentBudget = Number(adsetInfo.daily_budget);
      const newBudget = Math.round(currentBudget * 1.2); // +20%
      await updateAdSetBudget(w.adset_id, newBudget);

      const oldUsd = (currentBudget / 100).toFixed(0);
      const newUsd = (newBudget / 100).toFixed(0);
      results.push(`  🚀 ${w.ad_name || "Unnamed"}: $${oldUsd}/d → $${newUsd}/d (+20%)`);
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      results.push(`  ❌ ${w.ad_name || "Unnamed"}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  if (results.length === 0) {
    await editMessageText(chatId, messageId, "⭐ Winner graduation — no ad set budgets to adjust.");
    return;
  }

  await editMessageText(
    chatId,
    messageId,
    `✅ Winners graduated:\n\n${results.join("\n")}`
  );
}

// Lightweight Meta API helpers for the webhook (avoid importing full meta.ts chain for simple queries)
async function metaFetchAdSetBudget(adsetId: string): Promise<{ daily_budget: string; name: string }> {
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) throw new Error("META_SYSTEM_USER_TOKEN not set");
  const res = await fetch(`https://graph.facebook.com/v22.0/${adsetId}?fields=daily_budget,name&access_token=${token}`);
  if (!res.ok) throw new Error(`Meta API error (${res.status})`);
  return res.json();
}

async function updateAdSetBudget(adsetId: string, dailyBudget: number): Promise<void> {
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) throw new Error("META_SYSTEM_USER_TOKEN not set");
  const res = await fetch(`https://graph.facebook.com/v22.0/${adsetId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ daily_budget: String(dailyBudget) }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Meta API error (${res.status}): ${err}`);
  }
}
