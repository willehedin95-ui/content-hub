"use client";

import { useState, useEffect } from "react";
import {
  X,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Check,
  Megaphone,
  ImageIcon,
  Type,
  Globe,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import {
  Language,
  LANGUAGES,
  COUNTRY_MAP,
  Product,
  PRODUCTS,
  MetaCampaignMapping,
} from "@/types";

/* ────────────────── Types ────────────────── */

interface ImageAsset {
  id: string;
  language: string;
  aspect_ratio: string;
  translated_url: string;
  source_images: {
    id: string;
    filename: string | null;
    original_url: string;
    image_jobs: { id: string; name: string; product: string | null };
  };
}

interface LandingPageAsset {
  id: string;
  language: string;
  slug: string;
  published_url: string;
  seo_title: string | null;
  pages: { id: string; name: string; slug: string; product: string | null };
}

interface GroupedImage {
  key: string;
  sourceImageId: string;
  filename: string;
  jobName: string;
  aspectRatio: string;
  originalUrl: string;
  translations: Record<string, ImageAsset>;
}

interface PageGroup {
  pageId: string;
  pageName: string;
  translations: Record<string, LandingPageAsset>;
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

type Step = "product" | "images" | "copy" | "details" | "review";

const STEPS: { key: Step; label: string }[] = [
  { key: "product", label: "Product" },
  { key: "images", label: "Images" },
  { key: "copy", label: "Ad Copy" },
  { key: "details", label: "Details" },
  { key: "review", label: "Review" },
];

/* ────────────────── Component ────────────────── */

export default function AdSetBuilder({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>("product");

  /* ── Step 1: Product & Markets ── */
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [campaignMappings, setCampaignMappings] = useState<MetaCampaignMapping[]>([]);
  const [loadingMappings, setLoadingMappings] = useState(true);
  const [selectedMarkets, setSelectedMarkets] = useState<Set<Language>>(new Set());

  /* ── Step 2: Images ── */
  const [groupedImages, setGroupedImages] = useState<GroupedImage[]>([]);
  const [selectedImageKeys, setSelectedImageKeys] = useState<Set<string>>(new Set());
  const [loadingImages, setLoadingImages] = useState(false);

  /* ── Step 3: Ad Copy ── */
  const [primaryText, setPrimaryText] = useState("");
  const [headlineText, setHeadlineText] = useState("");
  const [copyTranslations, setCopyTranslations] = useState<
    Record<string, { primary_text: string; headline: string }>
  >({});
  const [translating, setTranslating] = useState(false);

  /* ── Step 4: Details ── */
  const [pageGroups, setPageGroups] = useState<PageGroup[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [urlsByMarket, setUrlsByMarket] = useState<Record<string, string>>({});
  const [conceptNumber, setConceptNumber] = useState("");
  const [conceptName, setConceptName] = useState("");
  const [loadingPages, setLoadingPages] = useState(false);

  /* ── Submission ── */
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const markets = Array.from(selectedMarkets).sort() as Language[];

  /* ── Escape key to close ── */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [submitting, onClose]);

  /* ── Fetch campaign mappings on mount ── */
  useEffect(() => {
    fetch("/api/meta/campaign-mappings")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: MetaCampaignMapping[]) => setCampaignMappings(data))
      .catch(() => {})
      .finally(() => setLoadingMappings(false));
  }, []);

  /* ── Get mapping for a product + market ── */
  function getMapping(lang: Language): MetaCampaignMapping | undefined {
    if (!selectedProduct) return undefined;
    const country = COUNTRY_MAP[lang];
    return campaignMappings.find(
      (m) => m.product === selectedProduct && m.country === country
    );
  }

  /* ── Check which markets have unmapped combos (need both campaign + template ad set) ── */
  const unmappedMarkets = markets.filter((m) => {
    const mapping = getMapping(m);
    return !mapping || !mapping.template_adset_id;
  });

  /* ── Fetch images for all selected markets (filtered by product) ── */
  async function fetchImages() {
    if (markets.length === 0) return;
    setLoadingImages(true);
    try {
      const productParam = selectedProduct ? `&product=${selectedProduct}` : "";
      const results = await Promise.all(
        markets.map(async (lang) => {
          const res = await fetch(
            `/api/meta/assets/images?language=${lang}${productParam}`
          );
          return {
            lang,
            data: res.ok ? ((await res.json()) as ImageAsset[]) : [],
          };
        })
      );

      const groups: Record<string, GroupedImage> = {};
      for (const { lang, data } of results) {
        for (const asset of data) {
          const key = `${asset.source_images.id}:${asset.aspect_ratio}`;
          if (!groups[key]) {
            groups[key] = {
              key,
              sourceImageId: asset.source_images.id,
              filename: asset.source_images.filename || "Untitled",
              jobName: asset.source_images.image_jobs.name,
              aspectRatio: asset.aspect_ratio,
              originalUrl: asset.source_images.original_url,
              translations: {},
            };
          }
          groups[key].translations[lang] = asset;
        }
      }

      // Only show images available in ALL selected markets
      const available = Object.values(groups).filter((g) =>
        markets.every((m) => g.translations[m])
      );
      setGroupedImages(available);
    } finally {
      setLoadingImages(false);
    }
  }

  /* ── Fetch landing pages for all selected markets (filtered by product) ── */
  async function fetchLandingPages() {
    if (markets.length === 0) return;
    setLoadingPages(true);
    try {
      const productParam = selectedProduct ? `&product=${selectedProduct}` : "";
      const results = await Promise.all(
        markets.map(async (lang) => {
          const res = await fetch(
            `/api/meta/assets/landing-pages?language=${lang}${productParam}`
          );
          return {
            lang,
            data: res.ok ? ((await res.json()) as LandingPageAsset[]) : [],
          };
        })
      );

      const groups: Record<string, PageGroup> = {};
      for (const { lang, data } of results) {
        for (const page of data) {
          if (!groups[page.pages.id]) {
            groups[page.pages.id] = {
              pageId: page.pages.id,
              pageName: page.pages.name,
              translations: {},
            };
          }
          groups[page.pages.id].translations[lang] = page;
        }
      }
      setPageGroups(Object.values(groups));
    } finally {
      setLoadingPages(false);
    }
  }

  /* ── Select product (clears downstream state) ── */
  function handleProductSelect(product: Product) {
    if (selectedProduct === product) return;
    setSelectedProduct(product);
    setSelectedMarkets(new Set());
    setSelectedImageKeys(new Set());
    setCopyTranslations({});
    setUrlsByMarket({});
    setSelectedPageId(null);
  }

  /* ── Toggle market selection (clears downstream state) ── */
  function toggleMarket(lang: Language) {
    setSelectedMarkets((prev) => {
      const next = new Set(prev);
      if (next.has(lang)) next.delete(lang);
      else next.add(lang);
      return next;
    });
    setSelectedImageKeys(new Set());
    setCopyTranslations({});
    setUrlsByMarket({});
    setSelectedPageId(null);
  }

  /* ── Toggle image selection ── */
  function toggleImage(key: string) {
    setSelectedImageKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /* ── Translate ad copy to all selected markets ── */
  async function translateCopy() {
    if (!primaryText.trim()) return;
    setTranslating(true);
    try {
      const results: Record<
        string,
        { primary_text: string; headline: string }
      > = {};
      await Promise.all(
        markets.map(async (lang) => {
          const res = await fetch("/api/meta/translate-copy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              primary_text: primaryText,
              headline: headlineText,
              language: lang,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            results[lang] = {
              primary_text: data.translated_primary_text,
              headline: data.translated_headline,
            };
          }
        })
      );
      setCopyTranslations((prev) => ({ ...prev, ...results }));
    } finally {
      setTranslating(false);
    }
  }

  /* ── Handle landing page selection ── */
  function handlePageSelect(pageId: string) {
    setSelectedPageId(pageId);
    const group = pageGroups.find((p) => p.pageId === pageId);
    if (group) {
      const urls: Record<string, string> = {};
      for (const market of markets) {
        urls[market] = group.translations[market]?.published_url || "";
      }
      setUrlsByMarket(urls);
    }
  }

  /* ── Auto-populate concept from selected images ── */
  useEffect(() => {
    if (selectedImageKeys.size === 0 || groupedImages.length === 0) return;
    const selectedJobNames = new Set(
      groupedImages
        .filter((g) => selectedImageKeys.has(g.key))
        .map((g) => g.jobName)
    );
    if (selectedJobNames.size === 1) {
      const jobName = [...selectedJobNames][0];
      const match = jobName.match(/^#(\d+)\s+(.+)$/);
      if (match) {
        setConceptNumber(match[1]);
        setConceptName(match[2].toLowerCase());
      }
    }
  }, [selectedImageKeys, groupedImages]);

  /* ── Navigation ── */
  function goToStep(target: Step) {
    setStep(target);
    if (target === "images") fetchImages();
    if (target === "details") fetchLandingPages();
  }

  function goNext() {
    const idx = STEPS.findIndex((s) => s.key === step);
    if (idx < STEPS.length - 1) goToStep(STEPS[idx + 1].key);
  }

  function goBack() {
    const idx = STEPS.findIndex((s) => s.key === step);
    if (idx > 0) goToStep(STEPS[idx - 1].key);
  }

  /* ── Computed values ── */
  const selectedImgs = groupedImages.filter((g) =>
    selectedImageKeys.has(g.key)
  );

  function getUrlForMarket(lang: string): string {
    return urlsByMarket[lang] || "";
  }

  const totalAdsPerMarket = selectedImgs.length;
  const totalAds = totalAdsPerMarket * markets.length;

  /* ── Validation ── */
  const canProceed: Record<Step, boolean> = {
    product:
      !!selectedProduct &&
      selectedMarkets.size > 0 &&
      unmappedMarkets.length === 0,
    images: selectedImageKeys.size > 0,
    copy:
      !!primaryText.trim() &&
      markets.length > 0 &&
      markets.every((m) => copyTranslations[m]?.primary_text?.trim()),
    details:
      !!conceptNumber.trim() &&
      !!conceptName.trim() &&
      markets.every((m) => !!getUrlForMarket(m)),
    review: true,
  };

  /* ── Generate ad set name from concept ── */
  function getAdSetName(countryCode: string): string {
    return `${countryCode} #${conceptNumber} | statics | ${conceptName.trim().toLowerCase()}`;
  }

  /* ── Submit ── */
  async function handleSubmit() {
    setSubmitting(true);
    setError("");

    try {
      // Create one ad set (meta_campaigns row) per market
      for (const market of markets) {
        const countryCode = COUNTRY_MAP[market];
        const mapping = getMapping(market);
        if (!mapping || !mapping.template_adset_id) {
          throw new Error(`No campaign/template mapping for ${selectedProduct} + ${countryCode}`);
        }

        const ads = selectedImgs.map((img) => ({
          image_url: img.translations[market].translated_url,
          ad_copy: copyTranslations[market].primary_text,
          headline: copyTranslations[market].headline || null,
          source_primary_text: primaryText,
          source_headline: headlineText || null,
          landing_page_url: getUrlForMarket(market),
          aspect_ratio: img.aspectRatio,
        }));

        const res = await fetch("/api/meta/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: getAdSetName(countryCode),
            objective: "OUTCOME_TRAFFIC",
            language: market,
            countries: [countryCode],
            product: selectedProduct,
            meta_campaign_id: mapping.meta_campaign_id,
            ads,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            data.error ?? `Failed to create ad set for ${countryCode}`
          );
        }
      }

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  /* ── Render ── */
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <Megaphone className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              New Ad Set
            </h2>
            <StepIndicator steps={STEPS} current={step} />
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* ── STEP 1: Product & Markets ── */}
          {step === "product" && (
            <div className="space-y-6">
              {/* Product selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Product
                </label>
                <div className="flex gap-2">
                  {PRODUCTS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => handleProductSelect(p.value)}
                      className={`flex items-center gap-2 px-5 py-3 rounded-lg border text-sm font-medium transition-colors ${
                        selectedProduct === p.value
                          ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                          : "bg-white border-gray-200 text-gray-400 hover:text-gray-700"
                      }`}
                    >
                      {selectedProduct === p.value && (
                        <Check className="w-3.5 h-3.5 text-indigo-600" />
                      )}
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Market selection */}
              {selectedProduct && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Target Markets
                  </label>
                  <p className="text-xs text-gray-400 mb-2">
                    One ad set will be duplicated from template per market, with localized
                    content.
                  </p>
                  {loadingMappings ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading campaign mappings...
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {LANGUAGES.map((lang) => {
                        const selected = selectedMarkets.has(lang.value);
                        const mapping = getMapping(lang.value);
                        const isMapped = !!mapping && !!mapping.template_adset_id;

                        return (
                          <button
                            key={lang.value}
                            type="button"
                            onClick={() => toggleMarket(lang.value)}
                            className={`flex items-center gap-2.5 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                              selected
                                ? isMapped
                                  ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                                  : "bg-amber-50 border-amber-300 text-amber-700"
                                : "bg-white border-gray-200 text-gray-400 hover:text-gray-700"
                            }`}
                          >
                            {selected && isMapped && (
                              <Check className="w-3.5 h-3.5 text-indigo-600" />
                            )}
                            {selected && !isMapped && (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            )}
                            {!selected && (
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  isMapped ? "bg-emerald-400" : "bg-gray-300"
                                }`}
                              />
                            )}
                            <span className="text-base">{lang.flag}</span>
                            {lang.label}
                            <span className="text-xs text-gray-400 ml-auto">
                              {COUNTRY_MAP[lang.value]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Warning for unmapped markets */}
                  {unmappedMarkets.length > 0 && selectedMarkets.size > 0 && (
                    <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-amber-700 font-medium">
                          Unmapped markets
                        </p>
                        <p className="text-xs text-amber-600 mt-0.5">
                          {unmappedMarkets
                            .map(
                              (m) =>
                                `${LANGUAGES.find((l) => l.value === m)?.flag} ${COUNTRY_MAP[m]}`
                            )
                            .join(", ")}{" "}
                          — go to Settings → Meta Campaign Mapping to assign campaigns and template ad sets.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Images ── */}
          {step === "images" && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <ImageIcon className="w-4 h-4 text-pink-600" />
                <h3 className="text-sm font-semibold text-gray-700">
                  Select Images ({selectedImageKeys.size} selected)
                </h3>
                <span className="text-xs text-gray-400 ml-auto">
                  Showing {selectedProduct ? PRODUCTS.find((p) => p.value === selectedProduct)?.label : ""} images for {markets.length} market
                  {markets.length !== 1 ? "s" : ""}
                </span>
              </div>

              {loadingImages ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : groupedImages.length === 0 ? (
                <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-4 py-3">
                  No images found with translations for all selected markets.
                  Translate some static ads first.
                </p>
              ) : (
                <div>
                  {Object.entries(
                    groupedImages.reduce<Record<string, GroupedImage[]>>(
                      (acc, img) => {
                        (acc[img.jobName] ??= []).push(img);
                        return acc;
                      },
                      {}
                    )
                  ).map(([jobName, imgs]) => (
                    <div key={jobName} className="mb-4">
                      <p className="text-xs font-medium text-gray-500 mb-2">
                        {jobName}
                      </p>
                      <div className="grid grid-cols-5 gap-2">
                        {imgs.map((img) => {
                          const selected = selectedImageKeys.has(img.key);
                          return (
                            <button
                              key={img.key}
                              onClick={() => toggleImage(img.key)}
                              className={`relative rounded-lg overflow-hidden border-2 transition-colors ${
                                selected
                                  ? "border-indigo-500"
                                  : "border-transparent hover:border-gray-300"
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={img.originalUrl}
                                alt={img.filename}
                                className="w-full aspect-square object-cover"
                              />
                              {selected && (
                                <div className="absolute top-1 right-1 w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center">
                                  <Check className="w-3 h-3 text-white" />
                                </div>
                              )}
                              {img.aspectRatio !== "1:1" && (
                                <span className="absolute bottom-1 left-1 text-xs bg-black/60 text-white px-1 rounded">
                                  {img.aspectRatio}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Ad Copy ── */}
          {step === "copy" && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Type className="w-4 h-4 text-amber-600" />
                  <h3 className="text-sm font-semibold text-gray-700">
                    English Ad Copy
                  </h3>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Primary Text
                    </label>
                    <textarea
                      value={primaryText}
                      onChange={(e) => setPrimaryText(e.target.value)}
                      rows={4}
                      placeholder="Write the main ad copy in English..."
                      className="w-full bg-white border border-gray-300 text-gray-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Headline
                    </label>
                    <input
                      type="text"
                      value={headlineText}
                      onChange={(e) => setHeadlineText(e.target.value)}
                      placeholder="Optional headline..."
                      className="w-full bg-white border border-gray-300 text-gray-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <button
                    onClick={translateCopy}
                    disabled={!primaryText.trim() || translating}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    {translating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    {translating
                      ? "Translating..."
                      : `Translate to ${markets.length} market${markets.length !== 1 ? "s" : ""}`}
                  </button>
                </div>
              </div>

              {/* Translations */}
              {Object.keys(copyTranslations).length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-gray-700">
                    Translations
                  </h4>
                  {markets.map((lang) => {
                    const langInfo = LANGUAGES.find((l) => l.value === lang);
                    const t = copyTranslations[lang];
                    if (!t) return null;
                    return (
                      <div key={lang} className="bg-gray-50 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-base">{langInfo?.flag}</span>
                          <span className="text-sm font-medium text-gray-700">
                            {langInfo?.label}
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              Primary Text
                            </label>
                            <textarea
                              value={t.primary_text}
                              onChange={(e) =>
                                setCopyTranslations((prev) => ({
                                  ...prev,
                                  [lang]: {
                                    ...prev[lang],
                                    primary_text: e.target.value,
                                  },
                                }))
                              }
                              rows={3}
                              className="w-full bg-white border border-gray-300 text-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              Headline
                            </label>
                            <input
                              type="text"
                              value={t.headline}
                              onChange={(e) =>
                                setCopyTranslations((prev) => ({
                                  ...prev,
                                  [lang]: {
                                    ...prev[lang],
                                    headline: e.target.value,
                                  },
                                }))
                              }
                              className="w-full bg-white border border-gray-300 text-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 4: Details ── */}
          {step === "details" && (
            <div className="space-y-5">
              {/* Landing Page */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Globe className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-semibold text-gray-700">
                    Landing Page
                  </h3>
                </div>

                {loadingPages ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading published pages...
                  </div>
                ) : pageGroups.length > 0 ? (
                  <select
                    value={selectedPageId || ""}
                    onChange={(e) => handlePageSelect(e.target.value)}
                    className="w-full bg-white border border-gray-300 text-gray-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 mb-3"
                  >
                    <option value="">Select a published page...</option>
                    {pageGroups.map((pg) => (
                      <option key={pg.pageId} value={pg.pageId}>
                        {pg.pageName} (
                        {Object.keys(pg.translations)
                          .map(
                            (l) =>
                              LANGUAGES.find((la) => la.value === l)?.flag
                          )
                          .join(" ")}
                        )
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-4 py-3 mb-3">
                    No published pages found. Enter URLs manually below.
                  </p>
                )}

                {/* Per-market URLs */}
                <div className="space-y-2">
                  {markets.map((lang) => {
                    const langInfo = LANGUAGES.find((l) => l.value === lang);
                    return (
                      <div key={lang} className="flex items-center gap-2">
                        <span className="text-sm w-6 text-center">
                          {langInfo?.flag}
                        </span>
                        <input
                          type="url"
                          value={urlsByMarket[lang] || ""}
                          onChange={(e) =>
                            setUrlsByMarket((prev) => ({
                              ...prev,
                              [lang]: e.target.value,
                            }))
                          }
                          placeholder={`Landing page URL for ${langInfo?.label}...`}
                          className="flex-1 bg-white border border-gray-300 text-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Concept */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Concept
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-gray-500">#</span>
                    <input
                      type="text"
                      value={conceptNumber}
                      onChange={(e) => setConceptNumber(e.target.value.replace(/\D/g, ""))}
                      placeholder="015"
                      className="w-20 bg-white border border-gray-300 text-gray-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <input
                    type="text"
                    value={conceptName}
                    onChange={(e) => setConceptName(e.target.value)}
                    placeholder="concept name"
                    className="flex-1 bg-white border border-gray-300 text-gray-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                {conceptNumber.trim() && conceptName.trim() && (
                  <p className="text-xs text-gray-400 mt-1.5">
                    Creates:{" "}
                    {markets
                      .map(
                        (m) => `"${COUNTRY_MAP[m]} #${conceptNumber} | statics | ${conceptName.trim().toLowerCase()}"`
                      )
                      .join(", ")}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 5: Review ── */}
          {step === "review" && (
            <div className="space-y-5">
              {/* Summary */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Summary
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-400">Product</span>
                    <p className="text-gray-700 font-medium">
                      {PRODUCTS.find((p) => p.value === selectedProduct)?.label}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400">Markets</span>
                    <p className="text-gray-700 font-medium">
                      {markets
                        .map(
                          (m) =>
                            LANGUAGES.find((l) => l.value === m)?.flag
                        )
                        .join(" ")}{" "}
                      ({markets.length})
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400">Concept</span>
                    <p className="text-gray-700 font-medium">
                      #{conceptNumber} | {conceptName.trim().toLowerCase()}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400">Total Ads</span>
                    <p className="text-gray-700 font-medium">
                      {totalAds} ({markets.length} market
                      {markets.length !== 1 ? "s" : ""} ×{" "}
                      {selectedImgs.length} image
                      {selectedImgs.length !== 1 ? "s" : ""})
                    </p>
                  </div>
                </div>
              </div>

              {/* Per-market details */}
              {markets.map((lang) => {
                const langInfo = LANGUAGES.find((l) => l.value === lang);
                const t = copyTranslations[lang];
                const mapping = getMapping(lang);
                return (
                  <div
                    key={lang}
                    className="border border-gray-200 rounded-xl p-4"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">{langInfo?.flag}</span>
                      <h4 className="text-sm font-semibold text-gray-900">
                        {langInfo?.label} ({COUNTRY_MAP[lang]})
                      </h4>
                      <span className="text-xs text-gray-400 ml-auto">
                        {getAdSetName(COUNTRY_MAP[lang])}
                      </span>
                    </div>
                    {mapping && (
                      <p className="text-xs text-gray-400 mb-2">
                        Campaign: {mapping.meta_campaign_name || mapping.meta_campaign_id}
                      </p>
                    )}
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-gray-400">Primary Text</span>
                        <p className="text-gray-700 line-clamp-2">
                          {t?.primary_text}
                        </p>
                      </div>
                      {t?.headline && (
                        <div>
                          <span className="text-gray-400">Headline</span>
                          <p className="text-gray-700">{t.headline}</p>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-400">Landing Page</span>
                        <p className="text-gray-700 truncate">
                          {getUrlForMarket(lang)}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-400">
                          Images ({selectedImgs.length})
                        </span>
                        <div className="flex gap-1 mt-1">
                          {selectedImgs.slice(0, 6).map((img) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={img.key}
                              src={
                                img.translations[lang]?.translated_url ||
                                img.originalUrl
                              }
                              alt=""
                              className="w-10 h-10 rounded object-cover"
                            />
                          ))}
                          {selectedImgs.length > 6 && (
                            <span className="text-gray-400 text-xs flex items-center">
                              +{selectedImgs.length - 6}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">
                  {error}
                </p>
              )}

              <p className="text-xs text-gray-400">
                Template ad sets will be duplicated as <strong>Paused</strong> in Meta Ads
                Manager. All settings (targeting, placements, budget) are inherited from the template.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 shrink-0">
          <div>
            {step !== "product" && (
              <button
                onClick={goBack}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            )}
          </div>
          <div>
            {step !== "review" ? (
              <button
                onClick={goNext}
                disabled={!canProceed[step]}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
              >
                {step === "details" ? "Review" : "Next"}
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Megaphone className="w-4 h-4" />
                )}
                {submitting
                  ? "Creating..."
                  : `Create ${markets.length} Ad Set${markets.length !== 1 ? "s" : ""}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────── Helpers ────────────────── */

function StepIndicator({
  steps,
  current,
}: {
  steps: typeof STEPS;
  current: Step;
}) {
  const currentIndex = steps.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center gap-1 ml-2">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1">
          <span
            className={`text-xs font-medium px-1.5 py-0.5 rounded ${
              i === currentIndex
                ? "bg-indigo-100 text-indigo-700"
                : i < currentIndex
                  ? "text-emerald-600"
                  : "text-gray-400"
            }`}
          >
            {i < currentIndex ? (
              <Check className="w-3 h-3 inline" />
            ) : null}{" "}
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <span className="text-gray-300 text-xs">&gt;</span>
          )}
        </div>
      ))}
    </div>
  );
}
