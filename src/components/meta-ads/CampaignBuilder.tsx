"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Check,
  Megaphone,
  ImageIcon,
  MessageSquare,
  Globe,
} from "lucide-react";
import { Language, LANGUAGES, COUNTRY_MAP, META_OBJECTIVES } from "@/types";
import { getSettings } from "@/lib/settings";

interface ImageAsset {
  id: string;
  language: string;
  aspect_ratio: string;
  translated_url: string;
  source_images: {
    id: string;
    filename: string;
    original_url: string;
    image_jobs: { id: string; name: string };
  };
}

interface AdCopyAsset {
  id: string;
  language: string;
  translated_text: string;
  ad_copy_jobs: { id: string; name: string; source_text: string };
}

interface LandingPageAsset {
  id: string;
  language: string;
  slug: string;
  published_url: string;
  seo_title: string | null;
  pages: { id: string; name: string; slug: string };
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

type Step = "setup" | "assets" | "review";

export default function CampaignBuilder({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>("setup");

  // Step 1: Setup
  const [name, setName] = useState("");
  const [objective, setObjective] = useState(() => getSettings().meta_default_objective ?? "OUTCOME_TRAFFIC");
  const [language, setLanguage] = useState<Language>("no");
  const [dailyBudget, setDailyBudget] = useState(() => getSettings().meta_default_daily_budget ?? 50);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState(() => getSettings().meta_default_schedule_time ?? "06:00");

  // Step 2: Assets
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [adCopies, setAdCopies] = useState<AdCopyAsset[]>([]);
  const [landingPages, setLandingPages] = useState<LandingPageAsset[]>([]);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [selectedCopies, setSelectedCopies] = useState<Set<string>>(new Set());
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [loadingAssets, setLoadingAssets] = useState(false);

  // Step 3: Review
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const country = COUNTRY_MAP[language];
  const langInfo = LANGUAGES.find((l) => l.value === language);

  const fetchAssets = useCallback(async () => {
    setLoadingAssets(true);
    try {
      const [imgRes, copyRes, pageRes] = await Promise.all([
        fetch(`/api/meta/assets/images?language=${language}&ratio=1:1`),
        fetch(`/api/meta/assets/ad-copy?language=${language}`),
        fetch(`/api/meta/assets/landing-pages?language=${language}`),
      ]);

      if (imgRes.ok) setImages(await imgRes.json());
      if (copyRes.ok) setAdCopies(await copyRes.json());
      if (pageRes.ok) setLandingPages(await pageRes.json());
    } finally {
      setLoadingAssets(false);
    }
  }, [language]);

  useEffect(() => {
    if (step === "assets") fetchAssets();
  }, [step, fetchAssets]);

  function toggleImage(id: string) {
    setSelectedImages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCopy(id: string) {
    setSelectedCopies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Build ad combinations for review
  const selectedImageAssets = images.filter((i) => selectedImages.has(i.id));
  const selectedCopyAssets = adCopies.filter((c) => selectedCopies.has(c.id));
  const selectedPageAsset = landingPages.find((p) => p.id === selectedPage);

  const adCombinations = selectedImageAssets.flatMap((img) =>
    selectedCopyAssets.map((copy) => ({
      image: img,
      copy,
      landingPage: selectedPageAsset,
    }))
  );

  const canProceedToAssets = name.trim() && dailyBudget > 0;
  const canProceedToReview =
    selectedImages.size > 0 && selectedCopies.size > 0 && selectedPage;

  async function handleSubmit() {
    if (!selectedPageAsset) return;
    setSubmitting(true);
    setError("");

    try {
      const ads = adCombinations.map((combo) => ({
        image_url: combo.image.translated_url,
        ad_copy: combo.copy.translated_text,
        landing_page_url: combo.landingPage!.published_url,
        aspect_ratio: combo.image.aspect_ratio,
      }));

      const startTime = scheduleDate
        ? new Date(`${scheduleDate}T${scheduleTime || "00:00"}:00`).toISOString()
        : null;

      const res = await fetch("/api/meta/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          objective,
          language,
          countries: [country],
          daily_budget: Math.round(dailyBudget * 100),
          ...(startTime ? { start_time: startTime } : {}),
          ads,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create campaign");
      }

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <Megaphone className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">New Campaign</h2>
            <StepIndicator current={step} />
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === "setup" && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Campaign Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., HappySleep NO - Feb 2026"
                  className="w-full bg-white border border-gray-300 text-gray-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Objective
                </label>
                <select
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  className="w-full bg-white border border-gray-300 text-gray-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                >
                  {META_OBJECTIVES.map((obj) => (
                    <option key={obj.value} value={obj.value}>
                      {obj.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Market
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {LANGUAGES.filter((l) => l.domain).map((lang) => {
                    const selected = language === lang.value;
                    return (
                      <button
                        key={lang.value}
                        type="button"
                        onClick={() => setLanguage(lang.value)}
                        className={`flex items-center gap-2.5 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                          selected
                            ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                            : "bg-white border-gray-200 text-gray-400 hover:text-gray-700"
                        }`}
                      >
                        <span className="text-base">{lang.flag}</span>
                        {lang.label}
                        <span className="text-xs text-gray-400 ml-auto">
                          {COUNTRY_MAP[lang.value]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Daily Budget (USD)
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">$</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={dailyBudget}
                    onChange={(e) => setDailyBudget(Number(e.target.value))}
                    className="w-32 bg-white border border-gray-300 text-gray-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-xs text-gray-400">/day</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Schedule
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    className="bg-white border border-gray-300 text-gray-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="bg-white border border-gray-300 text-gray-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {scheduleDate ? "Campaign will start at this date/time" : "Leave empty to start manually"}
                </p>
              </div>
            </div>
          )}

          {step === "assets" && (
            <div className="space-y-6">
              {loadingAssets ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : (
                <>
                  {/* Images */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <ImageIcon className="w-4 h-4 text-pink-600" />
                      <h3 className="text-sm font-semibold text-gray-700">
                        Images ({selectedImages.size} selected)
                      </h3>
                    </div>
                    {images.length === 0 ? (
                      <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-4 py-3">
                        No completed {langInfo?.label} image translations found.
                        Translate some static ads first.
                      </p>
                    ) : (
                      <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                        {images.map((img) => {
                          const selected = selectedImages.has(img.id);
                          return (
                            <button
                              key={img.id}
                              onClick={() => toggleImage(img.id)}
                              className={`relative rounded-lg overflow-hidden border-2 transition-colors ${
                                selected
                                  ? "border-indigo-500"
                                  : "border-transparent hover:border-gray-300"
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={img.translated_url}
                                alt={img.source_images.filename}
                                className="w-full aspect-square object-cover"
                              />
                              {selected && (
                                <div className="absolute top-1 right-1 w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center">
                                  <Check className="w-3 h-3 text-white" />
                                </div>
                              )}
                              {img.aspect_ratio !== "1:1" && (
                                <span className="absolute bottom-1 left-1 text-xs bg-black/60 text-white px-1 rounded">
                                  {img.aspect_ratio}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Ad Copy */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <MessageSquare className="w-4 h-4 text-amber-600" />
                      <h3 className="text-sm font-semibold text-gray-700">
                        Ad Copy ({selectedCopies.size} selected)
                      </h3>
                    </div>
                    {adCopies.length === 0 ? (
                      <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-4 py-3">
                        No completed {langInfo?.label} ad copy translations
                        found. Translate some ad copy first.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {adCopies.map((copy) => {
                          const selected = selectedCopies.has(copy.id);
                          return (
                            <button
                              key={copy.id}
                              onClick={() => toggleCopy(copy.id)}
                              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                                selected
                                  ? "border-indigo-500 bg-indigo-50"
                                  : "border-gray-200 hover:border-gray-300"
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <div
                                  className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 ${
                                    selected
                                      ? "bg-indigo-600 border-indigo-600"
                                      : "border-gray-300"
                                  }`}
                                >
                                  {selected && (
                                    <Check className="w-3 h-3 text-white" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium text-gray-700 truncate">
                                    {copy.ad_copy_jobs.name}
                                  </p>
                                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                                    {copy.translated_text}
                                  </p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Landing Pages */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Globe className="w-4 h-4 text-indigo-600" />
                      <h3 className="text-sm font-semibold text-gray-700">
                        Landing Page
                      </h3>
                    </div>
                    {landingPages.length === 0 ? (
                      <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-4 py-3">
                        No published {langInfo?.label} landing pages found.
                        Publish a page first.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {landingPages.map((page) => {
                          const selected = selectedPage === page.id;
                          return (
                            <button
                              key={page.id}
                              onClick={() => setSelectedPage(page.id)}
                              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                                selected
                                  ? "border-indigo-500 bg-indigo-50"
                                  : "border-gray-200 hover:border-gray-300"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                    selected
                                      ? "bg-indigo-600 border-indigo-600"
                                      : "border-gray-300"
                                  }`}
                                >
                                  {selected && (
                                    <div className="w-2 h-2 rounded-full bg-white" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium text-gray-700">
                                    {page.pages.name}
                                  </p>
                                  <p className="text-xs text-gray-400 truncate">
                                    {page.published_url}
                                  </p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {step === "review" && (
            <div className="space-y-5">
              {/* Summary */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Campaign Summary
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-400">Name</span>
                    <p className="text-gray-700 font-medium">{name}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Objective</span>
                    <p className="text-gray-700 font-medium">
                      {META_OBJECTIVES.find((o) => o.value === objective)?.label}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400">Market</span>
                    <p className="text-gray-700 font-medium">
                      {langInfo?.flag} {langInfo?.label} ({country})
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400">Daily Budget</span>
                    <p className="text-gray-700 font-medium">${dailyBudget}/day</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Total Ads</span>
                    <p className="text-gray-700 font-medium">
                      {adCombinations.length} ({selectedImages.size} images x{" "}
                      {selectedCopies.size} copies)
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400">Landing Page</span>
                    <p className="text-gray-700 font-medium truncate">
                      {selectedPageAsset?.pages.name}
                    </p>
                  </div>
                </div>
              </div>

              {/* Ad previews */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Ad Previews
                </h3>
                <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                  {adCombinations.map((combo, i) => (
                    <div
                      key={i}
                      className="border border-gray-200 rounded-lg overflow-hidden"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={combo.image.translated_url}
                        alt=""
                        className="w-full aspect-square object-cover"
                      />
                      <div className="p-2.5">
                        <p className="text-xs text-gray-700 line-clamp-2">
                          {combo.copy.translated_text}
                        </p>
                        <p className="text-xs text-gray-400 mt-1 truncate">
                          {combo.landingPage?.published_url}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">
                  {error}
                </p>
              )}

              <p className="text-xs text-gray-400">
                Campaign will be created as <strong>Paused</strong> in Meta Ads
                Manager. You can review and activate it there.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 shrink-0">
          <div>
            {step !== "setup" && (
              <button
                onClick={() =>
                  setStep(step === "review" ? "assets" : "setup")
                }
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            )}
          </div>
          <div>
            {step === "setup" && (
              <button
                onClick={() => setStep("assets")}
                disabled={!canProceedToAssets}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
              >
                Select Assets
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {step === "assets" && (
              <button
                onClick={() => setStep("review")}
                disabled={!canProceedToReview}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
              >
                Review ({adCombinations.length} ads)
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {step === "review" && (
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
                {submitting ? "Creating..." : "Create Campaign"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "setup", label: "Setup" },
    { key: "assets", label: "Assets" },
    { key: "review", label: "Review" },
  ];
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
            {i < currentIndex ? <Check className="w-3 h-3 inline" /> : null}{" "}
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
