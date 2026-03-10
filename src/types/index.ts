export type Product = "happysleep" | "hydro13";
export type PageType = "advertorial" | "listicle";
export type PageAngle = "snoring" | "neck_pain" | "neutral";
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
  angle: PageAngle;
  thumbnail_url: string | null;
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

export type AspectRatio = "1:1" | "4:5" | "9:16";

export const ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: "4:5", label: "4:5 Feed" },
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

// --- Hook Library Types ---

export type HookType = "hook";
export type HookSource = "manual" | "telegram" | "concept_auto";
export type HookStatus = "unreviewed" | "approved" | "archived";

export interface HookLibraryEntry {
  id: string;
  hook_text: string;
  hook_type: HookType;
  product: Product | null;
  awareness_level: AwarenessLevel | null;
  angle: Angle | null;
  tags: string[];
  source: HookSource;
  source_concept_id: string | null;
  source_url: string | null;
  status: HookStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
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
  pipeline_concept_id?: string | null;
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
  iteration_of?: string | null;
  iteration_type?: IterationType | null;
  iteration_context?: Record<string, unknown> | null;
  source?: "hub" | "external";
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
  compliance_result?: ComplianceResult | null;
  pending_competitor_gen?: {
    image_prompts: Array<{ source_index: number; prompt: string; hook_text: string; headline_text: string }>;
    competitor_image_urls: string[];
    product_hero_urls: string[];
  } | null;
  launchpad_priority?: number | null;
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
  batch: number;
  batch_label: string | null;
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

// Meta compliance check types
export interface ComplianceIssue {
  rule: string;
  detail: string;
  suggestion?: string;
}

export interface ComplianceTextResult {
  text: string;
  type: "primary" | "headline";
  verdict: "PASS" | "WARNING" | "REJECT";
  issues: ComplianceIssue[];
}

export interface ComplianceImageResult {
  image_url: string;
  verdict: "PASS" | "WARNING";
  issues: ComplianceIssue[];
}

export interface ComplianceResult {
  overall_verdict: "PASS" | "WARNING" | "REJECT";
  text_results: ComplianceTextResult[];
  image_results: ComplianceImageResult[];
  summary: string;
  checked_at: string;
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
  video_job_id: string | null;
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
  variation_index: number | null;
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
  format: 'image' | 'video';
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

// --- Copy Bank Types ---

export interface CopyBankEntry {
  id: string;
  product: string;
  language: string;
  primary_text: string;
  headline: string | null;
  segment_id: string | null;
  source_meta_ad_id: string | null;
  source_concept_name: string | null;
  notes: string | null;
  created_at: string;
  // Joined relations (optional)
  segment?: ProductSegment;
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

export type SwiperAngle = "neck-pain" | "snoring" | "sleep-quality" | "general" | "auto-detect";

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

// --- Brainstorm Types ---

export type BrainstormMode = "from_scratch" | "from_organic" | "from_research" | "from_internal" | "unaware" | "from_template" | "from_competitor_ad" | "video_ugc" | "pixar_animation";
export type UnawareAdType = "straddle" | "symptom" | "worldview_porn" | "story";
export type AdTemplate =
  | "before_after"
  | "insider_reveal"
  | "framework_intro"
  | "quick_win"
  | "industry_authority"
  | "hidden_cost"
  | "identity_shift"
  | "pattern_interrupt"
  | "overlooked_factor"
  | "bottleneck_breakthrough"
  | "effortless_pivot"
  | "future_regret"
  | "insider_outsider"
  | "resource_maximizer";

export interface BrainstormRequest {
  mode: BrainstormMode;
  product: Product;
  count: number;
  organic_text?: string;
  research_text?: string;
  segment_id?: string;
  unaware_types?: UnawareAdType[];
  template_ids?: AdTemplate[];
  focus_angles?: Angle[];
  focus_awareness?: AwarenessLevel;
  // From Competitor Ad mode
  competitor_image_url?: string;
  competitor_image_urls?: string[];
  competitor_ad_copy?: string;
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
  hypothesis?: string;
}

// ── Pipeline Dashboard ──────────────────────────────────────

export type PipelineStage = "draft" | "queued" | "launchpad" | "testing" | "review" | "active" | "killed";

export type ConceptSource = "hub" | "external" | "legacy";

export interface PipelineSetting {
  id: string;
  product: string;
  country: string;
  target_cpa: number;
  target_roas: number | null;
  currency: string;
  testing_slots?: number;
  min_budget_per_concept: number;
  created_at: string;
  updated_at: string;
}

export interface ConceptMetrics {
  id: string;
  image_job_market_id: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  conversions: number;
  cpa: number;
  roas: number | null;
  revenue: number;
  synced_at: string;
}

export interface ConceptLifecycle {
  id: string;
  image_job_market_id: string;
  stage: PipelineStage;
  entered_at: string;
  exited_at: string | null;
  signal: string | null;
  notes: string | null;
  hypothesis: string | null;
  concept_type: 'image' | 'video';
}

export interface PipelineSignal {
  type: "kill" | "scale" | "fatigue" | "no_spend" | "review_ready";
  reason: string;
}

export interface PipelineAlert {
  type: "publish_more" | "review_needed" | "budget_imbalance" | "all_fatiguing";
  message: string;
  priority: "high" | "medium" | "low";
}

export interface PipelineConcept {
  id: string; // image_job_market.id (not image_job.id!)
  imageJobId: string; // for linking back to source concept
  conceptType: "image" | "video"; // distinguishes image vs video concepts
  market: string; // "SE", "DK", "NO", or "DE"
  name: string;
  conceptNumber: number | null;
  product: string | null;
  source: ConceptSource;
  launchpadPriority: number | null;
  thumbnailUrl: string | null;
  stage: PipelineStage;
  stageEnteredAt: string;
  daysInStage: number;
  pushedAt: string;
  daysSincePush: number;
  metrics: {
    totalSpend: number;
    cpa: number;
    ctr: number;
    cpc: number;
    cpm: number;
    frequency: number;
    conversions: number;
    impressions: number;
    clicks: number;
    roas: number | null;
    revenue: number;
  } | null;
  signals: PipelineSignal[];
  targetCpa: number | null;
  targetRoas: number | null;
  currency: string | null;
  cashDna: CashDna | null;
  killHypothesis: string | null;
  killNotes: string | null;
}

export interface PipelineSummary {
  launchpad: number;
  inTesting: number;
  needsReview: number;
  activeScaling: number;
  killed: number;
  avgCreativeAge: number;
  availableBudgetByMarket: Record<string, { available: number; currency: string; canPush: number; campaignBudget: number; activeAdSets: number }>;
}

export interface CampaignBudget {
  campaignId: string;
  name: string;
  dailyBudget: number;
  currency: string;
  countries: string[];
}

export interface PipelineData {
  concepts: PipelineConcept[];
  summary: PipelineSummary;
  alerts: PipelineAlert[];
  lastSyncedAt: string | null;
  campaignBudgets?: CampaignBudget[];
}

// --- Automated Pipeline Types ---

export type AutoPipelineConceptStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "generating_images"
  | "images_complete"
  | "scheduled"
  | "live";

export type AutoPipelineGenerationMode =
  | "matrix"
  | "from_template"
  | "from_research"
  | "from_scratch";

export interface AutoPipelineConcept {
  id: string;
  concept_number: number;
  name: string;
  product: Product;

