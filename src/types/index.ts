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

export interface PageImageSelection {
  src: string;
  alt: string;
}

export type PageStatus = "importing" | "ready";

export interface Page {
  id: string;
  name: string;
  product: Product;
  page_type: PageType;
  source_url: string;
  original_html: string;
  slug: string;
  source_language: string;
  images_to_translate: PageImageSelection[];
  tags: string[];
  swiped_from_url: string | null;
  status: PageStatus;
  swipe_job_id: string | null;
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
  image_status: "translating" | "done" | "error" | null;
  images_done: number;
  images_total: number;
  publish_error: string | null;
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
  suggested_corrections?: { find: string; replace: string }[];
}

export type ABTestStatus = "draft" | "active" | "completed";

export interface ABTest {
  id: string;
  name: string;
  slug: string;
  description: string | null;
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
  type: "translation" | "image_generation" | "claude_rewrite";
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

export type AspectRatio = "1:1" | "9:16";

export const ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: "1:1", label: "1:1 Square" },
  { value: "9:16", label: "9:16 Story/Reel" },
];

// --- CASH DNA Types ---

export type ConceptCategory = "avatar_facts" | "market_facts" | "product_facts" | "psychology_toolkit";

export const CONCEPT_CATEGORIES: { value: ConceptCategory; label: string }[] = [
  { value: "avatar_facts", label: "Avatar Facts" },
  { value: "market_facts", label: "Market Facts" },
  { value: "product_facts", label: "Product Facts" },
  { value: "psychology_toolkit", label: "Psychology Toolkit" },
];

export const ANGLES = [
  "Story", "Contrarian", "Expert Crossover", "Root Cause",
  "Accidental Discovery", "Tribal", "Conspiracy", "Geographic",
  "New Science", "Symptom Reframe", "Worldview", "Case Study",
  "Before/After", "Comparison", "Social Proof", "Educational",
  "Fear-Based", "Aspirational", "Curiosity", "Problem-Agitate",
] as const;
export type Angle = (typeof ANGLES)[number];

export const STYLES = [
  "Product Shot", "Lifestyle", "UGC-style", "Infographic",
  "Before/After", "Testimonial", "Meme", "Screenshot",
  "Text Overlay", "Collage", "Comparison",
] as const;
export type Style = (typeof STYLES)[number];

export const AWARENESS_LEVELS = [
  "Unaware", "Problem Aware", "Solution Aware", "Product Aware", "Most Aware",
] as const;
export type AwarenessLevel = (typeof AWARENESS_LEVELS)[number];

export const AD_SOURCES = [
  "Swipe (competitor)", "Swipe (adjacent)", "Template", "Organic",
  "Research", "Matrix/Coverage", "Internal Vector", "Wildcard",
] as const;
export type AdSource = (typeof AD_SOURCES)[number];

export const COPY_BLOCKS = [
  "Pain", "Promise", "Proof", "Curiosity", "Constraints", "Conditions",
] as const;
export type CopyBlock = (typeof COPY_BLOCKS)[number];

export interface CashDna {
  concept_type: ConceptCategory | null;
  angle: Angle | null;
  style: Style | null;
  hooks: string[];
  awareness_level: AwarenessLevel | null;
  ad_source: AdSource | null;
  copy_blocks: CopyBlock[];
  concept_description: string;
}

// --- Image Translation Types ---

export type ImageJobStatus = "draft" | "ready" | "processing" | "completed" | "failed";
export type ImageTranslationStatus = "pending" | "processing" | "completed" | "failed";
export type IterationType = "segment_swap" | "mechanism_swap" | "cash_swap";

