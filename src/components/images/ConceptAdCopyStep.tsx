"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  AlertTriangle,
  RotateCcw,
  X,
  FileText,
  Globe,
  Type,
  Wrench,
  BookmarkCheck,
} from "lucide-react";
import { ImageJob, Language, LANGUAGES, ConceptCopyTranslation, ConceptCopyTranslations } from "@/types";
import type { CopyBankEntry, ProductSegment } from "@/types";
import { deriveCopyGrade, gradeConfig } from "@/lib/quality-grades";
import CopyBankPicker from "./CopyBankPicker";
import LandingPageModal from "./LandingPageModal";

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function QualityBadge({ analysis }: { analysis: { fluency_issues?: string[]; grammar_issues?: string[]; context_errors?: string[] } }) {
  const grade = deriveCopyGrade(analysis);
  const cfg = gradeConfig(grade);
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Landing page modal trigger                                         */
/* ------------------------------------------------------------------ */

function LandingPageModalTrigger({
  landingPages,
  abTests,
  selectedValue,
  onSelect,
  conceptTags,
  conceptAngle,
}: {
  landingPages: Array<{ id: string; name: string; slug: string; product: string; tags?: string[]; page_type?: string; angle?: string; thumbnail_url?: string | null }>;
  abTests: Array<{ id: string; name: string; slug: string; language: string; router_url: string }>;
  selectedValue: string;
  onSelect: (value: string) => void;
  conceptTags?: string[];
  conceptAngle?: string;
}) {
  const [open, setOpen] = useState(false);

  const selectedPage = landingPages.find((p) => p.id === selectedValue);
  const selectedTest = abTests.find((t) => `abtest:${t.id}` === selectedValue);
  const label = selectedPage?.name ?? selectedTest?.name ?? "Select a destination...";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 bg-white border border-gray-300 text-gray-800 rounded-lg px-3 py-2.5 text-sm text-left hover:border-indigo-400 focus:outline-none focus:border-indigo-500 transition-colors"
      >
        {selectedPage?.thumbnail_url ? (
          <img src={selectedPage.thumbnail_url} alt="" className="w-8 h-10 object-cover object-top rounded" />
        ) : (
          <div className="w-8 h-10 bg-gray-100 rounded flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-gray-300" />
          </div>
        )}
        <span className={selectedValue ? "text-gray-900" : "text-gray-400"}>{label}</span>
      </button>
      <LandingPageModal
        open={open}
        onClose={() => setOpen(false)}
        onSelect={onSelect}
        landingPages={landingPages}
        abTests={abTests}
        selectedValue={selectedValue}
        conceptTags={conceptTags}
        conceptAngle={conceptAngle}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface ConceptAdCopyStepProps {
  job: ImageJob;
  // Meta push state (primary texts, headlines, landing page, ab test)
  metaPush: {
    primaryTexts: string[];
    headlines: string[];
    landingPageId: string;
    abTestId: string;
  };
  // Copy translation state
  copyTranslations: ConceptCopyTranslations;
  copyState: {
    saving: boolean;
    translating: boolean;
    translatingLang: Language | null;
  };
  // Doc fetch state
  doc: {
    fetching: boolean;
    tabs: Array<{ id: string; title: string }> | null;
    error: string | null;
    matchedTab: string | null;
  };
  // Landing pages and AB tests
  landingPages: Array<{ id: string; name: string; slug: string; product: string; tags?: string[]; page_type?: string; angle?: string; thumbnail_url?: string | null }>;
  abTests: Array<{ id: string; name: string; slug: string; language: string; router_url: string }>;
  // Handlers
  handlePrimaryChange: (index: number, value: string) => void;
  handleHeadlineChange: (index: number, value: string) => void;
  handleTranslatedCopyChange: (lang: string, field: "primary_texts" | "headlines", index: number, value: string) => void;
  addPrimaryText: () => void;
  removePrimaryText: (index: number) => void;
  addHeadline: () => void;
  removeHeadline: (index: number) => void;
  handleFetchFromDoc: (tabId?: string) => void;
  handleTranslateCopy: (lang?: Language, corrections?: string) => void;
  handleWebsiteUrlChange: (value: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ConceptAdCopyStep({
  job,
  metaPush,
  copyTranslations,
  copyState,
  doc,
  landingPages,
  abTests,
  handlePrimaryChange,
  handleHeadlineChange,
  handleTranslatedCopyChange,
  addPrimaryText,
  removePrimaryText,
  addHeadline,
  removeHeadline,
  handleFetchFromDoc,
  handleTranslateCopy,
  handleWebsiteUrlChange,
}: ConceptAdCopyStepProps) {
  const [copyBankLang, setCopyBankLang] = useState<string | null>(null);
  const [segments, setSegments] = useState<ProductSegment[]>([]);

  useEffect(() => {
    if (!job.product) return;
    async function loadSegments() {
      const res = await fetch(`/api/products/${job.product}`);
      if (res.ok) {
        const data = await res.json();
        setSegments(data.product_segments ?? []);
      }
    }
    loadSegments();
  }, [job.product]);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <Type className="w-5 h-5 text-indigo-600" />
        Ad Copy
      </h2>

      {/* Ad Copy from Google Doc */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleFetchFromDoc()}
            disabled={doc.fetching}
            className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            {doc.fetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {doc.fetching ? "Fetching..." : "Auto-match from doc"}
          </button>
          {doc.tabs && doc.tabs.length > 0 && (
            <select
              onChange={(e) => {
                if (e.target.value) {
                  handleFetchFromDoc(e.target.value);
                }
              }}
              value=""
              disabled={doc.fetching}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="">Pick a tab...</option>
              {doc.tabs.map((tab) => (
                <option key={tab.id} value={tab.id}>{tab.title}</option>
              ))}
            </select>
          )}
        </div>

        {doc.matchedTab && (
          <p className="text-xs text-green-600">Loaded from tab: &ldquo;{doc.matchedTab}&rdquo;</p>
        )}

        {doc.error && (
          <p className="text-xs text-red-600">{doc.error}</p>
        )}
      </div>

      {/* Primary Texts */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
            <FileText className="w-4 h-4" />
            Primary Text ({metaPush.primaryTexts.length} of 5)
            {copyState.saving && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
          </label>
          {metaPush.primaryTexts.length < 5 && (
            <button
              onClick={addPrimaryText}
              className="text-xs text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              + Add variant
            </button>
          )}
        </div>
        <div className="space-y-2">
          {metaPush.primaryTexts.map((text, i) => (
            <div key={i} className="flex gap-2">
              <textarea
                value={text}
                onChange={(e) => handlePrimaryChange(i, e.target.value)}
                placeholder={i === 0 ? "Enter English ad copy..." : `Variant ${i + 1}`}
                rows={4}
                className="flex-1 bg-white border border-gray-300 text-gray-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 resize-y"
              />
              {metaPush.primaryTexts.length > 1 && (
                <button
                  onClick={() => removePrimaryText(i)}
                  className="text-gray-300 hover:text-red-500 transition-colors p-1 self-start mt-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Headlines */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
            Headline ({metaPush.headlines.length} of 5)
            {copyState.saving && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
          </label>
          {metaPush.headlines.length < 5 && (
            <button
              onClick={addHeadline}
              className="text-xs text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              + Add variant
            </button>
          )}
        </div>
        <div className="space-y-2">
          {metaPush.headlines.map((text, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={text}
                onChange={(e) => handleHeadlineChange(i, e.target.value)}
                placeholder={i === 0 ? "Short headline..." : `Variant ${i + 1}`}
                className="flex-1 bg-white border border-gray-300 text-gray-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              />
              {metaPush.headlines.length > 1 && (
                <button
                  onClick={() => removeHeadline(i)}
                  className="text-gray-300 hover:text-red-500 transition-colors p-1 self-start mt-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Website URL */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
          <Globe className="w-4 h-4" />
          Website URL
        </label>
        {landingPages.length > 0 || abTests.length > 0 ? (
          <>
            {(() => {
              const isNative = (job.cash_dna as { awareness_level?: string } | null)?.awareness_level === "Unaware" ||
                (job.tags ?? []).some((t) => t === "unaware" || t === "native");
              const hasAdvertorials = landingPages.some((p) => p.page_type === "advertorial");
              return isNative ? (
                <p className="text-xs text-amber-600 mb-1.5">
                  {hasAdvertorials
                    ? "Advertorial pages are recommended for native/unaware ads — they convert 3-4x better than direct product pages."
                    : "Tip: Native ads convert best with advertorial landing pages. Consider creating one for this product."}
                </p>
              ) : null;
            })()}
            <LandingPageModalTrigger
              landingPages={landingPages}
              abTests={abTests}
              selectedValue={metaPush.abTestId ? `abtest:${metaPush.abTestId}` : metaPush.landingPageId}
              onSelect={(value) => handleWebsiteUrlChange(value)}
              conceptTags={job.tags ?? undefined}
              conceptAngle={(job.cash_dna as { angle?: string } | null)?.angle}
            />
            {metaPush.abTestId && (() => {
              const selectedTest = abTests.find((t) => t.id === metaPush.abTestId);
              return selectedTest ? (
                <p className="text-xs text-gray-500 mt-1">
                  AB test URL for {selectedTest.language.toUpperCase()}, regular page for other languages
                </p>
              ) : null;
            })()}
          </>
        ) : (
          <p className="text-sm text-gray-400">
            No published pages or active A/B tests found
          </p>
        )}
      </div>

      {/* Translate Copy section */}
      {metaPush.primaryTexts.some((t) => t.trim()) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">Translations</h3>
            <button
              onClick={() => handleTranslateCopy()}
              disabled={copyState.translating || !metaPush.primaryTexts.some((t) => t.trim())}
              className="flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors"
            >
              {copyState.translating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Translating...
                </>
              ) : (
                <>
                  <Globe className="w-3.5 h-3.5" />
                  {Object.keys(copyTranslations).length > 0 ? "Re-translate All" : "Translate All"}
                </>
              )}
            </button>
          </div>

          {/* Per-language translation cards */}
          <div className="space-y-3">
            {job.target_languages.map((lang) => {
              const langInfo = LANGUAGES.find((l) => l.value === lang);
              const ct = copyTranslations[lang] as ConceptCopyTranslation | undefined;

              return (
                <div key={lang} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {/* Language header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-center gap-2">
                      <span className="text-base" role="img" aria-label={langInfo?.label ?? lang}>{langInfo?.flag}</span>
                      <span className="text-sm font-medium text-gray-700">{langInfo?.label}</span>
                      {ct?.status === "completed" && ct.quality_analysis && (
                        <QualityBadge analysis={ct.quality_analysis} />
                      )}
                      {ct?.status === "translating" && (
                        <span className="flex items-center gap-1 text-xs text-indigo-600">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Translating...
                        </span>
                      )}
                      {ct?.status === "error" && (
                        <span className="flex items-center gap-1 text-xs text-red-600">
                          <AlertTriangle className="w-3 h-3" />
                          {ct.error || "Failed"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCopyBankLang(lang)}
                        className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 transition-colors"
                        title="Pick from Copy Bank"
                      >
                        <BookmarkCheck className="w-3 h-3" />
                        Copy Bank
                      </button>
                      <button
                        onClick={() => handleTranslateCopy(lang as Language)}
                        disabled={copyState.translatingLang === lang || copyState.translating}
                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        {copyState.translatingLang === lang ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3 h-3" />
                        )}
                        {ct ? "Re-translate" : "Translate"}
                      </button>
                    </div>
                  </div>

                  {/* Translation content */}
                  {ct?.status === "completed" && (
                    <div className="px-4 py-3 space-y-3">
                      {/* Primary texts */}
                      {ct.primary_texts.map((text, i) => (
                        <div key={`p-${i}`} className="space-y-1">
                          {ct.primary_texts.length > 1 && (
                            <p className="text-xs text-gray-400">Primary text {i + 1}</p>
                          )}
                          <textarea
                            value={text}
                            onChange={(e) => handleTranslatedCopyChange(lang, "primary_texts", i, e.target.value)}
                            rows={3}
                            className="w-full bg-white border border-gray-200 text-sm text-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 resize-y"
                          />
                        </div>
                      ))}

                      {/* Headlines */}
                      {ct.headlines.length > 0 && ct.headlines.some((h) => h.trim()) && (
                        <div className="border-t border-gray-100 pt-2 space-y-2">
                          {ct.headlines.map((text, i) => (
                            <div key={`h-${i}`} className="space-y-1">
                              {ct.headlines.length > 1 && (
                                <p className="text-xs text-gray-400">Headline {i + 1}</p>
                              )}
                              <input
                                type="text"
                                value={text}
                                onChange={(e) => handleTranslatedCopyChange(lang, "headlines", i, e.target.value)}
                                className="w-full bg-white border border-gray-200 text-sm font-medium text-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Quality analysis summary */}
                      {ct.quality_analysis && (
                        <div className="border-t border-gray-100 pt-2 flex items-start justify-between gap-2">
                          <p className="text-xs text-gray-500">{ct.quality_analysis.overall_assessment}</p>
                          {(ct.quality_analysis.fluency_issues?.length > 0 ||
                            ct.quality_analysis.grammar_issues?.length > 0 ||
                            ct.quality_analysis.context_errors?.length > 0) && (
                            <button
                              onClick={() => {
                                const issues: string[] = [];
                                if (ct.quality_analysis!.fluency_issues?.length)
                                  issues.push(`Fluency issues: ${ct.quality_analysis!.fluency_issues.join("; ")}`);
                                if (ct.quality_analysis!.grammar_issues?.length)
                                  issues.push(`Grammar issues: ${ct.quality_analysis!.grammar_issues.join("; ")}`);
                                if (ct.quality_analysis!.context_errors?.length)
                                  issues.push(`Context errors: ${ct.quality_analysis!.context_errors.join("; ")}`);
                                handleTranslateCopy(lang as Language, issues.join("\n"));
                              }}
                              disabled={copyState.translatingLang === lang || copyState.translating}
                              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 disabled:opacity-50 transition-colors shrink-0"
                            >
                              {copyState.translatingLang === lang ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Wrench className="w-3 h-3" />
                              )}
                              Fix issues
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Empty state */}
                  {!ct && (
                    <div className="px-4 py-3">
                      <p className="text-xs text-gray-400">Not translated yet</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {copyBankLang && job.product && (
        <CopyBankPicker
          product={job.product}
          language={copyBankLang}
          segments={segments}
          onSelect={(entry: CopyBankEntry) => {
            handleTranslatedCopyChange(copyBankLang, "primary_texts", 0, entry.primary_text);
            if (entry.headline) {
              handleTranslatedCopyChange(copyBankLang, "headlines", 0, entry.headline);
            }
            setCopyBankLang(null);
          }}
          onClose={() => setCopyBankLang(null)}
        />
      )}

    </div>
  );
}
