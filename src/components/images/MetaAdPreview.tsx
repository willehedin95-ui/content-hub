"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Send,
  ExternalLink,
  Globe,
  BookmarkCheck,
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
} from "@/types";

interface Props {
  job: ImageJob;
  copyTranslations: ConceptCopyTranslations;
  metaPush: {
    primaryTexts: string[];
    headlines: string[];
    landingPageId: string;
    pushing: boolean;
    pushResults: Array<{
      language: string;
      country: string;
      status: string;
      error?: string;
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

  // Reset navigation indices when language changes
  useEffect(() => {
    setImageIndex(0);
    setPrimaryTextIndex(0);
    setHeadlineIndex(0);
  }, [activeLang]);

  // Get completed 1:1 images for active language
  const langImages = useMemo(() => {
    return (job.source_images ?? [])
      .flatMap((si) =>
        (si.image_translations ?? [])
          .filter(
            (t) =>
              t.language === activeLang &&
              t.aspect_ratio === "1:1" &&
              t.status === "completed" &&
              t.translated_url
          )
          .map((t) => ({ sourceImage: si, translation: t }))
      )
      .sort(
        (a, b) =>
          (a.sourceImage.processing_order ?? 0) -
          (b.sourceImage.processing_order ?? 0)
      );
  }, [job.source_images, activeLang]);

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
  const canPush = hasCopy && metaPush.landingPageId && allLangsTranslated;

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
                  src={currentImage.translation.translated_url!}
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
              (si.image_translations ?? []).some(
                (t) =>
                  t.language === lang &&
                  t.aspect_ratio === "1:1" &&
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
      </div>

      {/* Push button */}
      <div className="space-y-2">
        <button
          onClick={onPushToMeta}
          disabled={metaPush.pushing || !canPush}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-6 py-3 rounded-lg transition-colors"
        >
          {metaPush.pushing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Pushing to Meta...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Push to All Markets ({job.target_languages.length})
            </>
          )}
        </button>
        {!allLangsTranslated && hasCopy && (
          <p className="text-xs text-gray-400">
            Translate all ad copy before pushing to Meta
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
                {r.status === "pushed" ? "Pushed successfully" : r.error}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Existing deployments */}
      {deployments.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-700">Deployments</h3>
          {deployments.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">{d.name}</p>
                <p className="text-xs text-gray-400">
                  {d.meta_ads?.length ?? 0} ads &middot;{" "}
                  {d.status === "pushed" ? (
                    <span className="text-emerald-600">Pushed</span>
                  ) : d.status === "pushing" ? (
                    <span className="text-indigo-600">Pushing...</span>
                  ) : d.status === "error" ? (
                    <span className="text-red-600">Error</span>
                  ) : (
                    <span className="text-gray-500">Draft</span>
                  )}
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
          ))}
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