export interface ImageJob {
  id: string;
  name: string;
  product: Product | null;
  status: ImageJobStatus;
  target_languages: Language[];
  target_ratios: AspectRatio[];
  source_folder_id: string | null;
  auto_export: boolean;
  exported_at: string | null;
  notified_at: string | null;
  ad_copy_primary: string[];
  ad_copy_headline: string[];
  ad_copy_doc_id: string | null;
  landing_page_id: string | null;
  ab_test_id: string | null;
  concept_number: number | null;
  marked_ready_at: string | null;
  tags: string[];
  cash_dna?: CashDna | null;
  visual_direction?: string | null;
  source_spy_ad_id?: string | null;
  iteration_of?: string | null;
  iteration_type?: IterationType | null;
  iteration_context?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  source_images?: SourceImage[];
  total_images?: number;
  total_translations?: number;
  completed_translations?: number;
  failed_translations?: number;
  deployments?: Array<{ country: string; language: Language; status: MetaCampaignStatus }>;
  // Per-language translated ad copy with quality scores (stored as JSON in DB)
  ad_copy_translations?: ConceptCopyTranslations;
}

export interface SourceImage {
  id: string;
  job_id: string;
  original_url: string;
  filename: string | null;
  processing_order: number | null;
  thumbnail_url: string | null;
  skip_translation: boolean;
  generation_prompt: string | null;
  generation_style: string | null;
  created_at: string;
  image_translations?: ImageTranslation[];
}

