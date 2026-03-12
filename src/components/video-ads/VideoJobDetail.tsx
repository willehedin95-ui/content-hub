"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Film,
  FileText,
  Globe,
  Loader2,
  Pencil,
  Play,
  RefreshCw,
  Rocket,
  Save,
  Subtitles,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { deriveCopyGrade, gradeConfig } from "@/lib/quality-grades";
import {
  Language,
  LANGUAGES,
  VideoJob,
  VideoTranslation,
  TranslatedShot,
  ConceptCopyTranslations,
  ConceptCopyTranslation,
} from "@/types";
import { VIDEO_FORMATS, HOOK_TYPES, SCRIPT_STRUCTURES } from "@/lib/constants";
import MultiClipPipeline from "./MultiClipPipeline";
import ConceptStepper, { StepDef } from "@/components/images/ConceptStepper";

const LANG_META: Record<string, { label: string; flag: string }> = {
  sv: { label: "SV", flag: "\u{1F1F8}\u{1F1EA}" },
  no: { label: "NO", flag: "\u{1F1F3}\u{1F1F4}" },
  da: { label: "DA", flag: "\u{1F1E9}\u{1F1F0}" },
};

const ALL_LANGUAGES: Language[] = ["sv", "no", "da"];

interface Props {
  initialJob: VideoJob;
}

