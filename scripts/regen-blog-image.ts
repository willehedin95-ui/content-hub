/**
 * Regenerate a single blog image and replace it in Supabase storage.
 * Usage: npx tsx scripts/regen-blog-image.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  const value = trimmed.slice(eqIdx + 1);
  if (!process.env[key]) process.env[key] = value;
}

async function main() {
  const { generateImage } = await import("../src/lib/kie");
  const { createServerSupabase } = await import("../src/lib/supabase-admin");
  const { STORAGE_BUCKET } = await import("../src/lib/constants");

  const db = createServerSupabase();

  const prompt = `A woman lying on her right side on a bed, seen from behind at a slight angle. Her entire body faces the same direction — right side down, left shoulder up. Her head rests sideways on a contoured ergonomic memory foam pillow, with her neck aligned straight with her spine. Rumpled white sheets, a wooden headboard visible in the background. Soft morning window light from the left side, slightly warm. The pillow has a distinctive cervical support curve cradling her neck. She wears a light gray t-shirt. Hair messy across the pillow. Shot slightly off-center from behind and above. iPhone photo, candid, natural light.`;

  console.log("Generating new image via Kie AI...");
  const { urls } = await generateImage(prompt, [], "16:9");
  if (!urls?.length) {
    console.error("No image URLs returned!");
    return;
  }

  console.log("Generated:", urls[0]);

  // Download
  const imageRes = await fetch(urls[0]);
  if (!imageRes.ok) {
    console.error("Failed to download:", imageRes.status);
    return;
  }
  const buffer = Buffer.from(await imageRes.arrayBuffer());
  console.log(`Downloaded: ${(buffer.length / 1024).toFixed(0)}KB`);

  // Upload to Supabase, replacing the old image
  const filePath = "blog/kudde-for-sidosovare/0.png";
  const { error } = await db.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, buffer, { contentType: "image/png", upsert: true });

  if (error) {
    console.error("Upload failed:", error.message);
    return;
  }

  const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
  console.log("Uploaded to:", urlData.publicUrl);
  console.log("\nNow run: npx tsx scripts/republish-blog.ts");
}

main().catch(console.error);
