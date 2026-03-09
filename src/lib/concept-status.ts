import { ImageJob, Language, MetaCampaignStatus } from "@/types";

// --- Shared constants ---

export const COUNTRY_FLAGS: Record<string, string> = {
  SE: "\u{1F1F8}\u{1F1EA}",
  NO: "\u{1F1F3}\u{1F1F4}",
  DK: "\u{1F1E9}\u{1F1F0}",
  DE: "\u{1F1E9}\u{1F1EA}",
};

// --- Types ---

export interface LanguageStatusInfo {
  status: "done" | "partial" | "none";
  completed: number;
  total: number;
}

export interface WizardStep {
  step: number;
  label: string;
  color: string;
}

/**
 * Minimal shape needed by getDashboardStep.
 * The dashboard server component uses a lightweight query that returns
 * `meta_campaigns` instead of `deployments`, so we accept either shape.
 */
export interface ConceptRowLike {
  status?: string;
  completed_translations?: number | null;
  total_translations?: number | null;
  ad_copy_primary?: string[] | null;
  landing_page_id?: string | null;
  marked_ready_at?: string | null;
  meta_campaigns?: Array<{ id: string; status: string }>;
}

// --- Functions ---

/**
 * Per-language translation status for a concept.
 * Returns completed/total counts alongside a summary status string.
 */
export function getLanguageStatus(
  job: ImageJob
): Map<Language, LanguageStatusInfo> {
  const langCounts = new Map<Language, { total: number; completed: number }>();
  for (const si of job.source_images ?? []) {
    for (const t of si.image_translations ?? []) {
      const entry = langCounts.get(t.language) ?? { total: 0, completed: 0 };
      entry.total++;
      if (t.status === "completed") entry.completed++;
      langCounts.set(t.language, entry);
    }
  }
  const result = new Map<Language, LanguageStatusInfo>();
  for (const lang of job.target_languages) {
    const counts = langCounts.get(lang);
    if (!counts || counts.total === 0)
      result.set(lang, { status: "none", completed: 0, total: 0 });
    else if (counts.completed === counts.total)
      result.set(lang, {
        status: "done",
        completed: counts.completed,
        total: counts.total,
      });
    else
      result.set(lang, {
        status: "partial",
        completed: counts.completed,
        total: counts.total,
      });
  }
  return result;
}

/**
 * Per-country Meta deployment status for a concept.
 * If multiple deployments exist for the same country, prefers
 * "pushed" > "pushing" > "error" > "draft".
 */
export function getMarketStatus(
  job: ImageJob
): Map<string, MetaCampaignStatus> {
  const result = new Map<string, MetaCampaignStatus>();
  for (const d of job.deployments ?? []) {
    // If multiple deployments for same country, prefer "pushed" > "pushing" > "error" > "draft"
    const existing = result.get(d.country);
    if (
      !existing ||
      d.status === "pushed" ||
      (d.status === "pushing" && existing !== "pushed")
    ) {
      result.set(d.country, d.status);
    }
  }
  return result;
}

/**
 * Wizard step / overall status for a concept (used in images table & kanban board).
 * Returns step number (0-3), human-readable label, and Tailwind color classes.
 */
export function getWizardStep(job: ImageJob): WizardStep {
  if (job.status === "draft")
    return { step: 0, label: "Importing", color: "text-gray-500 bg-gray-100" };

  const hasPushed = job.deployments?.some((d) => d.status === "pushed");
  if (hasPushed)
    return {
      step: 3,
      label: "Published",
      color: "text-emerald-700 bg-emerald-50",
    };

  if (job.marked_ready_at)
    return { step: 3, label: "Ready", color: "text-teal-700 bg-teal-50" };

  const completed = job.completed_translations ?? 0;
  const total = job.total_translations ?? 0;
  const imagesComplete = total > 0 && completed === total;

  if (!imagesComplete) {
    if (completed > 0)
      return {
        step: 1,
        label: "Step 1/3 \u00B7 Images",
        color: "text-amber-700 bg-amber-50",
      };
    if (job.status === "ready")
      return {
        step: 1,
        label: "Step 1/3 \u00B7 Images",
        color: "text-gray-600 bg-gray-100",
      };
    return { step: 0, label: "New", color: "text-gray-500 bg-gray-100" };
  }

  // Images done — check ad copy
  const hasPrimary = (job.ad_copy_primary ?? []).some((t: string) => t.trim());
  const hasLanding = !!job.landing_page_id;
  // We don't have ad_copy_translations at list level easily, but check if concept is at step 3
  const hasDeployments = (job.deployments?.length ?? 0) > 0;
  if (hasDeployments)
    return {
      step: 3,
      label: "Step 3/3 \u00B7 Preview",
      color: "text-blue-700 bg-blue-50",
    };

  if (hasPrimary && hasLanding)
    return {
      step: 3,
      label: "Step 3/3 \u00B7 Preview",
      color: "text-indigo-700 bg-indigo-50",
    };

  return {
    step: 2,
    label: "Step 2/3 \u00B7 Ad Copy",
    color: "text-indigo-700 bg-indigo-50",
  };
}

/**
 * Backwards-compat wrapper — returns just label + color from getWizardStep.
 */
export function getOverallStatus(job: ImageJob): { label: string; color: string } {
  const ws = getWizardStep(job);
  return { label: ws.label, color: ws.color };
}

/**
 * Lightweight step derivation for the dashboard server component.
 * The dashboard queries `meta_campaigns` (not `deployments`), so this
 * function accepts a minimal shape instead of a full ImageJob.
 */
export function getDashboardStep(
  job: ConceptRowLike
): "images" | "ad-copy" | "preview" | "ready" | "published" {
  const hasPushed = job.meta_campaigns?.some((d) => d.status === "pushed");
  if (hasPushed) return "published";
  if (job.marked_ready_at) return "ready";
  const completed = job.completed_translations ?? 0;
  const total = job.total_translations ?? 0;
  const imagesComplete = total > 0 && completed === total;
  if (!imagesComplete) return "images";
  const hasPrimary = (job.ad_copy_primary ?? []).some((t: string) => t.trim());
  const hasLanding = !!job.landing_page_id;
  if (hasPrimary && hasLanding) return "preview";
  return "ad-copy";
}

/**
 * Get a thumbnail URL for a concept.
 * Prefers the first completed translated image, falls back to original source image URL.
 */
export function getConceptThumbnail(job: ImageJob): string | null {
  const sourceImages = job.source_images;
  if (!sourceImages?.length) return null;

  for (const si of sourceImages) {
    for (const t of si.image_translations ?? []) {
      if (t.status === "completed" && t.translated_url) {
        return t.translated_url;
      }
    }
  }

  return sourceImages[0]?.original_url ?? null;
}
