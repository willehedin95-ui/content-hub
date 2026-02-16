export type Product = "happysleep" | "hydro13";
export type PageType = "advertorial" | "listicle";
export type Language = "sv" | "da" | "no";
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
  created_at: string;
  updated_at: string;
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
    domain: "blog.halsobladet.com/no",
  },
];

// --- Image Translation Types ---

export type ImageJobStatus = "draft" | "processing" | "completed" | "failed";
export type ImageTranslationStatus = "pending" | "processing" | "completed" | "failed";

export interface ImageJob {
  id: string;
  name: string;
  status: ImageJobStatus;
  target_languages: string[];
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
  created_at: string;
  image_translations?: ImageTranslation[];
}

export interface ImageTranslation {
  id: string;
  source_image_id: string;
  language: string;
  status: ImageTranslationStatus;
  translated_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