// Status badge colors
function statusColor(status: string): string {
  switch (status) {
    case "draft":
      return "bg-gray-100 text-gray-600";
    case "generating":
    case "translating":
    case "pushing":
      return "bg-amber-100 text-amber-700";
    case "generated":
    case "translated":
      return "bg-blue-100 text-blue-700";
    case "live":
      return "bg-green-100 text-green-700";
    case "killed":
      return "bg-red-100 text-red-600";
    case "completed":
      return "bg-green-100 text-green-700";
    case "pending":
      return "bg-gray-100 text-gray-600";
    case "failed":
      return "bg-red-100 text-red-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColor(status)}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function QualityBadge({ analysis }: { analysis: { fluency_issues?: string[]; grammar_issues?: string[]; context_errors?: string[] } }) {
  const grade = deriveCopyGrade(analysis);
  const cfg = gradeConfig(grade);
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// Compute step completion for the video stepper
function computeStepCompletion(
  j: VideoJob,
  ct: ConceptCopyTranslations
): [boolean, boolean, boolean, boolean] {
  // Step 0: Video Generation — at least one video translation has status 'completed' (has a video)
  // OR the pipeline has a completed storyboard/stitched video
  const hasCompletedVideo =
    (j.video_translations ?? []).some((t) => t.status === "completed") ||
    j.storyboard_status === "completed" ||
    (j.source_videos ?? []).some((sv) => sv.status === "completed");
  const step0 = hasCompletedVideo;

  // Step 1: Captions — all translations with a video have captioned_video_url
  const translationsWithVideo = (j.video_translations ?? []).filter(
    (t) => t.status === "completed" || t.video_url
  );
  const step1 =
    translationsWithVideo.length > 0 &&
    translationsWithVideo.every((t) => !!t.captioned_video_url);

  // Step 2: Ad Copy — has primary text + all covered languages translated
  // Covered languages = target_languages + any extra languages from video_translations
  const originalLangForStep = j.target_languages?.[0] || "sv";
  const translationLangs = (j.video_translations ?? []).map((t) => t.language);
  const allCoveredLangs = [
    originalLangForStep,
    ...translationLangs.filter((l) => l !== originalLangForStep),
  ];
  const hasPrimary = (j.ad_copy_primary ?? []).some((t: string) => t.trim());
  const allLangsTranslated =
    allCoveredLangs.length > 0 &&
    allCoveredLangs.every((lang) => ct[lang]?.status === "completed");
  const step2 = hasPrimary && allLangsTranslated;

  // Step 3: Preview & Push — has landing page selected
  const hasLanding = !!j.landing_page_id;
  const step3 = hasLanding && step2;

  return [step0, step1, step2, step3];
}

function computeCurrentStep(j: VideoJob, ct: ConceptCopyTranslations): number {
  const [s0, s1, s2] = computeStepCompletion(j, ct);
  if (!s0) return 0;
  if (!s1) return 1;
  if (!s2) return 2;
  return 3;
}

export default function VideoJobDetail({ initialJob }: Props) {
  const [job, setJob] = useState<VideoJob>(initialJob);
  const [showPrompt, setShowPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingScript, setEditingScript] = useState(false);
  const [scriptDraft, setScriptDraft] = useState(initialJob.script || "");
  const [savingScript, setSavingScript] = useState(false);

  // Step-based flow
  const [copyTranslations, setCopyTranslations] = useState<ConceptCopyTranslations>(
    () => initialJob.ad_copy_translations ?? {}
  );
  const [step, setStep] = useState<number>(() =>
    computeCurrentStep(initialJob, initialJob.ad_copy_translations ?? {})
  );

  // Language tabs (for Step 0)
  const originalLang = job.target_languages?.[0] || "sv";
  const [activeLang, setActiveLang] = useState<string>(originalLang);
  const [translating, setTranslating] = useState(false);
  const [showTranslateMenu, setShowTranslateMenu] = useState(false);

  // Caption generation state (Step 1)
  const [captionGenerating, setCaptionGenerating] = useState<Record<string, boolean>>({});
  const [captionProgress, setCaptionProgress] = useState<Record<string, string>>({});

  // Ad Copy state (Step 2)
  const [primaryTexts, setPrimaryTexts] = useState<string[]>(
    () => (initialJob.ad_copy_primary ?? []).length > 0 ? initialJob.ad_copy_primary : [""]
  );
  const [headlines, setHeadlines] = useState<string[]>(
    () => (initialJob.ad_copy_headline ?? []).length > 0 ? initialJob.ad_copy_headline : [""]
  );
  const [copySaving, setCopySaving] = useState(false);
  const [copyTranslating, setCopyTranslating] = useState(false);
  const copyDebounceRef = useRef<NodeJS.Timeout | null>(null);


  // Preview & Push state (Step 3)
  const [landingPageId, setLandingPageId] = useState(initialJob.landing_page_id ?? "");
  const [landingPages, setLandingPages] = useState<Array<{
    id: string; name: string; slug: string; product: string;
    tags?: string[]; page_type?: string;
  }>>([]);
  const [pushing, setPushing] = useState(false);
  const [pushResults, setPushResults] = useState<Array<{
    language: string; country: string; status: string; error?: string;
  }> | null>(null);

  // Launch Pad state
  const [launchpad, setLaunchpad] = useState<{
    priority: number | null;
    loading: boolean;
    error: string | null;
  }>({
    priority: initialJob.launchpad_priority ?? null,
    loading: false,
    error: null,
  });

  // Get translations map
  const translationsMap = new Map<string, VideoTranslation>();
  for (const t of job.video_translations || []) {
    translationsMap.set(t.language, t);
  }
  // Deduplicate: originalLang is always shown, translations map may also include it
  const coveredLanguages = [
    originalLang,
    ...Array.from(translationsMap.keys()).filter((l) => l !== originalLang),
  ];
  const uncoveredLanguages = ALL_LANGUAGES.filter(
    (l) => !coveredLanguages.includes(l)
  );
  const activeTranslation =
    activeLang !== originalLang ? translationsMap.get(activeLang) : null;
  const isViewingTranslation = activeLang !== originalLang && !!activeTranslation;

  // Translate handler (script/video translation — Step 0)
  async function handleTranslate(targetLang: string) {
    setTranslating(true);
    setError(null);
    setShowTranslateMenu(false);
    try {
      const res = await fetch(`/api/video-jobs/${job.id}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: targetLang }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Translation failed");
      }
      await refreshJob();
      setActiveLang(targetLang);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Translation failed");
    } finally {
      setTranslating(false);
    }
  }

  // Derived lookups
  const formatLabel =
    VIDEO_FORMATS.find((f) => f.id === job.format_type)?.label ?? job.format_type;
  const hookLabel =
    HOOK_TYPES.find((h) => h.id === job.hook_type)?.label ?? job.hook_type;
  const structureLabel =
    SCRIPT_STRUCTURES.find((s) => s.id === job.script_structure)?.label ??
    job.script_structure;

  // Refresh job from API
  const refreshJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/video-jobs/${job.id}`);
      if (res.ok) {
        const data = await res.json();
        setJob(data);
        if (data.ad_copy_translations) {
          setCopyTranslations(data.ad_copy_translations);
        }
        return data as VideoJob;
      }
    } catch {
      // Silently ignore refresh errors
    }
    return null;
  }, [job.id]);

  // Save edited script
  async function handleSaveScript() {
    setSavingScript(true);
    setError(null);
    try {
      const res = await fetch(`/api/video-jobs/${job.id}/save-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: scriptDraft }),
      });
      if (!res.ok) throw new Error("Failed to save script");
      const data = await res.json();
      setJob((prev) => ({ ...prev, script: scriptDraft }));
      setEditingScript(false);
      if (data.updated_shots?.length > 0) {
        refreshJob();
      }
    } catch {
      setError("Failed to save script");
    } finally {
      setSavingScript(false);
    }
  }


  // Delete translation
  const [deleting, setDeleting] = useState(false);
  async function handleDeleteTranslation(language: string) {
    if (!confirm(`Delete ${LANG_META[language]?.label || language} translation? You can re-translate after.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/video-jobs/${job.id}/translate?language=${language}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Delete failed" }));
        throw new Error(data.error || "Delete failed");
      }
      setActiveLang(originalLang);
      await refreshJob();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete translation");
    } finally {
      setDeleting(false);
    }
  }

  // Find source video (for legacy single-clip jobs)
  const sourceVideo =
    job.source_videos?.find((sv) => sv.status === "completed") ??
    job.source_videos?.[0] ??
    null;

  // Title
  const title = [
    job.concept_number ? `#${job.concept_number}` : null,
    job.concept_name,
  ]
    .filter(Boolean)
    .join(" ");

  // --- Caption handlers (Step 1) ---

  async function handleGenerateCaptions(translationId: string, _language: string) {
    setCaptionGenerating((prev) => ({ ...prev, [translationId]: true }));
    setCaptionProgress((prev) => ({
      ...prev,
      [translationId]: "Downloading video...",
    }));
    setError(null);

    try {
      // Show progress stages
      const stages = [
        "Downloading video...",
        "Generating captions from script...",
        "Burning captions into video...",
      ];
      let stageIdx = 0;
      const interval = setInterval(() => {
        stageIdx = Math.min(stageIdx + 1, stages.length - 1);
        setCaptionProgress((prev) => ({
          ...prev,
          [translationId]: stages[stageIdx],
        }));
      }, 5000);

      const res = await fetch(`/api/video-jobs/${job.id}/generate-captions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translationId }),
      });

      clearInterval(interval);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Caption generation failed");
      }

      setCaptionProgress((prev) => ({
        ...prev,
        [translationId]: "Done!",
      }));
      await refreshJob();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Caption generation failed");
    } finally {
      setCaptionGenerating((prev) => ({ ...prev, [translationId]: false }));
    }
  }

  // --- Ad Copy handlers (Step 2) ---

  const saveCopy = useCallback(
    async (primaries: string[], hdlines: string[]) => {
      setCopySaving(true);
      await fetch(`/api/video-jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ad_copy_primary: primaries.filter((t) => t.trim()),
          ad_copy_headline: hdlines.filter((t) => t.trim()),
        }),
      });
      setCopySaving(false);
    },
    [job.id]
  );

  function handlePrimaryChange(index: number, value: string) {
    setPrimaryTexts((prev) => {
      const next = [...prev];
      next[index] = value;
      if (copyDebounceRef.current) clearTimeout(copyDebounceRef.current);
      copyDebounceRef.current = setTimeout(() => saveCopy(next, headlines), 1000);
      return next;
    });
  }

  function handleHeadlineChange(index: number, value: string) {
    setHeadlines((prev) => {
      const next = [...prev];
      next[index] = value;
      if (copyDebounceRef.current) clearTimeout(copyDebounceRef.current);
      copyDebounceRef.current = setTimeout(() => saveCopy(primaryTexts, next), 1000);
      return next;
    });
  }

  function addPrimaryText() {
    setPrimaryTexts((prev) => [...prev, ""]);
  }

  function removePrimaryText(index: number) {
    setPrimaryTexts((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (copyDebounceRef.current) clearTimeout(copyDebounceRef.current);
      copyDebounceRef.current = setTimeout(
        () => saveCopy(next.length > 0 ? next : [""], headlines),
        500
      );
      return next.length > 0 ? next : [""];
    });
  }

  function addHeadline() {
    setHeadlines((prev) => [...prev, ""]);
  }

  function removeHeadline(index: number) {
    setHeadlines((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (copyDebounceRef.current) clearTimeout(copyDebounceRef.current);
      copyDebounceRef.current = setTimeout(
        () => saveCopy(primaryTexts, next.length > 0 ? next : [""]),
        500
      );
      return next.length > 0 ? next : [""];
    });
  }

  async function handleTranslateCopy() {
    setCopyTranslating(true);
    setError(null);
    try {
      const res = await fetch(`/api/video-jobs/${job.id}/translate-copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryTexts: primaryTexts.filter((t) => t.trim()),
          headlines: headlines.filter((t) => t.trim()),
        }),
      });
      const data = await res.json();
      if (data.translations) {
        setCopyTranslations(data.translations);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Copy translation failed");
    } finally {
      setCopyTranslating(false);
    }
  }

  function handleTranslatedCopyChange(
    lang: string,
    field: "primary_texts" | "headlines",
    index: number,
    value: string
  ) {
    setCopyTranslations((prev) => {
      const ct = prev[lang] ?? {
        primary_texts: [""],
        headlines: [""],
        quality_score: null,
        quality_analysis: null,
        status: "completed" as const,
      };
      const arr = [...ct[field]];
      while (arr.length <= index) arr.push("");
      arr[index] = value;
      const updated = { ...ct, [field]: arr };
      const next = { ...prev, [lang]: updated };
      // Save to server (debounced)
      if (copyDebounceRef.current) clearTimeout(copyDebounceRef.current);
      copyDebounceRef.current = setTimeout(async () => {
        setCopySaving(true);
        await fetch(`/api/video-jobs/${job.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ad_copy_translations: next }),
        });
        setCopySaving(false);
      }, 1000);
      return next;
    });
  }

  // --- Preview & Push handlers (Step 3) ---

  // Fetch landing pages
  useEffect(() => {
    if (!initialJob.product || step !== 3) return;
    const langs = initialJob.target_languages?.length
      ? initialJob.target_languages
      : ["no"];
    const fetches = langs.map((lang) =>
      fetch(
        `/api/meta/assets/landing-pages?language=${lang}&product=${initialJob.product}`
      ).then((res) => res.json())
    );
    Promise.all(fetches)
      .then((results) => {
        const seenPages = new Set<string>();
        const pages: Array<{
          id: string; name: string; slug: string; product: string;
          tags?: string[]; page_type?: string;
        }> = [];
        for (const data of results) {
          for (const t of data.pages ?? []) {
            const page = t.pages as {
              id: string; name: string; slug: string; product: string;
              tags?: string[]; page_type?: string;
            };
            if (!seenPages.has(page.id)) {
              seenPages.add(page.id);
              pages.push(page);
            }
          }
        }
        setLandingPages(pages);
      })
      .catch(() => {});
  }, [initialJob.product, initialJob.target_languages, step]);

  async function handleAddToLaunchpad() {
    setLaunchpad(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch("/api/launchpad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptId: job.id, type: "video" }),
      });
      const data = await res.json();
      if (res.ok) {
        setLaunchpad({ priority: data.priority, loading: false, error: null });
      } else if (res.status === 422 && data.details) {
        setLaunchpad(prev => ({ ...prev, loading: false, error: data.details.join(". ") }));
      } else {
        setLaunchpad(prev => ({ ...prev, loading: false, error: data.error || "Failed to add" }));
      }
    } catch {
      setLaunchpad(prev => ({ ...prev, loading: false, error: "Network error" }));
    }
  }

  async function handleRemoveFromLaunchpad() {
    setLaunchpad(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch("/api/launchpad", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptId: job.id, type: "video" }),
      });
      if (res.ok) {
        setLaunchpad({ priority: null, loading: false, error: null });
      } else {
        const data = await res.json();
        setLaunchpad(prev => ({ ...prev, loading: false, error: data.error || "Failed to remove" }));
      }
    } catch {
      setLaunchpad(prev => ({ ...prev, loading: false, error: "Network error" }));
    }
  }

  async function handleWebsiteUrlChange(value: string) {
    setLandingPageId(value);
    await fetch(`/api/video-jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landing_page_id: value || null }),
    });
  }

  async function handlePushToMeta() {
    setPushing(true);
    setPushResults(null);
    setError(null);
    try {
      const res = await fetch(`/api/video-jobs/${job.id}/push-to-meta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.results) {
        setPushResults(data.results);
      } else {
        setPushResults([
          {
            language: "all",
            country: "all",
            status: "error",
            error: data.error || "Push failed",
          },
        ]);
      }
    } catch {
      setPushResults([
        { language: "all", country: "all", status: "error", error: "Push failed" },
      ]);
    } finally {
      setPushing(false);
    }
  }

  // --- Render ---

  // Stepper completion
  const [s0, s1, s2, s3] = computeStepCompletion(job, copyTranslations);
  const steps: StepDef[] = [
    { label: "Video", complete: s0 },
    { label: "Captions", complete: s1 },
    { label: "Ad Copy", complete: s2 },
    { label: "Preview & Push", complete: s3 },
  ];

  return (
    <div className="p-8 max-w-6xl">
      {/* Back */}
      <Link
        href="/video-ads"
        className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900 text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Video Ads
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {/* Metadata pills */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-gray-100 text-xs font-medium text-gray-700 capitalize">
              {job.product}
            </span>
            <StatusBadge status={job.status} />
            {formatLabel && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-indigo-50 text-xs font-medium text-indigo-700">
                {formatLabel}
              </span>
            )}
            {hookLabel && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-purple-50 text-xs font-medium text-purple-700">
                {hookLabel}
              </span>
            )}
            {structureLabel && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-teal-50 text-xs font-medium text-teal-700">
                {structureLabel}
              </span>
            )}
            {job.video_shots && job.video_shots.length > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-orange-50 text-xs font-medium text-orange-700">
                {job.video_shots.length} shots
              </span>
            )}
            <span className="text-xs text-gray-400">{job.duration_seconds}s</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Launch Pad button */}
          {launchpad.priority !== null ? (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg">
                <Rocket className="w-3.5 h-3.5" />
                On Launch Pad
              </span>
              <button
                onClick={handleRemoveFromLaunchpad}
                disabled={launchpad.loading}
                className="text-gray-400 hover:text-red-500 p-1 transition-colors disabled:opacity-50"
                title="Remove from Launch Pad"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleAddToLaunchpad}
              disabled={launchpad.loading}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-indigo-600 bg-gray-50 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              title="Add to Launch Pad"
            >
              <Rocket className="w-3.5 h-3.5" />
              {launchpad.loading ? "Adding..." : "Add to Launch Pad"}
            </button>
          )}
          <button
            onClick={() => refreshJob()}
            className="text-gray-400 hover:text-gray-700 p-2 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Launch Pad error */}
      {launchpad.error && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-700">{launchpad.error}</p>
          <button
            onClick={() => setLaunchpad(prev => ({ ...prev, error: null }))}
            className="ml-auto text-amber-400 hover:text-amber-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Stepper */}
      <div className="mb-6">
        <ConceptStepper steps={steps} currentStep={step} onStepClick={setStep} />
      </div>

      {/* ====================== STEP 0: Video Generation ====================== */}
      {step === 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* LEFT COLUMN: Script & Prompt */}
          <div className="space-y-6">
            {/* Language tabs + Translate button */}
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setActiveLang(originalLang)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    activeLang === originalLang
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {LANG_META[originalLang]?.flag}{" "}
                  {LANG_META[originalLang]?.label || originalLang.toUpperCase()}
                </button>
                {Array.from(translationsMap.entries())
                  .filter(([lang]) => lang !== originalLang)
                  .map(([lang]) => (
                  <button
                    key={lang}
                    onClick={() => setActiveLang(lang)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      activeLang === lang
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {LANG_META[lang]?.flag}{" "}
                    {LANG_META[lang]?.label || lang.toUpperCase()}
                  </button>
                ))}
              </div>

              {uncoveredLanguages.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowTranslateMenu(!showTranslateMenu)}
                    disabled={translating}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg border border-indigo-200 transition-colors disabled:opacity-50"
                  >
                    {translating ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Globe className="w-3 h-3" />
                    )}
                    {translating ? "Translating..." : "Translate to..."}
                  </button>
                  {showTranslateMenu && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 min-w-[140px]">
                      {uncoveredLanguages.map((lang) => (
                        <button
                          key={lang}
                          onClick={() => handleTranslate(lang)}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <span>{LANG_META[lang]?.flag}</span>
                          <span>
                            {lang === "sv"
                              ? "Swedish"
                              : lang === "no"
                              ? "Norwegian"
                              : "Danish"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Script panel */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">
                  Script
                  {isViewingTranslation && (
                    <span className="ml-2 text-xs font-normal text-indigo-500">
                      ({LANG_META[activeLang]?.flag} translated)
                    </span>
                  )}
                </h2>
                {!isViewingTranslation && !editingScript ? (
                  <button
                    onClick={() => {
                      setScriptDraft(job.script || "");
                      setEditingScript(true);
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                ) : !isViewingTranslation ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setEditingScript(false)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                    >
                      <X className="w-3 h-3" />
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveScript}
                      disabled={savingScript}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded transition-colors disabled:opacity-50"
                    >
                      {savingScript ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Save className="w-3 h-3" />
                      )}
                      Save
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="p-4">
                {!isViewingTranslation && editingScript ? (
                  <textarea
                    value={scriptDraft}
                    onChange={(e) => setScriptDraft(e.target.value)}
                    className="w-full text-sm text-gray-800 font-mono leading-relaxed bg-gray-50 border border-gray-200 rounded-lg p-3 resize-y min-h-[200px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    rows={12}
                  />
                ) : (
                  (() => {
                    const displayScript = isViewingTranslation
                      ? activeTranslation?.translated_script
                      : job.script;
                    return displayScript ? (
                      <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">
                        {displayScript}
                      </pre>
                    ) : (
                      <p className="text-sm text-gray-400 italic">
                        {isViewingTranslation
                          ? "No translated script"
                          : "No script written yet"}
                      </p>
                    );
                  })()
                )}
              </div>
            </div>

            {/* VEO/Sora Prompt panel (collapsible) */}
            {(() => {
              const translatedShots: TranslatedShot[] = isViewingTranslation
                ? (activeTranslation?.translated_shots as
                    | TranslatedShot[]
                    | null) || []
                : [];

              if (
                job.format_type === "pixar_animation" &&
                job.video_shots &&
                job.video_shots.length > 0
              ) {
                return (
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <button
                      onClick={() => setShowPrompt(!showPrompt)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <h2 className="text-sm font-semibold text-gray-700">
                        VEO Prompts
                        {isViewingTranslation && (
                          <span className="ml-2 text-xs font-normal text-indigo-500">
                            ({LANG_META[activeLang]?.flag} translated)
                          </span>
                        )}
                      </h2>
                      {showPrompt ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                    {showPrompt && (
                      <div className="p-4 border-t border-gray-100 space-y-3">
                        {job.video_shots.map((shot, i) => {
                          const tShot = translatedShots.find(
                            (ts) => ts.shot_number === shot.shot_number
                          );
                          const displayPrompt =
                            isViewingTranslation && tShot
                              ? tShot.translated_veo_prompt
                              : shot.veo_prompt;
                          return (
                            <div key={shot.id || i}>
                              <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">
                                Shot {shot.shot_number}
                              </p>
                              <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed bg-gray-50 rounded-lg p-2">
                                {displayPrompt || "\u2014"}
                              </pre>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              if (
                job.sora_prompt ||
                (isViewingTranslation &&
                  activeTranslation?.translated_sora_prompt)
              ) {
                const displayPrompt = isViewingTranslation
                  ? activeTranslation?.translated_sora_prompt || job.sora_prompt
                  : job.sora_prompt;
                return (
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <button
                      onClick={() => setShowPrompt(!showPrompt)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <h2 className="text-sm font-semibold text-gray-700">
                        VEO Prompt
                        {isViewingTranslation && (
                          <span className="ml-2 text-xs font-normal text-indigo-500">
                            ({LANG_META[activeLang]?.flag} translated)
                          </span>
                        )}
                      </h2>
                      {showPrompt ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                    {showPrompt && (
                      <div className="p-4 border-t border-gray-100">
                        <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">
                          {displayPrompt}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })()}

            {/* Character description panel */}
            {job.character_description && (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-gray-700">Character</h2>
                  {job.character_tag && (
                    <span className="text-xs text-gray-400 font-mono">
                      {job.character_tag}
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {job.character_description}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Video Pipeline */}
          <div className="space-y-6">
            {/* Pipeline — shown for ALL languages */}
            {job.video_shots && job.video_shots.length > 0 ? (
              <MultiClipPipeline
                job={job}
                onJobUpdate={async () => {
                  await refreshJob();
                }}
                language={isViewingTranslation ? activeLang : undefined}
              />
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Film className="w-4 h-4 text-gray-400" />
                    Source Video
                  </h2>
                  <button
                    onClick={() => refreshJob()}
                    className="text-gray-400 hover:text-gray-700 p-1 transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="p-4">
                  {sourceVideo?.video_url ? (
                    <video
                      src={sourceVideo.video_url}
                      controls
                      className="w-full rounded-lg bg-black"
                      preload="metadata"
                    />
                  ) : (
                    <div className="aspect-[9/16] max-h-[400px] bg-gray-100 rounded-lg flex flex-col items-center justify-center gap-3">
                      <Play className="w-8 h-8 text-gray-300" />
                      <p className="text-sm text-gray-400">
                        Legacy single-clip job — no pipeline available
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Delete translation (only for non-original languages) */}
            {isViewingTranslation && (
              <button
                onClick={() => handleDeleteTranslation(activeLang)}
                disabled={deleting}
                className="flex items-center gap-2 text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Delete {LANG_META[activeLang]?.flag} translation & re-translate
              </button>
            )}
          </div>
        </div>
      )}

      {/* ====================== STEP 1: Captions ====================== */}
      {step === 1 && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Subtitles className="w-5 h-5 text-indigo-600" />
            Captions
          </h2>

          {(() => {
            // Find translations that have a video available (completed or has video_url)
            const videoTranslations = (job.video_translations ?? []).filter(
              (t) => t.status === "completed" || t.video_url
            );

            // Also include source video / storyboard as a captioning source via translations
            if (videoTranslations.length === 0) {
              return (
                <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                  <Subtitles className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">
                    No completed videos found. Complete video generation first,
                    then come back to add captions.
                  </p>
                  <button
                    onClick={() => setStep(0)}
                    className="mt-4 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    Go to Video Generation
                  </button>
                </div>
              );
            }

            return (
              <div className="space-y-4">
                {videoTranslations.map((t) => {
                  const langInfo = LANGUAGES.find((l) => l.value === t.language);
                  const isGenerating = captionGenerating[t.id] ?? false;
                  const progress = captionProgress[t.id];
                  const hasCaptions = !!t.captioned_video_url;

                  return (
                    <div
                      key={t.id}
                      className="bg-white border border-gray-200 rounded-xl overflow-hidden"
                    >
                      {/* Language header */}
                      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                        <div className="flex items-center gap-2">
                          <span className="text-base" role="img" aria-label={langInfo?.label ?? t.language}>
                            {langInfo?.flag}
                          </span>
                          <span className="text-sm font-medium text-gray-700">
                            {langInfo?.label ?? t.language.toUpperCase()}
                          </span>
                          {hasCaptions && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                              <Check className="w-3 h-3" />
                              Done
                            </span>
                          )}
                          {isGenerating && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Generating
                            </span>
                          )}
                          {!hasCaptions && !isGenerating && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">
                              Pending
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="p-4 space-y-4">
                        {/* Progress indicator */}
                        {isGenerating && progress && (
                          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
                            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                            <span>{progress}</span>
                          </div>
                        )}

                        {/* Captioned video preview */}
                        {hasCaptions && t.captioned_video_url && (
                          <div className="rounded-lg overflow-hidden border border-gray-200 bg-black">
                            <video
                              src={t.captioned_video_url}
                              controls
                              className="w-full max-h-[400px]"
                              preload="metadata"
                            />
                          </div>
                        )}

                        {/* Generate / Re-generate button */}
                        <button
                          onClick={() =>
                            handleGenerateCaptions(t.id, t.language)
                          }
                          disabled={isGenerating}
                          className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 ${
                            hasCaptions
                              ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                              : "bg-indigo-600 text-white hover:bg-indigo-700"
                          }`}
                        >
                          {isGenerating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Subtitles className="w-4 h-4" />
                          )}
                          {hasCaptions ? "Re-generate Captions" : "Generate Captions"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* ====================== STEP 2: Ad Copy ====================== */}
      {step === 2 && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Type className="w-5 h-5 text-indigo-600" />
            Ad Copy
          </h2>

          {/* Primary Texts */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <FileText className="w-4 h-4" />
                Primary Text ({primaryTexts.length} of 5)
                {copySaving && (
                  <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                )}
              </label>
              {primaryTexts.length < 5 && (
                <button
                  onClick={addPrimaryText}
                  className="text-xs text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  + Add variant
                </button>
              )}
            </div>
            <div className="space-y-2">
              {primaryTexts.map((text, i) => (
                <div key={i} className="flex gap-2">
                  <textarea
                    value={text}
                    onChange={(e) => handlePrimaryChange(i, e.target.value)}
                    placeholder={
                      i === 0 ? "Enter English ad copy..." : `Variant ${i + 1}`
                    }
                    rows={4}
                    className="flex-1 bg-white border border-gray-300 text-gray-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 resize-y"
                  />
                  {primaryTexts.length > 1 && (
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
                Headline ({headlines.length} of 5)
                {copySaving && (
                  <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                )}
              </label>
              {headlines.length < 5 && (
                <button
                  onClick={addHeadline}
                  className="text-xs text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  + Add variant
                </button>
              )}
            </div>
            <div className="space-y-2">
              {headlines.map((text, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => handleHeadlineChange(i, e.target.value)}
                    placeholder={
                      i === 0 ? "Short headline..." : `Variant ${i + 1}`
                    }
                    className="flex-1 bg-white border border-gray-300 text-gray-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                  />
                  {headlines.length > 1 && (
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

          {/* Translate Copy section */}
          {primaryTexts.some((t) => t.trim()) && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">
                  Translations
                </h3>
                <button
                  onClick={handleTranslateCopy}
                  disabled={
                    copyTranslating ||
                    !primaryTexts.some((t) => t.trim())
                  }
                  className="flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  {copyTranslating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Translating...
                    </>
                  ) : (
                    <>
                      <Globe className="w-3.5 h-3.5" />
                      {Object.keys(copyTranslations).length > 0
                        ? "Re-translate All"
                        : "Translate All"}
                    </>
                  )}
                </button>
              </div>

              {/* Per-language translation cards */}
              <div className="space-y-3">
                {coveredLanguages.map((lang) => {
                  const langInfo = LANGUAGES.find((l) => l.value === lang);
                  const ct = copyTranslations[lang] as
                    | ConceptCopyTranslation
                    | undefined;

                  return (
                    <div
                      key={lang}
                      className="bg-white border border-gray-200 rounded-xl overflow-hidden"
                    >
                      {/* Language header */}
                      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-base"
                            role="img"
                            aria-label={langInfo?.label ?? lang}
                          >
                            {langInfo?.flag}
                          </span>
                          <span className="text-sm font-medium text-gray-700">
                            {langInfo?.label}
                            {lang === originalLang && (
                              <span className="text-xs text-gray-400 ml-1">(original)</span>
                            )}
                          </span>
                          {ct?.status === "completed" &&
                            ct.quality_analysis && (
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
                      </div>

                      {/* Translation content */}
                      {ct?.status === "completed" && (
                        <div className="px-4 py-3 space-y-3">
                          {ct.primary_texts.map((text, i) => (
                            <div key={`p-${i}`} className="space-y-1">
                              {ct.primary_texts.length > 1 && (
                                <p className="text-xs text-gray-400">
                                  Primary text {i + 1}
                                </p>
                              )}
                              <textarea
                                value={text}
                                onChange={(e) =>
                                  handleTranslatedCopyChange(
                                    lang,
                                    "primary_texts",
                                    i,
                                    e.target.value
                                  )
                                }
                                rows={3}
                                className="w-full bg-white border border-gray-200 text-sm text-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 resize-y"
                              />
                            </div>
                          ))}

                          {ct.headlines.length > 0 &&
                            ct.headlines.some((h) => h.trim()) && (
                              <div className="border-t border-gray-100 pt-2 space-y-2">
                                {ct.headlines.map((text, i) => (
                                  <div key={`h-${i}`} className="space-y-1">
                                    {ct.headlines.length > 1 && (
                                      <p className="text-xs text-gray-400">
                                        Headline {i + 1}
                                      </p>
                                    )}
                                    <input
                                      type="text"
                                      value={text}
                                      onChange={(e) =>
                                        handleTranslatedCopyChange(
                                          lang,
                                          "headlines",
                                          i,
                                          e.target.value
                                        )
                                      }
                                      className="w-full bg-white border border-gray-200 text-sm font-medium text-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                        </div>
                      )}

                      {/* Empty state */}
                      {!ct && (
                        <div className="px-4 py-3">
                          <p className="text-xs text-gray-400">
                            Not translated yet
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================== STEP 3: Preview & Push ====================== */}
      {step === 3 && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-600" />
            Preview & Push
          </h2>

          {/* Landing page selector */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <Globe className="w-4 h-4" />
              Website URL
            </label>
            {landingPages.length > 0 ? (
              <select
                value={landingPageId}
                onChange={(e) => handleWebsiteUrlChange(e.target.value)}
                className="w-full bg-white border border-gray-300 text-gray-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="">Select a destination...</option>
                {landingPages.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-400">
                No published pages found for {job.product}
              </p>
            )}
          </div>

          {/* Per-market readiness checklist */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">
                Market Readiness
              </h3>
            </div>
            <div className="divide-y divide-gray-100">
              {coveredLanguages.map((lang) => {
                const langInfo = LANGUAGES.find((l) => l.value === lang);
                const translation = translationsMap.get(lang);
                const hasCaptionedVideo = !!translation?.captioned_video_url;
                const hasTranslatedCopy =
                  copyTranslations[lang]?.status === "completed";
                const hasLanding = !!landingPageId;
                const allReady =
                  hasCaptionedVideo && hasTranslatedCopy && hasLanding;

                return (
                  <div key={lang} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base">{langInfo?.flag}</span>
                      <span className="text-sm font-medium text-gray-700">
                        {langInfo?.label}
                      </span>
                      {allReady && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                          <Check className="w-3 h-3" />
                          Ready
                        </span>
                      )}
                    </div>
                    <div className="ml-7 space-y-1">
                      <ChecklistItem
                        label="Captioned video"
                        done={hasCaptionedVideo}
                      />
                      <ChecklistItem
                        label="Translated ad copy"
                        done={hasTranslatedCopy}
                      />
                      <ChecklistItem
                        label="Landing page"
                        done={hasLanding}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Push button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handlePushToMeta}
              disabled={pushing || !landingPageId}
              className="flex items-center gap-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              {pushing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg viewBox="0 6 36 24" className="h-4 w-auto shrink-0" aria-label="Meta logo">
                  <path
                    d="M7.5 18c0-3.78 1.22-7.08 3.13-9.04C12.2 7.32 14.17 6.5 16 6.5c2.36 0 3.88 1.18 5.28 3.24l.66.97.66-.97C24.02 7.68 25.54 6.5 27.9 6.5c4.87 0 8.1 5.8 8.1 11.5 0 6.52-3.58 11.5-8 11.5-2.36 0-3.95-1.18-5.38-3.24L18 20.1l-4.62 6.16C11.95 28.32 10.36 29.5 8 29.5 3.58 29.5 0 24.52 0 18c0-5.7 3.23-11.5 8.1-11.5 1.83 0 3.8.82 5.37 2.46C11.72 10.92 10.5 14.22 10.5 18c0 1.38.14 2.7.42 3.9-.5.7-1.16 1.1-1.92 1.1-1.57 0-3.5-2.7-3.5-5zm21 0c0 2.3-1.93 5-3.5 5-.76 0-1.42-.4-1.93-1.12.28-1.18.43-2.5.43-3.88 0-3.78-1.22-7.08-3.13-9.04 1.4-1.7 2.8-2.46 4.13-2.46 2.63 0 4 3.66 4 5.5z"
                    fill="currentColor"
                  />
                </svg>
              )}
              {pushing ? "Pushing..." : "Push to Meta"}
            </button>
          </div>

          {/* Push results */}
          {pushResults && (
            <div className="space-y-2">
              {pushResults.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ${
                    r.status === "error"
                      ? "bg-red-50 text-red-700"
                      : "bg-green-50 text-green-700"
                  }`}
                >
                  {r.status === "error" ? (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  ) : (
                    <Check className="w-4 h-4 shrink-0" />
                  )}
                  <span>
                    {r.country.toUpperCase()} ({r.language}):{" "}
                    {r.status === "error" ? r.error : "Pushed successfully"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Checklist item for market readiness
function ChecklistItem({
  label,
  done,
}: {
  label: string;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <Check className="w-3.5 h-3.5 text-green-500" />
      ) : (
        <X className="w-3.5 h-3.5 text-gray-300" />
      )}
      <span
        className={`text-xs ${done ? "text-gray-600" : "text-gray-400"}`}
      >
        {label}
      </span>
    </div>
  );
}