  cash_dna: CashDna | null;

  headline: string;
  primary_copy: string[];
  ad_copy_headline: string[];
  hypothesis: string;

  generation_mode: AutoPipelineGenerationMode | null;
  generation_batch_id: string | null;
  template_id: string | null;

  status: AutoPipelineConceptStatus;

  image_job_id: string | null;
  rejected_reason: string | null;

  target_languages: Language[];
  target_markets: string[] | null;

  created_at: string;
  updated_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  images_completed_at: string | null;
  scheduled_at: string | null;
}

export interface AutoPipelineNotification {
  id: string;
  concept_id: string;
  notification_type: "concepts_ready" | "images_complete" | "performance_alert";
  channel: "telegram" | "in_app" | "email";
  sent_at: string;
  telegram_message_id: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AutoCoverageMatrixCell {
  product: Product;
  market: string;
  awareness_level: string;
  concept_count: number;
  live_ad_count: number;
  last_tested_at: string | null;
  performance_summary: Record<string, unknown> | null;
}

export interface AutoCoverageGap {
  priority: "high" | "medium" | "low";
  message: string;
  product: Product;
  market: string;
  awareness_level: string;
}

export interface AutoPipelineGenerateRequest {
  count: number;
  mode: AutoPipelineGenerationMode;
  product: Product;
  target_markets: string[];
  target_languages: Language[];
}

export interface AutoPipelineGenerateResponse {
  success: boolean;
  batch_id: string;
  concepts_generated: number;
  concepts: AutoPipelineConcept[];
}

export interface AutoPipelineBadgeCount {
  count: number;
  breakdown: {
    to_review: number;
    images_complete: number;
    performance_alerts: number;
  };
}

export interface AutoConceptPerformance {
  market: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpa: number | null;
  status: string;
  flag: "learning" | "good" | "neutral" | "warning" | "critical";
}

export interface AutoLiveTestingConcept extends AutoPipelineConcept {
  performance: Record<string, AutoConceptPerformance>;
  suggestion: string | null;
  suggestion_action: "kill" | "scale" | null;
  suggestion_markets: string[] | null;
}

// --- Video UGC Types ---

export type VideoJobStatus =
  | "draft"
  | "generating"
  | "generated"
  | "translating"
  | "translated"
  | "pushing"
  | "live"
  | "killed";

export type VideoTranslationStatus =
  | "pending"
  | "translating"
  | "generating"
  | "completed"
  | "failed";

export type SourceVideoStatus = "pending" | "generating" | "completed" | "failed";

export type PipelineMode = "single_clip" | "multi_clip"; // single_clip kept for backward compat with existing DB records
export type VideoGenerationMethod = "veo3" | "storyboard" | "kling";
export type StoryboardStatus = "pending" | "generating" | "completed" | "failed";
export type ShotImageStatus = "pending" | "generating" | "completed" | "failed";
export type ShotVideoStatus = "pending" | "generating" | "completed" | "failed";
export type CharacterRefStatus = "pending" | "generating" | "completed" | "failed" | "skipped";

export interface VideoShot {
  id: string;
  video_job_id: string;
  shot_number: number;
  shot_description: string;
  veo_prompt: string;
  image_url: string | null;
  image_kie_task_id: string | null;
  image_status: ShotImageStatus;
  // Legacy — kept for backward compat, new code uses video_clips
  video_url?: string | null;
  video_kie_task_id?: string | null;
  video_status?: ShotVideoStatus;
  video_duration_seconds: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface VideoClip {
  id: string;
  video_job_id: string;
  language: string;
  shot_number: number;
  video_url: string | null;
  video_kie_task_id: string | null;
  video_status: ShotVideoStatus;
  video_duration_seconds: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface VideoShotProposal {
  shot_number: number;
  shot_description: string;
  veo_prompt: string;
  duration_seconds: number;
}

export type VideoHookType =
  | "problem_solution"
  | "promise"
  | "secret"
  | "discovery"
  | "social_proof"
  | "curiosity"
  | "confrontational";

export type ScriptStructure =
  | "testimonial"
  | "insider_secret"
  | "discovery"
  | "before_after"
  | "street_interview"
  | "podcast";

export type VideoFormatType =
  | "selfie_testimonial"
  | "street_interview"
  | "dorm_confessional"
  | "professor_lecture"
  | "grocery_store"
  | "grwm"
  | "podcast_clip"
  | "pixar_animation";

export type DeliveryStyle =
  | "conversational"
  | "energetic"
  | "conspiratorial"
  | "emotional"
  | "authority";

export interface VideoJob {
  id: string;
  product: Product;
  concept_name: string;
  concept_number: number | null;
  hook_type: VideoHookType | null;
  script_structure: ScriptStructure | null;
  format_type: VideoFormatType | null;
  script: string | null;
  sora_prompt: string | null;
  character_description: string | null;
  character_tag: string | null;
  product_description: string | null;
  duration_seconds: number;
  target_languages: Language[];
  status: VideoJobStatus;
  brainstorm_session_id: string | null;
  awareness_level: string | null;
  style_notes: string | null;
  ad_copy_primary: string[];
  ad_copy_headline: string[];
  landing_page_url: string | null;
  ad_copy_translations?: ConceptCopyTranslations;
  landing_page_id: string | null;
  ab_test_id: string | null;
  launchpad_priority: number | null;
  created_at: string;
  updated_at: string;
  source_videos?: SourceVideo[];
  video_translations?: VideoTranslation[];
  pipeline_mode: PipelineMode;
  video_generation_method: VideoGenerationMethod;
  character_ref_urls: string[];
  character_ref_status: CharacterRefStatus;
  max_shots: number;
  reuse_first_frame: boolean;
  storyboard_kie_task_id: string | null;
  storyboard_url: string | null;
  storyboard_status: StoryboardStatus;
  storyboard_duration: string;
  video_shots?: VideoShot[];
  video_clips?: VideoClip[];
}

export interface SourceVideo {
  id: string;
  video_job_id: string;
  video_url: string | null;
  kie_task_id: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  resolution: string;
  model: string;
  status: SourceVideoStatus;
  error_message: string | null;
  generation_params: Record<string, unknown> | null;
  created_at: string;
}

export interface TranslatedShot {
  shot_number: number;
  translated_dialogue: string;
  translated_veo_prompt: string;
}

export interface VideoTranslation {
  id: string;
  video_job_id: string;
  source_video_id: string | null;
  language: Language;
  translated_script: string | null;
  translated_sora_prompt: string | null;
  translated_shots: TranslatedShot[] | null;
  video_url: string | null;
  kie_task_id: string | null;
  status: VideoTranslationStatus;
  error_message: string | null;
  caption_style: 'highlight' | 'clean' | null;
  caption_srt_url: string | null;
  captioned_video_url: string | null;
  created_at: string;
}

export interface VideoCharacter {
  id: string;
  name: string;
  sora_tag: string | null;
  character_description: string | null;
  reference_image_url: string | null;
  product: string | null;
  created_at: string;
}

export interface VideoProduct {
  id: string;
  product: string;
  sora_tag: string | null;
  product_description: string | null;
  reference_image_url: string | null;
  animated_video_url: string | null;
  created_at: string;
}

export interface VideoConceptProposal {
  concept_name: string;
  format_type: VideoFormatType;
  hook_type: VideoHookType;
  script_structure: ScriptStructure;
  awareness_level: string;
  delivery_style: DeliveryStyle;
  script: string;
  character_description: string;
  product_description?: string;
  sora_prompt: string;
  ad_copy_primary: string;
  ad_copy_headline: string;
  shots?: VideoShotProposal[];
}

export interface PixarCharacterShot {
  character_object: string;
  character_category: string;
  character_mood: string;
  dialogue: string;
  duration_seconds: number;
  character_image_prompt: string;
  veo_prompt: string;
}

export interface PixarAnimationProposal {
  concept_name: string;
  theme: string;
  awareness_level: string;
  hook_type: string;
  shots: PixarCharacterShot[];
  ad_copy_primary: string;
  ad_copy_headline: string;
}

// ── Asset Bank ──────────────────────────────────────────────
export type AssetCategory = "product" | "model" | "lifestyle" | "graphic" | "logo" | "before_after" | "other";

export const ASSET_CATEGORIES: AssetCategory[] = [
  "product",
  "model",
  "lifestyle",
  "graphic",
  "logo",
  "before_after",
  "other",
];

export type MediaType = "image" | "video";

export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  media_type: MediaType;
  product: Product | null;
  tags: string[];
  url: string;
  alt_text: string | null;
  description: string | null;
  file_size: number | null;
  dimensions: string | null;
  duration: number | null;
  source_url: string | null;
  created_at: string;
}
