// Client-side: shrink an image before it is POSTed to an API route.
//
// Vercel rejects request bodies over 4.5 MB before our route runs, so the page
// only sees a bare "Failed to upload image". A pasted Retina screenshot is an
// uncompressed PNG and easily goes over. Images already small enough are sent
// untouched.
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_SIDE = 2048;

export async function shrinkForUpload(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const longest = Math.max(bitmap.width, bitmap.height);
  if (file.size <= MAX_BYTES && longest <= MAX_SIDE) {
    bitmap.close();
    return file;
  }
  const scale = Math.min(1, MAX_SIDE / longest);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  // White under transparent pixels - JPEG has no alpha and would turn them black.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  if (!blob) return file;
  const base = (file.name || "image").replace(/\.[^.]+$/, "");
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}
