export type Product = "happysleep" | "hydro13";
export type PageType = "advertorial" | "listicle";
export type Language = "sv" | "da" | "no" | "de";
export type TranslationStatus =
  | "draft"
  | "translating"
  | "translated"
  | "publishing"
  | "published"
  | "error";

export interface Page {
  id: string;
  name: string;
  product: Product;
  page_type: PageType;
  source_url: string;
  original_html: string;
  slug: string;
  created_at: string;
  translations?: Translation[];
}

export interface Translation {
  id: string;
  page_id: string;
  language: Language;
  variant: string;
  translated_html: string | null;
  translated_texts: Record<string, string> | null;
  seo_title: string | null;
  seo_description: string | null;
  slug: string | null;
  status: TranslationStatus;
  published_url: string | null;
  quality_score: number | null;
  quality_analysis: PageQualityAnalysis | null;
  created_at: string;
  updated_at: string;
}

export interface PageQualityAnalysis {
  quality_score: number;
  fluency_issues: string[];
  grammar_issues: string[];
  context_errors: string[];
  name_localization: string[];
  overall_assessment: string;
}

export type ABTestStatus = "draft" | "active" | "completed";

export interface ABTest {
  id: string;
  page_id: string;
  language: Language;
  status: ABTestStatus;
  control_id: string;
  variant_id: string;
  split: number;
  router_url: string | null;
  winner: "control" | "b" | null;
  created_at: string;
  updated_at: string;
}

export const PRODUCTS: { value: Product; label: string }[] = [
  { value: "happysleep", label: "HappySleep" },
  { value: "hydro13", label: "Hydro13" },
];

export const PAGE_TYPES: { value: PageType; label: string }[] = [
  { value: "advertorial", label: "Advertorial" },
  { value: "listicle", label: "Listicle" },
];

export interface UsageLog {
  id: string;
  created_at: string;
  type: "translation" | "image_generation";
  page_id: string | null;
  translation_id: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  metadata: Record<string, unknown>;
}

export const LANGUAGES: {
  value: Language;
  label: string;
  flag: string;
  domain: string;
}[] = [
  {
    value: "sv",
    label: "Swedish",
    flag: "🇸🇪",
    domain: "blog.halsobladet.com",
  },
  { value: "da", label: "Danish", flag: "🇩🇰", domain: "smarthelse.dk" },
  {
    value: "no",
    label: "Norwegian",
    flag: "🇳🇴",
    domain: "helseguiden.com",
  },
  {
    value: "de",
    label: "German",
    flag: "🇩🇪",
    domain: "",
  },
];

// --- Image Aspect Ratios ---

export type AspectRatio = "1:1" | "9:16" | "4:5";

export const ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: "1:1", label: "1:1 Square" },
  { value: "9:16", label: "9:16 Story/Reel" },
  { value: "4:5", label: "4:5 Feed" },
];

// --- Image Translation Types ---

export type ImageJobStatus = "draft" | "processing" | "completed" | "failed";
export type ImageTranslationStatus = "pending" | "processing" | "completed" | "failed";

export interface ImageJob {
  id: string;
  name: string;
  status: ImageJobStatus;
  target_languages: string[];
  target_ratios: AspectRatio[];
  source_folder_id: string | null;
  auto_export: boolean;
  exported_at: string | null;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
  source_images?: SourceImage[];
  total_images?: number;
  total_translations?: number;
  completed_translations?: number;
  failed_translations?: number;
}

export interface SourceImage {
  id: string;
  job_id: string;
  original_url: string;
  filename: string | null;
  processing_order: number | null;
  thumbnail_url: string | null;
  created_at: string;
  image_translations?: ImageTranslation[];
}

export interface ImageTranslation {
  id: string;
  source_image_id: string;
  language: string;
  aspect_ratio: AspectRatio;
  status: ImageTranslationStatus;
  translated_url: string | null;
  error_message: string | null;
  active_version_id: string | null;
  created_at: string;
  updated_at: string;
  versions?: Version[];
}

export interface Version {
  id: string;
  image_translation_id: string;
  version_number: number;
  translated_url: string | null;
  quality_score: number | null;
  quality_analysis: QualityAnalysis | null;
  extracted_text: string | null;
  generation_time_seconds: number | null;
  error_message: string | null;
  corrected_text: string | null;
  visual_instructions: string | null;
  is_active: boolean;
  created_at: string;
}

export interface QualityAnalysis {
  quality_score: number;
  spelling_errors: string[];
  grammar_issues: string[];
  missing_text: string[];
  overall_assessment: string;
  extracted_text: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
}

// --- Ad Copy Types ---

export interface AdCopyJob {
  id: string;
  name: string;
  source_text: string;
  target_languages: string[];
  status: string;
  created_at: string;
  updated_at: string;
  ad_copy_translations?: AdCopyTranslation[];
}

export interface AdCopyTranslation {
  id: string;
  job_id: string;
  language: string;
  translated_text: string | null;
  quality_score: number | null;
  quality_analysis: Record<string, unknown> | null;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// --- Meta Ads Types ---

export type MetaCampaignStatus = "draft" | "pushing" | "pushed" | "error";
export type MetaAdStatus = "pending" | "uploading" | "pushed" | "error";

export const META_OBJECTIVES = [
  { value: "OUTCOME_TRAFFIC", label: "Traffic" },
  { value: "OUTCOME_SALES", label: "Sales" },
  { value: "OUTCOME_LEADS", label: "Leads" },
  { value: "OUTCOME_ENGAGEMENT", label: "Engagement" },
] as const;

export const COUNTRY_MAP: Record<Language, string> = {
  no: "NO",
  da: "DK",
  sv: "SE",
  de: "DE",
};

export interface MetaCampaign {
  id: string;
  name: string;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  objective: string;
  countries: string[];
  daily_budget: number;
  language: string;
  start_time: string | null;
  end_time: string | null;
  status: MetaCampaignStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  meta_ads?: MetaAd[];
}

export interface MetaAd {
  id: string;
  campaign_id: string;
  name: string;
  meta_ad_id: string | null;
  meta_creative_id: string | null;
  meta_image_hash: string | null;
  image_url: string | null;
  ad_copy: string | null;
  headline: string | null;
  source_primary_text: string | null;
  source_headline: string | null;
  landing_page_url: string | null;
  aspect_ratio: string | null;
  status: MetaAdStatus;
  error_message: string | null;
  created_at: string;
}
