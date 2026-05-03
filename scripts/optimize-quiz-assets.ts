/**
 * Optimize quiz-assets in Supabase Storage to WebP.
 *
 * Workflow per file in `quiz-assets/<workspace>/`:
 *   1. Skip if already .webp / .svg / non-image
 *   2. Skip if a `.webp` sibling already exists AND source hasn't changed
 *      (compared via SHA1 stored in Supabase Storage metadata field
 *      `original_sha1` on the .webp file)
 *   3. Download original → sharp.webp({ quality: 82 }) → upload as
 *      `<basename>.webp` (keeps original PNG/JPG intact for safety)
 *   4. Stamp the new .webp with `original_sha1` metadata
 *
 * Designed to be idempotent - runs every quiz publish, only does work when
 * something changed. Safe to re-run.
 *
 * Usage:
 *   npx --yes -p dotenv-cli@7 dotenv -e .env.local -- \
 *     npx --yes tsx scripts/optimize-quiz-assets.ts [workspace-slug]
 *
 * Default workspace: `doginwork-valpakademin`
 */
import sharp from "sharp";

const SUPABASE_URL = "https://fbpefeqqqfrcmfmjmeij.supabase.co";
const BUCKET = "translated-images";
const WORKSPACE = process.argv[2] ?? "doginwork-valpakademin";
const PREFIX = `quiz-assets/${WORKSPACE}`;
const QUALITY = 82; // sharp default is 80; 82 = good balance for photos+graphics

const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY not set");
  process.exit(1);
}

interface BucketFile {
  name: string;
  updated_at: string;
  metadata: { size: number; mimetype: string };
}

async function listFiles(prefix: string): Promise<BucketFile[]> {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        apikey: KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefix, limit: 500 }),
    },
  );
  if (!res.ok) throw new Error(`list failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function downloadFile(path: string): Promise<Buffer> {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
    { headers: { Authorization: `Bearer ${KEY}`, apikey: KEY! } },
  );
  if (!res.ok) throw new Error(`download ${path} failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function uploadFile(
  path: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        apikey: KEY!,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: new Uint8Array(buffer),
    },
  );
  if (!res.ok)
    throw new Error(`upload ${path} failed: ${res.status} ${await res.text()}`);
}

async function main() {
  console.log(`Optimizing ${PREFIX}/ → WebP @ q${QUALITY}\n`);

  const files = await listFiles(PREFIX);
  const byName = new Map(files.map((f) => [f.name, f]));

  let totalSavedBytes = 0;
  let convertedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const { name } = file;
    const ext = name.split(".").pop()?.toLowerCase();

    // Skip non-rastors and already-webp files
    if (!ext || !["png", "jpg", "jpeg"].includes(ext)) {
      continue;
    }

    const baseName = name.replace(/\.(png|jpe?g)$/i, "");
    const webpName = `${baseName}.webp`;
    const sourcePath = `${PREFIX}/${name}`;
    const webpPath = `${PREFIX}/${webpName}`;

    // Skip if .webp sibling exists AND was uploaded AFTER source.
    // Supabase doesn't reliably persist custom metadata via x-metadata-* headers,
    // so we use list-API timestamps instead. If source is replaced (newer
    // updated_at), webp.updated_at < source.updated_at → re-convert.
    const existingWebp = byName.get(webpName);
    if (existingWebp) {
      const sourceMs = new Date(file.updated_at).getTime();
      const webpMs = new Date(existingWebp.updated_at).getTime();
      if (webpMs >= sourceMs) {
        console.log(`  SKIP ${name} (webp up-to-date)`);
        skippedCount++;
        continue;
      }
    }

    // Download + convert + upload
    const sourceBuffer = await downloadFile(sourcePath);
    const webpBuffer = await sharp(sourceBuffer)
      .webp({ quality: QUALITY, effort: 6 })
      .toBuffer();

    const originalSize = sourceBuffer.length;
    const newSize = webpBuffer.length;
    const saved = originalSize - newSize;
    const savedPct = ((saved / originalSize) * 100).toFixed(0);

    await uploadFile(webpPath, webpBuffer, "image/webp");

    totalSavedBytes += saved;
    convertedCount++;
    console.log(
      `  CONV ${name.padEnd(40)} ${(originalSize / 1024).toFixed(0)}kb → ${(newSize / 1024).toFixed(0)}kb (-${savedPct}%)`,
    );
  }

  console.log(
    `\n${convertedCount} converted, ${skippedCount} skipped, saved ${(totalSavedBytes / 1024 / 1024).toFixed(2)} MB`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
