import JSZip from "jszip";
import { ImageJob, LANGUAGES } from "@/types";

export async function exportJobAsZip(job: ImageJob): Promise<void> {
  const zip = new JSZip();
  const sourceImages = job.source_images ?? [];

  for (const si of sourceImages) {
    for (const t of si.image_translations ?? []) {
      if (t.status === "completed" && t.translated_url) {
        try {
          const imgRes = await fetch(t.translated_url);
          const blob = await imgRes.blob();
          const langLabel = LANGUAGES.find((l) => l.value === t.language)?.label ?? t.language;
          const filename = si.filename || `${si.id}.png`;
          const ratioFolder = t.aspect_ratio && t.aspect_ratio !== "1:1" ? `${t.aspect_ratio}/` : "";
          zip.file(`${langLabel}/${ratioFolder}${filename}`, blob);
        } catch {
          // Skip failed downloads
        }
      }
    }
  }

  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${job.name}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
