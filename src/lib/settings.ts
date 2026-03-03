import { Language, AspectRatio } from "@/types";

export interface Settings {
  // Static ads
  static_ads_quality_enabled?: boolean;
  static_ads_economy_mode?: boolean;
  static_ads_quality_threshold?: number;
  static_ads_default_languages?: Language[];
  static_ads_default_ratios?: AspectRatio[];
  static_ads_max_retries?: number;
  static_ads_auto_export?: boolean;
  static_ads_email_enabled?: boolean;
  static_ads_notification_email?: string;
  // Pages
  pages_quality_enabled?: boolean;
  pages_quality_threshold?: number;
  // Meta
  meta_default_daily_budget?: number;
  meta_default_objective?: string;
  meta_default_schedule_time?: string; // HH:mm format, e.g. "06:00"
  // Analytics (injected into all published pages)
  ga4_measurement_ids?: Record<string, string>; // per-language GA4 measurement IDs, e.g. { sv: "G-xxx", da: "G-xxx" }
  ga4_property_ids?: Record<string, string>; // per-language GA4 property IDs (numeric), e.g. { sv: "123456789" }
  clarity_project_id?: string; // Microsoft Clarity project ID (legacy, single global)
  clarity_project_ids?: Record<string, string>; // per-language Clarity project IDs, e.g. { sv: "xxx", da: "yyy", no: "zzz" }
  clarity_api_token?: string; // Clarity Data Export API token
  shopify_domains?: string; // comma-separated store domains for UTM link tagging
}

export function getSettings(): Settings {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem("content-hub-settings") || "{}");
  } catch {
    return {};
  }
}

export function getDefaultLanguages(): Language[] {
  const settings = getSettings();
  if (settings.static_ads_default_languages?.length) {
    return settings.static_ads_default_languages;
  }
  return ["sv", "da", "no", "de"];
}

export function getPageQualitySettings(): { enabled: boolean; threshold: number } {
  const settings = getSettings();
  return {
    enabled: settings.pages_quality_enabled ?? true,
    threshold: settings.pages_quality_threshold ?? 85,
  };
}
