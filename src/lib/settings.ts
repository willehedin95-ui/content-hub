import { Language } from "@/types";

export interface Settings {
  // Static ads
  static_ads_quality_enabled?: boolean;
  static_ads_economy_mode?: boolean;
  static_ads_quality_threshold?: number;
  static_ads_default_languages?: Language[];
  static_ads_email_enabled?: boolean;
  static_ads_notification_email?: string;
  // Pages
  pages_quality_enabled?: boolean;
  pages_quality_threshold?: number;
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
