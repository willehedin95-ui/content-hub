"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Globe,
  BookmarkCheck,
  BarChart3,
  ListPlus,
  X,
  Clock,
} from "lucide-react";
import {
  ImageJob,
  Language,
  LANGUAGES,
  COUNTRY_MAP,
  MetaCampaign,
  MetaCampaignMapping,
  MetaPageConfig,
  ConceptCopyTranslations,
  ConceptCopyTranslation,
  ComplianceResult,
} from "@/types";
import ComplianceCheck from "./ComplianceCheck";
import { getSettings } from "@/lib/settings";

interface Props {
  job: ImageJob;
  copyTranslations: ConceptCopyTranslations;
  metaPush: {
    primaryTexts: string[];
    headlines: string[];
    landingPageId: string;
    abTestId?: string;
    pushing: boolean;
    pushResults: Array<{
      language: string;
      country: string;
      status: string;
      error?: string;
      scheduled_time?: string;
    }> | null;
  };
  deployments: MetaCampaign[];
  onPushToMeta: () => void;
  landingPageUrls: Record<string, string>;
  campaignMappings: MetaCampaignMapping[];
  pageConfigs: MetaPageConfig[];
  markedReadyAt: string | null;
  onMarkReady: () => void;
}

export default function MetaAdPreview({
  job,
  copyTranslations,
  metaPush,
  deployments,
  onPushToMeta,
  landingPageUrls,
  campaignMappings,
  pageConfigs,
  markedReadyAt,
  onMarkReady,
}: Props) {
  const [activeLang, setActiveLang] = useState<Language>(
    job.target_languages[0] as Language
  );
  const [imageIndex, setImageIndex] = useState(0);
  const [primaryTextIndex, setPrimaryTextIndex] = useState(0);
  const [headlineIndex, setHeadlineIndex] = useState(0);
  const [complianceResult, setComplianceResult] = useState<ComplianceResult | null>(
    job.compliance_result ?? null
  );

  // Variation performance tracking
  const [variationInsights, setVariationInsights] = useState<Array<{
    variation_index: number;
    ad_copy: string;
    headline: string;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
    ad_count: number;
    ctr: number;
    cpc: number;
    cpa: number;
    roas: number | null;
  }> | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  // Queue state
  const [queueStatus, setQueueStatus] = useState<Array<{ market: string; status: string | null; position?: number }>>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueChecked, setQueueChecked] = useState<Set<string>>(new Set());

  // Fetch queue status
  useEffect(() => {
    fetch(`/api/image-jobs/${job.id}/queue`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.markets) setQueueStatus(data.markets);
      })
      .catch(() => {});
  }, [job.id]);

  async function handleAddToQueue() {
    const markets = Array.from(queueChecked);
    if (markets.length === 0) return;
    setQueueLoading(true);
    try {
      const res = await fetch(`/api/image-jobs/${job.id}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markets }),
      });
      if (res.ok) {
        // Refresh queue status
        const statusRes = await fetch(`/api/image-jobs/${job.id}/queue`);
        if (statusRes.ok) {
          const data = await statusRes.json();
          setQueueStatus(data.markets);
        }
        setQueueChecked(new Set());
      }
    } catch {}
    setQueueLoading(false);
  }

  async function handleRemoveFromQueue(market: string) {
    setQueueLoading(true);
    try {
      const res = await fetch(`/api/image-jobs/${job.id}/queue`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markets: [market] }),
      });
      if (res.ok) {
        const statusRes = await fetch(`/api/image-jobs/${job.id}/queue`);
        if (statusRes.ok) {
          const data = await statusRes.json();
          setQueueStatus(data.markets);
        }
      }
    } catch {}
    setQueueLoading(false);
  }

  // Reset navigation indices when language changes
  useEffect(() => {
    setImageIndex(0);
    setPrimaryTextIndex(0);
    setHeadlineIndex(0);
  }, [activeLang]);

  // Get all images for active language: translated 4:5 + skipped originals
  const langImages = useMemo(() => {
    const sourceImages = job.source_images ?? [];
    // Translated images for this language
    const translated = sourceImages.flatMap((si) =>
      (si.image_translations ?? [])
        .filter(
          (t) =>
            t.language === activeLang &&
            t.aspect_ratio === "4:5" &&
            t.status === "completed" &&
            t.translated_url
        )
        .map((t) => ({
          sourceImage: si,
          imageUrl: t.translated_url!,
        }))
    );
    // Skipped images use the original (same for all languages)
    const skipped = sourceImages
      .filter((si) => si.skip_translation && si.original_url)
      .map((si) => ({
        sourceImage: si,
        imageUrl: si.original_url,
      }));
    return [...translated, ...skipped].sort(
      (a, b) =>
        (a.sourceImage.processing_order ?? 0) -
        (b.sourceImage.processing_order ?? 0)
    );
  }, [job.source_images, activeLang]);

  // Compute next scheduled publish time from settings
  const scheduledLabel = useMemo(() => {
    const scheduleHHMM = getSettings().meta_default_schedule_time;
    if (!scheduleHHMM) return null;
    const [hh, mm] = scheduleHHMM.split(":").map(Number);
    const now = new Date();
    const scheduled = new Date(now);
    scheduled.setHours(hh, mm, 0, 0);
    if (scheduled <= now) scheduled.setDate(scheduled.getDate() + 1);
    const day = scheduled.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const time = scheduled.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `Scheduled to go live ${day} at ${time}`;
  }, []);

  // Get translated copy for active language (fall back to English)
  const ct = copyTranslations[activeLang] as ConceptCopyTranslation | undefined;
  const primaryTexts =
    ct?.status === "completed" && ct.primary_texts.length > 0
      ? ct.primary_texts
      : metaPush.primaryTexts.filter((t) => t.trim());
  const headlines =
    ct?.status === "completed" && ct.headlines.length > 0
      ? ct.headlines
      : metaPush.headlines.filter((t) => t.trim());

  const isTranslatedCopy = ct?.status === "completed";

  // Campaign mapping for active language
  const country = COUNTRY_MAP[activeLang];
  const mapping = campaignMappings.find((m) => m.country === country);
  const pageConfig = pageConfigs.find((p) => p.country === country);

  // Ad set name
  const conceptNumberStr = job.concept_number
    ? String(job.concept_number).padStart(3, "0")
    : "auto";
  const adSetName = `${country} #${conceptNumberStr} | statics | ${job.name.replace(/^#\d+\s*/, "").toLowerCase()}`;
  const adName = `${adSetName} - Ad ${imageIndex + 1}`;

  // Landing page URL for active language
  const landingUrl = landingPageUrls[activeLang] || null;
  let landingDomain = "";
  if (landingUrl) {
    try {
      landingDomain = new URL(landingUrl).hostname;
    } catch {}
  }

  // Current image
  const currentImage = langImages[imageIndex] ?? null;

  // Readiness per language
  const allLangsTranslated = job.target_languages.every(
    (lang) => copyTranslations[lang]?.status === "completed"
  );
  const hasCopy = metaPush.primaryTexts.some((t) => t.trim());
  const canPush = hasCopy && (metaPush.landingPageId || metaPush.abTestId) && allLangsTranslated;

  return (
    <div className="space-y-6">
      {/* Language sub-tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {job.target_languages.map((lang) => {
          const langInfo = LANGUAGES.find((l) => l.value === lang);
          const c = COUNTRY_MAP[lang as Language];
          return (
            <button
              key={lang}
              onClick={() => setActiveLang(lang as Language)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeLang === lang
                  ? "text-indigo-600 border-indigo-500"
                  : "text-gray-400 hover:text-gray-700 border-transparent"
              }`}
            >
              <span>{langInfo?.flag}</span>
              {c}
            </button>
          );
        })}
      </div>

      {/* Breadcrumb */}
      <div className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
        <span className="text-gray-500 font-medium">
          {mapping?.meta_campaign_name || "No campaign mapping"}
        </span>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-500 font-medium">{adSetName}</span>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600 font-medium">{adName}</span>
      </div>

      {/* Facebook Ad Mockup */}
      <div className="flex justify-center">
        <div className="w-full max-w-[420px] bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {/* Primary text */}
          <div className="px-4 pt-4 pb-2">
            {primaryTexts.length > 0 ? (
              <div className="flex items-start gap-2">
                {primaryTexts.length > 1 && (
                  <button
                    onClick={() =>
                      setPrimaryTextIndex((i) => Math.max(0, i - 1))
                    }
                    disabled={primaryTextIndex === 0}
                    className="mt-0.5 p-0.5 text-gray-300 hover:text-gray-500 disabled:opacity-30 transition-colors shrink-0"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 whitespace-pre-wrap line-clamp-4">
                    {primaryTexts[primaryTextIndex] || ""}
                  </p>
                  {!isTranslatedCopy && (
                    <p className="text-xs text-amber-500 mt-1">
                      Showing English (not yet translated)
                    </p>
                  )}
                </div>
                {primaryTexts.length > 1 && (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-gray-400">
                      {primaryTextIndex + 1}/{primaryTexts.length}
                    </span>
                    <button
                      onClick={() =>
                        setPrimaryTextIndex((i) =>
                          Math.min(primaryTexts.length - 1, i + 1)
                        )
                      }
                      disabled={primaryTextIndex === primaryTexts.length - 1}
                      className="p-0.5 text-gray-300 hover:text-gray-500 disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-300 italic">No primary text</p>
            )}
          </div>

          {/* Page header */}
          <div className="flex items-center gap-3 px-4 pb-3">
            <div className="w-10 h-10 bg-gray-200 rounded-full shrink-0" />
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {pageConfig?.meta_page_name || "Page Name"}
              </p>
              <p className="text-xs text-gray-400">
                Sponsored &middot; <Globe className="w-3 h-3 inline" />
              </p>
            </div>
          </div>

          {/* Image area */}
          <div className="relative bg-gray-100 aspect-square">
            {currentImage ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentImage.imageUrl}
                  alt={`Ad image ${imageIndex + 1}`}
                  className="w-full h-full object-cover"
                />
                {/* Image counter */}
                <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                  Image {imageIndex + 1} of {langImages.length}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-gray-400">
                  No completed images for{" "}
                  {LANGUAGES.find((l) => l.value === activeLang)?.label ||
                    activeLang}
                </p>
              </div>
            )}

            {/* Image navigation arrows */}
            {langImages.length > 1 && (
              <>
                <button
                  onClick={() => setImageIndex((i) => Math.max(0, i - 1))}
                  disabled={imageIndex === 0}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white shadow-md rounded-full p-2 disabled:opacity-30 transition-all"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-700" />
                </button>
                <button
                  onClick={() =>
                    setImageIndex((i) =>
                      Math.min(langImages.length - 1, i + 1)
                    )
                  }
                  disabled={imageIndex === langImages.length - 1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white shadow-md rounded-full p-2 disabled:opacity-30 transition-all"
                >
                  <ChevronRight className="w-5 h-5 text-gray-700" />
                </button>
              </>
            )}
          </div>

          {/* Link preview */}
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                {landingDomain && (
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">
                    {landingDomain}
                  </p>
                )}
                {headlines.length > 0 && headlines[0]?.trim() ? (
                  <div className="flex items-center gap-1">
                    {headlines.length > 1 && (
                      <button
                        onClick={() =>
                          setHeadlineIndex((i) => Math.max(0, i - 1))
                        }
                        disabled={headlineIndex === 0}
                        className="p-0.5 text-gray-300 hover:text-gray-500 disabled:opacity-30 transition-colors shrink-0"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {headlines[headlineIndex] || headlines[0]}
                    </p>
                    {headlines.length > 1 && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <span className="text-xs text-gray-400">
                          {headlineIndex + 1}/{headlines.length}
                        </span>
                        <button
                          onClick={() =>
                            setHeadlineIndex((i) =>
                              Math.min(headlines.length - 1, i + 1)
                            )
                          }
                          disabled={headlineIndex === headlines.length - 1}
                          className="p-0.5 text-gray-300 hover:text-gray-500 disabled:opacity-30 transition-colors"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-300 italic">No headline</p>
                )}
              </div>
              <a
                href={landingUrl || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className={`shrink-0 text-sm font-medium px-4 py-2 rounded-lg border transition-colors ${
                  landingUrl
                    ? "border-gray-300 text-gray-700 hover:bg-gray-100"
                    : "border-gray-200 text-gray-300 cursor-default"
                }`}
              >
                Learn More
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Compliance Check */}
      <ComplianceCheck
        jobId={job.id}
        complianceResult={complianceResult}
        onResultUpdate={setComplianceResult}
      />

      {/* Readiness checklist */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-2">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
          Readiness
        </p>
        {job.target_languages.map((lang) => {
          const langInfo = LANGUAGES.find((l) => l.value === lang);
          const c = COUNTRY_MAP[lang as Language];
          const langCt = copyTranslations[lang] as
            | ConceptCopyTranslation
            | undefined;
          const hasImages =
            (job.source_images ?? []).some((si) =>
              si.skip_translation
                ? !!si.original_url
                : (si.image_translations ?? []).some(
                    (t) =>
                      t.language === lang &&
                      t.aspect_ratio === "4:5" &&
                      t.status === "completed"
                  )
            );
          const hasCopyTranslation = langCt?.status === "completed";
          const hasLandingPage = !!landingPageUrls[lang];
          const hasMapping = campaignMappings.some((m) => m.country === c);

          return (
            <div key={lang} className="flex items-center gap-3 text-sm">
              <span>{langInfo?.flag}</span>
              <span className="w-8 text-gray-600 font-medium">{c}</span>
              <ReadinessItem ok={hasImages} label="Images" />
              <ReadinessItem ok={hasCopyTranslation} label="Copy" />
              <ReadinessItem ok={hasLandingPage} label="Landing page" />
              <ReadinessItem ok={hasMapping} label="Campaign" />
            </div>
          );
        })}
        {complianceResult && complianceResult.overall_verdict === "REJECT" && (
          <div className="flex items-center gap-2 text-xs text-red-600 mt-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Compliance issues detected — review before publishing</span>
          </div>
        )}
        {complianceResult && complianceResult.overall_verdict === "WARNING" && (
          <div className="flex items-center gap-2 text-xs text-amber-600 mt-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Compliance warnings — review recommended</span>
          </div>
        )}
      </div>

      {/* Queue for Meta */}
      {!deployments.some((d) => d.status === "pushed") && canPush && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ListPlus className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-semibold text-gray-800">Queue for Meta</h3>
            <span className="text-xs text-gray-400">Auto-pushes when testing slots open</span>
          </div>

          <div className="space-y-2">
            {job.target_languages.map((lang) => {
              const c = COUNTRY_MAP[lang as Language];
              const langInfo = LANGUAGES.find((l) => l.value === lang);
              const qs = queueStatus.find((q) => q.market === c);
              const isQueued = qs?.status === "queued";
              const isInPipeline = qs?.status && qs.status !== "queued";

              return (
                <div
                  key={lang}
                  className="flex items-center justify-between py-1.5"
                >
                  <div className="flex items-center gap-2.5">
                    {isQueued ? (
                      <div className="flex items-center gap-1.5 text-sm">
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        <span>{langInfo?.flag} {c}</span>
                        <span className="text-xs text-amber-600 font-medium">
                          Queued #{qs.position}
                        </span>
                      </div>
                    ) : isInPipeline ? (
                      <div className="flex items-center gap-1.5 text-sm">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span>{langInfo?.flag} {c}</span>
                        <span className="text-xs text-emerald-600 font-medium capitalize">
                          {qs.status}
                        </span>
                      </div>
                    ) : (
                      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={queueChecked.has(c)}
                          onChange={(e) => {
                            setQueueChecked((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(c);
                              else next.delete(c);
                              return next;
                            });
                          }}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{langInfo?.flag} {c}</span>
                      </label>
                    )}
                  </div>
                  {isQueued && (
                    <button
                      onClick={() => handleRemoveFromQueue(c)}
                      disabled={queueLoading}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {queueChecked.size > 0 && (
            <button
              onClick={handleAddToQueue}
              disabled={queueLoading}
              className="flex items-center gap-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
            >
              {queueLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ListPlus className="w-3.5 h-3.5" />
              )}
              Add to Queue ({queueChecked.size})
            </button>
          )}
        </div>
      )}

      {/* — or publish directly — */}
      {!deployments.some((d) => d.status === "pushed") && canPush && queueStatus.some((q) => q.status === "queued") && (
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <div className="flex-1 border-t border-gray-200" />
          <span>or publish directly</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>
      )}

      {/* Push button */}
      <div className="space-y-2">
        <div className="relative inline-flex rounded-xl">
          {/* Animated gradient border */}
          <div className={`absolute -inset-[2px] rounded-xl overflow-hidden pointer-events-none transition-opacity${metaPush.pushing || !canPush ? " opacity-30" : ""}`}>
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="w-[500px] h-[500px] animate-[spin_4s_linear_infinite]"
                style={{
                  background: "conic-gradient(from 0deg, #0081FB, #0081FB, #00C2FF, rgba(255,255,255,0.85), #00C2FF, #0081FB, #0081FB)",
                }}
              />
            </div>
          </div>
          <button
            onClick={onPushToMeta}
            disabled={metaPush.pushing || !canPush}
            className="relative z-10 flex items-center gap-2.5 bg-white disabled:opacity-50 disabled:cursor-not-allowed text-gray-800 text-sm font-semibold px-6 py-3 rounded-[10px] transition-all hover:shadow-md"
          >
            {metaPush.pushing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#0081FB]" />
                <span>Publishing on Meta...</span>
              </>
            ) : (
              <>
                <svg viewBox="0 6 36 24" className="h-5 w-auto shrink-0" aria-label="Meta logo">
                  <defs>
                    <linearGradient id="meta-btn-grad" x1="0%" y1="50%" x2="100%" y2="50%">
                      <stop offset="0%" stopColor="#0081FB" />
                      <stop offset="100%" stopColor="#0064E0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M7.5 18c0-3.78 1.22-7.08 3.13-9.04C12.2 7.32 14.17 6.5 16 6.5c2.36 0 3.88 1.18 5.28 3.24l.66.97.66-.97C24.02 7.68 25.54 6.5 27.9 6.5c4.87 0 8.1 5.8 8.1 11.5 0 6.52-3.58 11.5-8 11.5-2.36 0-3.95-1.18-5.38-3.24L18 20.1l-4.62 6.16C11.95 28.32 10.36 29.5 8 29.5 3.58 29.5 0 24.52 0 18c0-5.7 3.23-11.5 8.1-11.5 1.83 0 3.8.82 5.37 2.46C11.72 10.92 10.5 14.22 10.5 18c0 1.38.14 2.7.42 3.9-.5.7-1.16 1.1-1.92 1.1-1.57 0-3.5-2.7-3.5-5zm21 0c0 2.3-1.93 5-3.5 5-.76 0-1.42-.4-1.93-1.12.28-1.18.43-2.5.43-3.88 0-3.78-1.22-7.08-3.13-9.04 1.4-1.7 2.8-2.46 4.13-2.46 2.63 0 4 3.66 4 5.5z"
                    fill="url(#meta-btn-grad)"
                  />
                </svg>
                <span>Publish on Meta ({job.target_languages.length})</span>
              </>
            )}
          </button>
        </div>
        {scheduledLabel && (
          <p className="text-xs text-gray-500">{scheduledLabel}</p>
        )}
        {!allLangsTranslated && hasCopy && (
          <p className="text-xs text-gray-400">
            Translate all ad copy before publishing to Meta
          </p>
        )}
      </div>

      {/* Mark as Ready (shown when not yet pushed) */}
      {!deployments.some((d) => d.status === "pushed") && (
        markedReadyAt ? (
          <div className="flex items-center gap-2 text-sm text-teal-700 bg-teal-50 border border-teal-200 px-4 py-2.5 rounded-lg">
            <BookmarkCheck className="w-4 h-4" />
            Marked as ready {new Date(markedReadyAt).toLocaleDateString()}
          </div>
        ) : (
          <button
            onClick={onMarkReady}
            className="flex items-center gap-2 text-sm font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-5 py-2.5 rounded-lg transition-colors"
          >
            <BookmarkCheck className="w-4 h-4" />
            Mark as Ready
          </button>
        )
      )}

      {/* Push results */}
      {metaPush.pushResults && (
        <div className="space-y-2">
          {metaPush.pushResults.map((r, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                r.status === "pushed"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {r.status === "pushed" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>
                {r.country}:{" "}
                {r.status === "pushed"
                  ? r.scheduled_time
                    ? `Scheduled — goes live ${new Date(r.scheduled_time).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at ${new Date(r.scheduled_time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                    : "Published — ads are live"
                  : r.error}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Existing deployments */}
      {deployments.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-700">Deployments</h3>
          {deployments.map((d) => {
            const variationCount = new Set(
              (d.meta_ads ?? [])
                .map((a) => (a as unknown as { variation_index: number | null }).variation_index)
                .filter((v) => v !== null && v !== undefined)
            ).size;
            return (
            <div
              key={d.id}
              className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">{d.name}</p>
                <p className="text-xs text-gray-400">
                  {d.meta_ads?.length ?? 0} ads{variationCount > 1 ? ` (${variationCount} text variations)` : ""} &middot;{" "}
                  {d.status === "pushed" ? (
                    d.start_time && new Date(d.start_time) > new Date() ? (
                      <span className="text-amber-600">Scheduled</span>
                    ) : (
                      <span className="text-emerald-600">Live</span>
                    )
                  ) : d.status === "pushing" ? (
                    <span className="text-indigo-600">Publishing...</span>
                  ) : d.status === "error" ? (
                    <span className="text-red-600">Error</span>
                  ) : (
                    <span className="text-gray-500">Draft</span>
                  )}
                  {d.status === "pushed" && d.start_time && new Date(d.start_time) > new Date() ? (
                    <span>
                      {" "}&middot; Goes live{" "}
                      {new Date(d.start_time).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })} at{" "}
                      {new Date(d.start_time).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  ) : d.updated_at ? (
                    <span>
                      {" "}&middot;{" "}
                      {new Date(d.updated_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      {new Date(d.updated_at).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  ) : null}
                </p>
              </div>
              {d.meta_adset_id && (
                <a
                  href={`https://www.facebook.com/adsmanager/manage/adsets?act=${process.env.NEXT_PUBLIC_META_AD_ACCOUNT_ID}&selected_adset_ids=${d.meta_adset_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View in Meta
                </a>
              )}
            </div>
            );
          })}
        </div>
      )}

      {/* Variation Performance Comparison */}
      {deployments.some((d) => d.status === "pushed") && (metaPush.primaryTexts.length > 1) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <BarChart3 className="w-4 h-4" />
              Text Variation Performance
            </h3>
            <button
              onClick={async () => {
                setInsightsLoading(true);
                try {
                  const res = await fetch(`/api/image-jobs/${job.id}/variation-insights`);
                  const data = await res.json();
                  setVariationInsights(data.variations ?? []);
                } catch {
                  setVariationInsights([]);
                } finally {
                  setInsightsLoading(false);
                }
              }}
              disabled={insightsLoading}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-50"
            >
              {insightsLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : null}
              {variationInsights ? "Refresh" : "Load Performance"}
            </button>
          </div>

          {variationInsights && variationInsights.length > 0 && (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400 bg-gray-50">
                    <th className="py-2 px-3 font-medium">Variation</th>
                    <th className="py-2 px-3 font-medium text-right">Spend</th>
                    <th className="py-2 px-3 font-medium text-right">Impr.</th>
                    <th className="py-2 px-3 font-medium text-right">Clicks</th>
                    <th className="py-2 px-3 font-medium text-right">CTR</th>
                    <th className="py-2 px-3 font-medium text-right">CPC</th>
                    <th className="py-2 px-3 font-medium text-right">Conv.</th>
                    <th className="py-2 px-3 font-medium text-right">CPA</th>
                    <th className="py-2 px-3 font-medium text-right">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {variationInsights.map((v) => {
                    const bestCpa = Math.min(
                      ...variationInsights.filter((x) => x.conversions > 0).map((x) => x.cpa)
                    );
                    const isBest = v.conversions > 0 && v.cpa === bestCpa && variationInsights.length > 1;
                    return (
                      <tr
                        key={v.variation_index}
                        className={`border-t border-gray-100 ${isBest ? "bg-emerald-50" : ""}`}
                      >
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className={`font-semibold ${isBest ? "text-emerald-700" : "text-gray-700"}`}>
                              V{v.variation_index + 1}
                            </span>
                            {isBest && (
                              <span className="text-[9px] font-medium text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">
                                BEST
                              </span>
                            )}
                          </div>
                          <div className="text-gray-400 truncate max-w-[200px] mt-0.5" title={v.ad_copy}>
                            {v.ad_copy.slice(0, 60)}{v.ad_copy.length > 60 ? "..." : ""}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right text-gray-700">{v.spend.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right text-gray-700">{v.impressions.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right text-gray-700">{v.clicks.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right text-gray-700">{v.ctr.toFixed(2)}%</td>
                        <td className="py-2.5 px-3 text-right text-gray-700">{v.cpc.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right text-gray-700">{v.conversions}</td>
                        <td className={`py-2.5 px-3 text-right font-medium ${isBest ? "text-emerald-700" : "text-gray-700"}`}>
                          {v.conversions > 0 ? v.cpa.toFixed(2) : "-"}
                        </td>
                        <td className="py-2.5 px-3 text-right text-gray-700">
                          {v.roas !== null ? v.roas.toFixed(2) + "x" : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {variationInsights && variationInsights.length === 0 && (
            <p className="text-xs text-gray-400 italic">
              No performance data yet. Ads need time to deliver impressions.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ReadinessItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`flex items-center gap-1 text-xs ${
        ok ? "text-emerald-600" : "text-gray-300"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="w-3.5 h-3.5" />
      ) : (
        <span className="w-3.5 h-3.5 rounded-full border border-gray-300 inline-block" />
      )}
      {label}
    </span>
  );
}