export interface ImageTranslation {
  id: string;
  source_image_id: string;
  language: Language;
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

export type AdCopyJobStatus = "draft" | "translating" | "completed" | "error";

export interface AdCopyJob {
  id: string;
  name: string;
  product: Product | null;
  source_text: string;
  target_languages: Language[];
  status: AdCopyJobStatus;
  created_at: string;
  updated_at: string;
  ad_copy_translations?: AdCopyTranslation[];
}

export interface AdCopyQualityAnalysis {
  quality_score: number;
  fluency_issues: string[];
  grammar_issues: string[];
  context_errors: string[];
  overall_assessment: string;
}

// Per-language translated ad copy stored on image_jobs.ad_copy_translations
export interface ConceptCopyTranslation {
  primary_texts: string[];
  headlines: string[];
  quality_score: number | null;
  quality_analysis: AdCopyQualityAnalysis | null;
  status: "pending" | "translating" | "completed" | "error";
  error?: string;
}

export type ConceptCopyTranslations = Record<string, ConceptCopyTranslation>;

export type AdCopyTranslationStatus = "pending" | "translating" | "completed" | "error" | "failed";

export interface AdCopyTranslation {
  id: string;
  job_id: string;
  language: Language;
  translated_text: string | null;
  quality_score: number | null;
  quality_analysis: AdCopyQualityAnalysis | null;
  status: AdCopyTranslationStatus;
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
  product: Product | null;
  image_job_id: string | null;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  objective: string;
  countries: string[];
  daily_budget: number;
  language: Language;
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
  image_url_9x16: string | null;
  meta_image_hash_9x16: string | null;
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

export interface MetaCampaignMapping {
  id: string;
  product: Product;
  country: string;
  meta_campaign_id: string;
  meta_campaign_name: string | null;
  template_adset_id: string | null;
  template_adset_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetaPageConfig {
  id: string;
  country: string;
  meta_page_id: string;
  meta_page_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketProductUrl {
  id: string;
  product: string;
  country: string;
  url: string;
}

// --- Product Bank Types ---

export type ImageCategory = "hero" | "lifestyle" | "detail" | "before-after" | "testimonial" | "other";

export const IMAGE_CATEGORIES: { value: ImageCategory; label: string }[] = [
  { value: "hero", label: "Hero" },
  { value: "lifestyle", label: "Lifestyle" },
  { value: "detail", label: "Detail" },
  { value: "before-after", label: "Before/After" },
  { value: "testimonial", label: "Testimonial" },
  { value: "other", label: "Other" },
];

export interface ProductFull {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  benefits: string[];
  usps: string[];
  claims: string[];
  certifications: string[];
  ingredients: string | null;
  price_info: Record<string, unknown>;
  target_audience: string | null;
  competitor_keywords: string[];
  created_at: string;
  updated_at: string;
  product_images?: ProductImage[];
  copywriting_guidelines?: CopywritingGuideline[];
  reference_pages?: ReferencePage[];
  product_segments?: ProductSegment[];
}

export interface ProductImage {
  id: string;
  product_id: string;
  category: ImageCategory;
  url: string;
  alt_text: string | null;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export interface CopywritingGuideline {
  id: string;
  product_id: string | null;
  name: string;
  content: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ReferencePage {
  id: string;
  product_id: string | null;
  name: string;
  url: string | null;
  content: string;
  notes: string | null;
  created_at: string;
}

export interface ProductSegment {
  id: string;
  product_id: string;
  name: string;
  description: string | null;
  core_desire: string | null;
  core_constraints: string | null;
  demographics: string | null;
  sort_order: number;
  created_at: string;
}

// --- Swiper Image Generation Types ---

export type SwiperAngle = "neck-pain" | "snoring" | "sleep-quality" | "auto-detect";

export interface ImageAnalysis {
  subjects: string;
  composition: string;
  style: string;
  context: string;
  product_interaction: string;
  text_overlays: string;
  suggested_replacement: string;
}

export interface ImageGenerationState {
  src: string;
  status: "idle" | "analyzing" | "prompt-ready" | "generating" | "done" | "error";
  analysis?: ImageAnalysis;
  prompt?: string;
  referenceImages?: string[];
  generatedUrl?: string;
  error?: string;
}

// --- Ad Spy Types ---

export const SPY_CATEGORIES = [
  "Health & Wellness",
  "Beauty & Skincare",
  "Sleep & Recovery",
  "Food & Drink",
  "Fashion",
  "Home & Living",
  "Fitness",
  "Supplements",
  "Other",
] as const;
export type SpyCategory = (typeof SPY_CATEGORIES)[number];

export const SPY_COUNTRIES = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "AU", label: "Australia" },
  { code: "CA", label: "Canada" },
  { code: "SE", label: "Sweden" },
  { code: "NO", label: "Norway" },
  { code: "DK", label: "Denmark" },
  { code: "DE", label: "Germany" },
  { code: "ALL", label: "All Countries" },
] as const;

export interface SpyBrand {
  id: string;
  name: string;
  meta_page_id: string | null;
  ad_library_url: string;
  category: string | null;
  logo_url: string | null;
  notes: string | null;
  is_active: boolean;
  last_fetched_at: string | null;
  ad_count: number;
  scrape_countries: string[];
  created_at: string;
  updated_at: string;
}

export interface SpyAd {
  id: string;
  brand_id: string;
  meta_ad_id: string;
  headline: string | null;
  body: string | null;
  description: string | null;
  link_url: string | null;
  cta_type: string | null;
  media_type: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  ad_snapshot_url: string | null;
  ad_delivery_start_time: string | null;
  is_active: boolean;
  publisher_platforms: string[] | null;
  impressions_rank: number | null;
  impressions_label: string | null;
  raw_data: Record<string, unknown> | null;
  cash_analysis: SpyAdCashAnalysis | null;
  analyzed_at: string | null;
  is_bookmarked: boolean;
  user_notes: string | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  // Joined
  brand?: SpyBrand;
}

export interface SpyAdCashAnalysis extends CashDna {
  offer_type: string | null;
  asset_type: string | null;
  estimated_production: string | null;
}

// --- Brainstorm Types ---

export type BrainstormMode = "from_scratch" | "from_organic" | "from_research" | "from_internal" | "unaware";
export type UnawareAdType = "straddle" | "symptom" | "worldview_porn" | "story";

export interface BrainstormRequest {
  mode: BrainstormMode;
  product: Product;
  count: number;
  organic_text?: string;
  research_text?: string;
  segment_id?: string;
  unaware_types?: UnawareAdType[];
  focus_angles?: Angle[];
  focus_awareness?: AwarenessLevel;
}

// --- Concept Generator Types ---

export interface ConceptProposal {
  concept_name: string;
  concept_description: string;
  cash_dna: {
    concept_type: ConceptCategory | null;
    angle: Angle;
    style: Style | null;
    hooks: string[];
    awareness_level: AwarenessLevel;
    ad_source: AdSource;
    copy_blocks: CopyBlock[];
    concept_description: string;
  };
  ad_copy_primary: string[];
  ad_copy_headline: string[];
  native_headlines?: string[];
  visual_direction: string;
  differentiation_note: string;
  suggested_tags: string[];
}
