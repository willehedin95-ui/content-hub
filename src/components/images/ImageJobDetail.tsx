"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  RotateCcw,
  RefreshCw,
  X,
  FileText,
  Globe,
  Type,
  EyeOff,
  Square,
  Wrench,
} from "lucide-react";
import { ImageJob, ImageTranslation, SourceImage, QualityAnalysis, Language, LANGUAGES, MetaCampaign, MetaCampaignMapping, MetaPageConfig, ConceptCopyTranslation, ConceptCopyTranslations } from "@/types";
import { getSettings } from "@/lib/settings";
import ImagePreviewModal from "./ImagePreviewModal";
import MetaAdPreview from "./MetaAdPreview";
import ConceptStepper, { StepDef } from "./ConceptStepper";

const DEFAULT_MAX_VERSIONS = 5;
const DEFAULT_QUALITY_THRESHOLD = 80;

interface Props {
  initialJob: ImageJob;
}

function computeStepCompletion(j: ImageJob, ct: ConceptCopyTranslations): [boolean, boolean, boolean] {
  // Step 1: Images — all translations complete
  const allTrans = j.source_images?.flatMap((si) => si.image_translations ?? []) ?? [];
  const totalTrans = allTrans.length;
  const completedTrans = allTrans.filter((t) => t.status === "completed").length;
  const step1 = totalTrans > 0 && completedTrans === totalTrans;

  // Step 2: Ad Copy — has primary text + landing page + all target languages translated
  const hasPrimary = (j.ad_copy_primary ?? []).some((t: string) => t.trim());
  const hasLanding = !!j.landing_page_id;
  const allLangsTranslated = j.target_languages.length > 0 && j.target_languages.every(
    (lang) => ct[lang]?.status === "completed"
  );
  const step2 = hasPrimary && hasLanding && allLangsTranslated;

  // Step 3: Preview & Push — pushed or marked ready
  const hasPushed = (j.deployments ?? []).some((d) => d.status === "pushed");
  const step3 = hasPushed || !!j.marked_ready_at;

  return [step1, step2, step3];
}

function computeCurrentStep(j: ImageJob, ct: ConceptCopyTranslations): number {
  const [step1, step2] = computeStepCompletion(j, ct);
  if (!step1) return 0;
  if (!step2) return 1;
  return 2;
}

export default function ImageJobDetail({ initialJob }: Props) {
  const [job, setJob] = useState<ImageJob>(initialJob);
  const [step, setStep] = useState<number>(() => computeCurrentStep(initialJob, initialJob.ad_copy_translations ?? {}));
  const [activeTab, setActiveTab] = useState<"all" | string>("all");
  // Processing states
  const [proc, setProc] = useState<{
    processing: boolean;
    startTime: number | null;
    processedInSession: number;
    refreshing: boolean;
  }>({ processing: false, startTime: null, processedInSession: 0, refreshing: false });

  const [previewImage, setPreviewImage] = useState<SourceImage | null>(null);
  const [previewLang, setPreviewLang] = useState<string | null>(null);
  const [showRestartBanner, setShowRestartBanner] = useState(false);
  const processingRef = useRef(false);
  const cancelRef = useRef(false);
  const [showTranslateConfirm, setShowTranslateConfirm] = useState(false);

  // Meta push states
  const [metaPush, setMetaPush] = useState<{
    primaryTexts: string[];
    headlines: string[];
    landingPageId: string;
    pushing: boolean;
    pushResults: Array<{ language: string; country: string; status: string; error?: string }> | null;
  }>(() => ({
    primaryTexts: (initialJob.ad_copy_primary ?? []).length > 0 ? initialJob.ad_copy_primary! : [""],
    headlines: (initialJob.ad_copy_headline ?? []).length > 0 ? initialJob.ad_copy_headline! : [""],
    landingPageId: initialJob.landing_page_id ?? "",
    pushing: false,
    pushResults: null,
  }));

  const [landingPages, setLandingPages] = useState<Array<{ id: string; name: string; slug: string; product: string }>>([]);
  const [deployments, setDeployments] = useState<MetaCampaign[]>([]);
  const [previewData, setPreviewData] = useState<{
    landingPageUrls: Record<string, string>;
    campaignMappings: MetaCampaignMapping[];
    pageConfigs: MetaPageConfig[];
  } | null>(null);

  // Doc fetch states
  const [doc, setDoc] = useState<{
    fetching: boolean;
    tabs: Array<{ id: string; title: string }> | null;
    error: string | null;
    matchedTab: string | null;
  }>({ fetching: false, tabs: null, error: null, matchedTab: null });

  // Copy translation states
  const [copyState, setCopyState] = useState<{
    saving: boolean;
    translating: boolean;
    translatingLang: Language | null;
  }>({ saving: false, translating: false, translatingLang: null });

  const copyDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const [copyTranslations, setCopyTranslations] = useState<ConceptCopyTranslations>(
    () => initialJob.ad_copy_translations ?? {}
  );

  const [selectedLanguages, setSelectedLanguages] = useState<Set<Language>>(() => {
    // Init from job if already set, otherwise from settings defaults
    if (initialJob.target_languages?.length) {
      return new Set(initialJob.target_languages as Language[]);
    }
    try {
      const stored = localStorage.getItem("content-hub-settings");
      if (stored) {
        const settings = JSON.parse(stored);
        if (settings.static_ads_default_languages?.length) {
          return new Set(settings.static_ads_default_languages);
        }
      }
    } catch {}
    return new Set(LANGUAGES.map((l) => l.value));
  });

  // Fetch landing pages for this product
  useEffect(() => {
    if (!initialJob.product) return;
    fetch(`/api/meta/assets/landing-pages?language=no&product=${initialJob.product}`)
      .then((res) => res.json())
      .then((data) => {
        // Deduplicate by page ID
        const seen = new Set<string>();
        const pages: Array<{ id: string; name: string; slug: string; product: string }> = [];
        for (const t of data ?? []) {
          const pageId = (t.pages as { id: string; name: string; slug: string; product: string }).id;
          if (!seen.has(pageId)) {
            seen.add(pageId);
            pages.push(t.pages as { id: string; name: string; slug: string; product: string });
          }
        }
        setLandingPages(pages);
      })
      .catch(() => {});
  }, [initialJob.product]);

  // Fetch existing deployments for this concept
  const fetchDeployments = useCallback(async () => {
    const res = await fetch("/api/meta/campaigns");
    if (res.ok) {
      const all: MetaCampaign[] = await res.json();
      setDeployments(all.filter((c) => c.image_job_id === initialJob.id));
    }
  }, [initialJob.id]);

  useEffect(() => {
    fetchDeployments();
  }, [fetchDeployments]);

  // Fetch preview data when preview step is opened (lazy load)
  useEffect(() => {
    if (step !== 2) return;
    // Always refetch when switching to preview step to get fresh data
    fetch(`/api/image-jobs/${initialJob.id}/preview-data`)
      .then((res) => res.json())
      .then((data) => setPreviewData(data))
      .catch(() => {});
  }, [step, initialJob.id, metaPush.landingPageId]);

  // Auto-save ad copy on change (debounced)
  const saveCopy = useCallback(async (primaries: string[], hdlines: string[]) => {
    setCopyState(prev => ({ ...prev, saving: true }));
    await fetch(`/api/image-jobs/${initialJob.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ad_copy_primary: primaries.filter((t) => t.trim()),
        ad_copy_headline: hdlines.filter((t) => t.trim()),
      }),
    });
    setCopyState(prev => ({ ...prev, saving: false }));
  }, [initialJob.id]);

  function handlePrimaryChange(index: number, value: string) {
    setMetaPush((prev) => {
      const next = [...prev.primaryTexts];
      next[index] = value;
      if (copyDebounceRef.current) clearTimeout(copyDebounceRef.current);
      copyDebounceRef.current = setTimeout(() => saveCopy(next, prev.headlines), 1000);
      return { ...prev, primaryTexts: next };
    });
  }

  function handleHeadlineChange(index: number, value: string) {
    setMetaPush((prev) => {
      const next = [...prev.headlines];
      next[index] = value;
      if (copyDebounceRef.current) clearTimeout(copyDebounceRef.current);
      copyDebounceRef.current = setTimeout(() => saveCopy(prev.primaryTexts, next), 1000);
      return { ...prev, headlines: next };
    });
  }

  function addPrimaryText() {
    setMetaPush((prev) => ({ ...prev, primaryTexts: [...prev.primaryTexts, ""] }));
  }

  function removePrimaryText(index: number) {
    setMetaPush((prev) => {
      const next = prev.primaryTexts.filter((_, i) => i !== index);
      if (copyDebounceRef.current) clearTimeout(copyDebounceRef.current);
      copyDebounceRef.current = setTimeout(() => saveCopy(next, prev.headlines), 500);
      return { ...prev, primaryTexts: next.length > 0 ? next : [""] };
    });
  }

  function addHeadline() {
    setMetaPush((prev) => ({ ...prev, headlines: [...prev.headlines, ""] }));
  }

  function removeHeadline(index: number) {
    setMetaPush((prev) => {
      const next = prev.headlines.filter((_, i) => i !== index);
      if (copyDebounceRef.current) clearTimeout(copyDebounceRef.current);
      copyDebounceRef.current = setTimeout(() => saveCopy(prev.primaryTexts, next), 500);
      return { ...prev, headlines: next.length > 0 ? next : [""] };
    });
  }

  // Load available doc tabs when switching to ad-copy step
  useEffect(() => {
    if (step !== 1 || doc.tabs !== null) return;
    (async () => {
      try {
        const res = await fetch(`/api/image-jobs/${initialJob.id}/fetch-copy`);
        const data = await res.json().catch(() => ({}));
        if (data.availableTabs?.length) {
          setDoc(prev => ({ ...prev, tabs: data.availableTabs }));
        }
        // If auto-matched, populate the copy fields
        if (res.ok && data.primaryTexts?.length) {
          setMetaPush(prev => ({
            ...prev,
            primaryTexts: data.primaryTexts,
            ...(data.headlines?.length ? { headlines: data.headlines } : {}),
          }));
          if (data.matchedTab) setDoc(prev => ({ ...prev, matchedTab: data.matchedTab }));
          await saveCopy(data.primaryTexts, data.headlines || metaPush.headlines);
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Fetch ad copy from Google Doc
  async function handleFetchFromDoc(tabId?: string) {
    setDoc(prev => ({ ...prev, fetching: true, error: null, matchedTab: null }));
    try {
      const url = tabId
        ? `/api/image-jobs/${initialJob.id}/fetch-copy?tab_id=${tabId}`
        : `/api/image-jobs/${initialJob.id}/fetch-copy`;
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.error === "no_match" && data.availableTabs?.length) {
          setDoc(prev => ({ ...prev, tabs: data.availableTabs, error: data.message }));
          return;
        }
        throw new Error(data.error || "Failed to fetch copy from doc");
      }

      // Store available tabs for manual selection dropdown
      if (data.availableTabs?.length) {
        setDoc(prev => ({ ...prev, tabs: data.availableTabs }));
      }
      if (data.matchedTab) {
        setDoc(prev => ({ ...prev, matchedTab: data.matchedTab }));
      }
      setMetaPush(prev => ({
        ...prev,
        ...(data.primaryTexts?.length ? { primaryTexts: data.primaryTexts } : {}),
        ...(data.headlines?.length ? { headlines: data.headlines } : {}),
      }));
      // Save immediately
      await saveCopy(data.primaryTexts || metaPush.primaryTexts, data.headlines || metaPush.headlines);
    } catch (err) {
      setDoc(prev => ({ ...prev, error: err instanceof Error ? err.message : "Failed to fetch copy" }));
      console.error("Fetch from doc failed:", err);
    } finally {
      setDoc(prev => ({ ...prev, fetching: false }));
    }
  }

  // Translate ad copy for all languages (or a specific one)
  async function handleTranslateCopy(lang?: Language, corrections?: string) {
    if (lang) {
      setCopyState(prev => ({ ...prev, translatingLang: lang }));
    } else {
      setCopyState(prev => ({ ...prev, translating: true }));
    }
    try {
      const res = await fetch(`/api/image-jobs/${initialJob.id}/translate-copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(lang ? { language: lang } : {}),
          ...(corrections ? { corrections } : {}),
        }),
      });
      const data = await res.json();
      if (data.translations) {
        setCopyTranslations(data.translations);
      }
    } catch (err) {
      console.error("Copy translation failed:", err);
    } finally {
      setCopyState(prev => ({ ...prev, translating: false, translatingLang: null }));
    }
  }

  // Save landing page selection
  async function handleLandingPageChange(pageId: string) {
    setMetaPush(prev => ({ ...prev, landingPageId: pageId }));
    await fetch(`/api/image-jobs/${initialJob.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landing_page_id: pageId || null }),
    });
  }

  // Push to Meta
  async function handlePushToMeta() {
    setMetaPush(prev => ({ ...prev, pushing: true, pushResults: null }));
    try {
      const res = await fetch(`/api/image-jobs/${initialJob.id}/push-to-meta`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.results) {
        setMetaPush(prev => ({ ...prev, pushResults: data.results }));
        await fetchDeployments();
      } else {
        setMetaPush(prev => ({ ...prev, pushResults: [{ language: "all", country: "all", status: "error", error: data.error || "Push failed" }] }));
      }
    } catch (err) {
      setMetaPush(prev => ({ ...prev, pushResults: [{ language: "all", country: "all", status: "error", error: "Push failed" }] }));
    } finally {
      setMetaPush(prev => ({ ...prev, pushing: false }));
      playNotificationSound();
    }
  }

  // Play notification sound
  const playNotificationSound = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(587, ctx.currentTime); // D5
      oscillator.frequency.setValueAtTime(784, ctx.currentTime + 0.15); // G5
      oscillator.frequency.setValueAtTime(988, ctx.currentTime + 0.3); // B5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
    } catch {}
  }, []);

  const allTranslations = job.source_images?.flatMap(
    (si) => si.image_translations ?? []
  ) ?? [];
  const totalCount = allTranslations.length;
  const completedCount = allTranslations.filter((t) => t.status === "completed").length;
  const failedCount = allTranslations.filter((t) => t.status === "failed").length;
  const pendingCount = allTranslations.filter(
    (t) => t.status === "pending" || t.status === "processing"
  ).length;

  const sourceImages = job.source_images ?? [];

  const refreshJob = useCallback(async (compact = false) => {
    const url = compact
      ? `/api/image-jobs/${job.id}?compact=true`
      : `/api/image-jobs/${job.id}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setJob(data);
      return data as ImageJob;
    }
    return null;
  }, [job.id]);

  // Throttled refresh: coalesces rapid refresh requests to max 1 per 2 seconds
  // Uses compact mode to skip full version history during processing
  const throttledRefreshPending = useRef(false);
  const throttledRefreshTimer = useRef<NodeJS.Timeout | null>(null);
  const lastRefreshTime = useRef(0);

  const requestThrottledRefresh = useCallback(() => {
    throttledRefreshPending.current = true;
    const now = Date.now();
    const elapsed = now - lastRefreshTime.current;
    const MIN_INTERVAL = 5000;

    if (elapsed >= MIN_INTERVAL) {
      throttledRefreshPending.current = false;
      lastRefreshTime.current = now;
      refreshJob(true);
    } else if (!throttledRefreshTimer.current) {
      throttledRefreshTimer.current = setTimeout(() => {
        throttledRefreshTimer.current = null;
        if (throttledRefreshPending.current) {
          throttledRefreshPending.current = false;
          lastRefreshTime.current = Date.now();
          refreshJob(true);
        }
      }, MIN_INTERVAL - elapsed);
    }
  }, [refreshJob]);

  useEffect(() => {
    return () => {
      if (throttledRefreshTimer.current) {
        clearTimeout(throttledRefreshTimer.current);
      }
    };
  }, []);

  // Start processing pending translations on mount (and auto-resume stalled ones)
  useEffect(() => {
    async function resumeOnMount() {
      const stalled = getStalledTranslations(initialJob);
      if (stalled.length > 0) {
        await fetch(`/api/image-jobs/${initialJob.id}/retry?include_stalled=true`, { method: "POST" });
        const updated = await refreshJob();
        if (updated) {
          const pending = getAllPending(updated);
          if (pending.length > 0 && !processingRef.current) {
            startQueue(pending);
          }
        }
        return;
      }
      const pending = getAllPending(initialJob);
      if (pending.length > 0 && !processingRef.current) {
        startQueue(pending);
      }
    }
    resumeOnMount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll when job is "draft" (importing from Drive in background)
  useEffect(() => {
    if (job.status !== "draft") return;
    const interval = setInterval(() => refreshJob(), 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.status]);

  // Auto-start translation queue when pending translations appear (e.g. after background create-translations)
  useEffect(() => {
    if (job.status !== "processing") return;
    if (processingRef.current) return;
    const pending = getAllPending(job);
    if (pending.length > 0) {
      startQueue(pending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.status]);

  // Watchdog timer: detect and recover stalled translations while processing
  useEffect(() => {
    if (!proc.processing) return;
    const interval = setInterval(async () => {
      const updated = await refreshJob();
      if (!updated) return;
      const stalled = getStalledTranslations(updated);
      if (stalled.length > 0) {
        await fetch(`/api/image-jobs/${updated.id}/retry?include_stalled=true`, { method: "POST" });
        const refreshed = await refreshJob();
        if (refreshed) {
          const pending = getAllPending(refreshed);
          if (pending.length > 0 && !processingRef.current) {
            startQueue(pending);
          }
        }
      }
    }, 120_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proc.processing]);

  // Stall detection banner
  useEffect(() => {
    if (
      job.status === "processing" &&
      !processingRef.current &&
      getStalledTranslations(job).length > 0
    ) {
      setShowRestartBanner(true);
    } else {
      setShowRestartBanner(false);
    }
  }, [job]);

  async function handleRestart() {
    await fetch(`/api/image-jobs/${job.id}/retry?include_stalled=true`, { method: "POST" });
    const updated = await refreshJob();
    if (updated) {
      const pending = getAllPending(updated);
      if (pending.length > 0) {
        startQueue(pending);
      }
    }
    setShowRestartBanner(false);
  }

  function getAllPending(j: ImageJob): ImageTranslation[] {
    return (
      j.source_images?.flatMap(
        (si) =>
          si.image_translations?.filter((t) => t.status === "pending") ?? []
      ) ?? []
    );
  }

  function getStalledTranslations(j: ImageJob): ImageTranslation[] {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return (
      j.source_images?.flatMap(
        (si) =>
          si.image_translations?.filter(
            (t) =>
              t.status === "processing" &&
              new Date(t.updated_at).getTime() < fiveMinutesAgo
          ) ?? []
      ) ?? []
    );
  }

  function handleCancel() {
    cancelRef.current = true;
  }

  async function startQueue(translations: ImageTranslation[]) {
    if (processingRef.current) return;
    processingRef.current = true;
    cancelRef.current = false;
    setProc({ processing: true, startTime: Date.now(), processedInSession: 0, refreshing: false });

    const queue = [...translations];
    const CONCURRENCY = 3;
    const executing = new Set<Promise<void>>();

    for (const item of queue) {
      if (cancelRef.current) break;
      const p = processOne(item).then(() => {
        executing.delete(p);
        setProc(prev => ({ ...prev, processedInSession: prev.processedInSession + 1 }));
      });
      executing.add(p);
      if (executing.size >= CONCURRENCY) {
        await Promise.race(executing);
      }
    }
    await Promise.all(executing);

    processingRef.current = false;
    cancelRef.current = false;
    setProc(prev => ({ ...prev, processing: false, startTime: null }));
    const finalJob = await refreshJob();
    playNotificationSound();

    // Send email notification if enabled
    if (finalJob) {
      const settings = getSettings();
      if (settings.static_ads_email_enabled && settings.static_ads_notification_email) {
        try {
          await fetch("/api/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jobId: finalJob.id,
              email: settings.static_ads_notification_email,
            }),
          });
        } catch (err) {
          console.error("Email notification failed:", err);
        }
      }
    }
  }

  async function processOne(translation: ImageTranslation) {
    const settings = getSettings();
    const qualityEnabled = settings.static_ads_quality_enabled !== false && !settings.static_ads_economy_mode;
    const threshold = settings.static_ads_quality_threshold ?? DEFAULT_QUALITY_THRESHOLD;

    let corrected_text: string | undefined;
    let visual_instructions: string | undefined;
    let attempts = 0;

    const maxVersions = settings.static_ads_max_retries ?? DEFAULT_MAX_VERSIONS;
    while (attempts < maxVersions) {
      attempts++;

      try {
        // Translate
        const translateRes = await fetch(`/api/image-jobs/${job.id}/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            translationId: translation.id,
            ...(corrected_text && { corrected_text }),
            ...(visual_instructions && { visual_instructions }),
          }),
        });

        if (!translateRes.ok) break;
        const { versionId } = await translateRes.json();

        // Quality analysis (skip if disabled or no versionId)
        if (!qualityEnabled || !versionId) break;

        const analyzeRes = await fetch(`/api/image-jobs/${job.id}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ versionId }),
        });

        if (!analyzeRes.ok) break;
        const analysis: QualityAnalysis = await analyzeRes.json();

        // Check quality — if good enough, stop
        if (analysis.quality_score >= threshold) break;

        // Build corrective prompt for retry
        const corrections: string[] = [];
        if (analysis.spelling_errors?.length) corrections.push(`Fix spelling: ${analysis.spelling_errors.join(", ")}`);
        if (analysis.grammar_issues?.length) corrections.push(`Fix grammar: ${analysis.grammar_issues.join(", ")}`);
        if (analysis.missing_text?.length) corrections.push(`Include missing text: ${analysis.missing_text.join(", ")}`);

        corrected_text = analysis.extracted_text
          ? `The translated text should read: ${analysis.extracted_text}\n${corrections.join("\n")}`
          : corrections.join("\n");
        visual_instructions = [
          analysis.overall_assessment,
          corrections.length > 0 ? `Please correct: ${corrections.join("; ")}` : "",
        ].filter(Boolean).join("\n");

      } catch (err) {
        console.error("Translation/analysis failed:", err);
        break;
      }
    }

    requestThrottledRefresh();
  }

  async function handleRetryAll() {
    const res = await fetch(`/api/image-jobs/${job.id}/retry`, { method: "POST" });
    if (res.ok) {
      const { ids } = await res.json();
      const updated = await refreshJob();
      if (updated && ids.length > 0) {
        const pending = getAllPending(updated);
        startQueue(pending);
      }
    }
  }

  async function handleRetrySingle(translationId: string) {
    await fetch(`/api/image-jobs/${job.id}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ translationId, retry: true }),
    });
    await refreshJob();
  }

  async function handleTranslateAll() {
    if (selectedLanguages.size === 0) return;
    setShowTranslateConfirm(false);
    setProc(prev => ({ ...prev, processing: true }));

    // Save selected languages to job before creating translations
    await fetch(`/api/image-jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_languages: Array.from(selectedLanguages) }),
    });

    const res = await fetch(`/api/image-jobs/${job.id}/create-translations`, { method: "POST" });
    if (!res.ok) {
      setProc(prev => ({ ...prev, processing: false }));
      return;
    }
    const updated = await refreshJob();
    if (updated) {
      const pending = getAllPending(updated);
      if (pending.length > 0) {
        startQueue(pending);
      } else {
        setProc(prev => ({ ...prev, processing: false }));
      }
    }
  }


  // Filter images based on active tab
  const filteredImages = (job.source_images ?? []).map((si) => ({
    ...si,
    image_translations:
      activeTab === "all"
        ? si.image_translations
        : si.image_translations?.filter((t) => t.language === activeTab),
  }));

  // Count per language for tabs
  const langCounts = new Map<string, { total: number; completed: number }>();
  for (const t of allTranslations) {
    const curr = langCounts.get(t.language) ?? { total: 0, completed: 0 };
    curr.total++;
    if (t.status === "completed") curr.completed++;
    langCounts.set(t.language, curr);
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Back */}
      <Link
        href="/images"
        className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900 text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Ad Concepts
      </Link>

      {/* Stall detection banner */}
      {showRestartBanner && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="text-sm text-amber-700">Processing appears stalled.</span>
          </div>
          <button
            onClick={handleRestart}
            className="flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-800 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restart Now
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{job.name}</h1>
          <p className="text-sm text-gray-400 mt-1">
            {job.total_images ?? job.source_images?.length ?? 0} images &times;{" "}
            {job.target_languages.length} languages
            {job.target_ratios && job.target_ratios.length > 1 && (
              <> &times; {job.target_ratios.length} ratios</>
            )}
          </p>
        </div>
        <button
          onClick={async () => { setProc(prev => ({ ...prev, refreshing: true })); await refreshJob(); setProc(prev => ({ ...prev, refreshing: false })); }}
          disabled={proc.refreshing}
          className="text-gray-400 hover:text-gray-700 p-2 transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${proc.refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Wizard stepper */}
      {(() => {
        const [s1, s2, s3] = computeStepCompletion(job, copyTranslations);
        const steps: StepDef[] = [
          { label: "Images", complete: s1 },
          { label: "Ad Copy", complete: s2 },
          { label: "Preview & Push", complete: s3 },
        ];
        return (
          <div className="mb-6">
            <ConceptStepper steps={steps} currentStep={step} onStepClick={setStep} />
          </div>
        );
      })()}

      {step === 0 ? (
      <>
      {job.status === "draft" ? (
        <div className="space-y-4">
          <div className="flex items-center gap-1.5 text-indigo-600 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Importing from Drive...
            {sourceImages.length > 0 && (
              <span className="text-gray-500 ml-1">{sourceImages.length} imported</span>
            )}
            <span className="text-gray-400 ml-1"><ElapsedTimer /></span>
          </div>

          {/* Skeleton image grid — show imported images + placeholder skeletons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {sourceImages.map((si) => (
              <div key={si.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="aspect-square bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={si.original_url} alt={si.filename ?? ""} className="w-full h-full object-cover" />
                </div>
                {si.filename && <p className="text-xs text-gray-400 px-2 py-1.5 truncate">{si.filename}</p>}
              </div>
            ))}
            {/* Pulsing skeleton placeholders for images still loading */}
            {Array.from({ length: Math.max(0, 4 - sourceImages.length) }).map((_, i) => (
              <div key={`skel-${i}`} className="bg-white border border-gray-200 rounded-lg overflow-hidden animate-pulse">
                <div className="aspect-square bg-gray-200" />
                <div className="px-2 py-1.5">
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : job.status === "ready" ? (
        <>
          {/* Source images preview */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
            {sourceImages.map((si) => (
              <div key={si.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="aspect-square bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={si.original_url}
                    alt={si.filename ?? "Original"}
                    className="w-full h-full object-cover"
                  />
                </div>
                {si.filename && (
                  <p className="text-xs text-gray-400 px-2 py-1.5 truncate">{si.filename}</p>
                )}
              </div>
            ))}
          </div>

          {/* Language selection + Translate All */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Target Languages</label>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((lang) => {
                  const selected = selectedLanguages.has(lang.value);
                  return (
                    <label
                      key={lang.value}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium cursor-pointer transition-colors ${
                        selected
                          ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                          : "bg-white border-gray-200 text-gray-400 hover:text-gray-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => {
                          setSelectedLanguages((prev) => {
                            const next = new Set(prev);
                            if (next.has(lang.value)) next.delete(lang.value);
                            else next.add(lang.value);
                            return next;
                          });
                        }}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span role="img" aria-label={lang.label}>{lang.flag}</span>
                      {lang.label}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowTranslateConfirm(true)}
                disabled={proc.processing || selectedLanguages.size === 0}
                className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50"
              >
                  {proc.processing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                      Starting translations...
                    </>
                  ) : (
                    "Translate All"
                  )}
                </button>
                {selectedLanguages.size > 0 && (
                  <p className="text-sm text-gray-400">
                    {sourceImages.length * selectedLanguages.size} translations
                    {" \u2248 $"}{(sourceImages.length * selectedLanguages.size * 0.09).toFixed(2)}
                  </p>
                )}
              </div>
            </div>

            {/* Translate confirmation dialog */}
            {showTranslateConfirm && (() => {
              const translatableCount = sourceImages.filter(si => !si.skip_translation).length;
              const totalTranslations = translatableCount * selectedLanguages.size;
              const estCost = totalTranslations * 0.09;
              const estMinutes = Math.ceil(Math.ceil(totalTranslations / 10) * 75 / 60);
              return (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowTranslateConfirm(false)}>
                  <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
                    <h3 className="text-base font-semibold text-gray-900 mb-3">Start translation batch?</h3>
                    <div className="space-y-2 mb-5">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Images</span>
                        <span className="text-gray-800 font-medium">{translatableCount}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Languages</span>
                        <span className="text-gray-800 font-medium">{selectedLanguages.size} ({Array.from(selectedLanguages).map(l => { const li = LANGUAGES.find(li => li.value === l); return <span key={l} role="img" aria-label={li?.label ?? l}>{li?.flag}</span>; })})</span>
                      </div>
                      <div className="flex justify-between text-sm border-t border-gray-100 pt-2">
                        <span className="text-gray-500">Total translations</span>
                        <span className="text-gray-800 font-medium">{totalTranslations}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Estimated cost</span>
                        <span className="text-gray-800 font-medium">${estCost.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Estimated time</span>
                        <span className="text-gray-800 font-medium">~{estMinutes} min</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowTranslateConfirm(false)} className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                        Cancel
                      </button>
                      <button onClick={handleTranslateAll} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors">
                        Start
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
        </>
      ) : (
      <>
      {/* Status summary */}
      <div className="flex items-center gap-3 mb-3">
        {pendingCount > 0 || proc.processing ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-indigo-600 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing... ({completedCount}/{totalCount})
            </div>
            {proc.startTime && (
              <ProcessingTimer
                startTime={proc.startTime}
                processedCount={proc.processedInSession}
                remainingCount={pendingCount}
              />
            )}
            {proc.processing && (
              <button
                onClick={handleCancel}
                className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors"
              >
                <Square className="w-3 h-3 fill-current" />
                Stop
              </button>
            )}
          </div>
        ) : failedCount > 0 ? (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-emerald-600 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              {completedCount} ready
            </span>
            <span className="flex items-center gap-1.5 text-yellow-600 text-sm">
              <AlertTriangle className="w-4 h-4" />
              {failedCount} failed
            </span>
            <button
              onClick={handleRetryAll}
              className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry all
            </button>
          </div>
        ) : (
          <span className="flex items-center gap-1.5 text-emerald-600 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            {completedCount} ready
          </span>
        )}
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="mb-6">
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden flex">
            {completedCount > 0 && (
              <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${(completedCount / totalCount) * 100}%` }} />
            )}
            {failedCount > 0 && (
              <div className="bg-red-400 h-full transition-all duration-500" style={{ width: `${(failedCount / totalCount) * 100}%` }} />
            )}
          </div>
          <div className="flex items-center gap-4 mt-1.5">
            {job.target_languages.map((lang) => {
              const langInfo = LANGUAGES.find((l) => l.value === lang);
              const counts = langCounts.get(lang);
              return (
                <span key={lang} className="text-xs text-gray-400">
                  <span role="img" aria-label={langInfo?.label ?? lang}>{langInfo?.flag}</span> {counts?.completed ?? 0}/{counts?.total ?? 0}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Language tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-6">
        <TabButton
          active={activeTab === "all"}
          onClick={() => setActiveTab("all")}
          label="All"
          count={totalCount}
        />
        {job.target_languages.map((lang) => {
          const langInfo = LANGUAGES.find((l) => l.value === lang);
          const counts = langCounts.get(lang);
          return (
            <TabButton
              key={lang}
              active={activeTab === lang}
              onClick={() => setActiveTab(lang)}
              label={`${langInfo?.label ?? lang.toUpperCase()}`}
              count={counts?.total ?? 0}
              completed={counts?.completed}
            />
          );
        })}
      </div>

      {/* Image grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredImages.map((si) => (
          <div
            key={si.id}
            className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm cursor-pointer hover:border-indigo-200 transition-colors"
            onClick={() => { setPreviewImage(si); setPreviewLang(null); }}
          >
            {/* Thumbnail */}
            <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={si.original_url}
                alt={si.filename ?? "Source image"}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Translation statuses */}
            <div className="p-2.5 space-y-1">
              {si.skip_translation ? (
                <div className="flex items-center gap-1.5">
                  <EyeOff className="w-3 h-3 text-gray-400" />
                  <span className="text-xs text-gray-400">Original only</span>
                </div>
              ) : (si.image_translations ?? []).map((t) => {
                const langInfo = LANGUAGES.find((l) => l.value === t.language);
                const versionCount = t.versions?.length ?? 0;
                return (
                  <div key={t.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs" role="img" aria-label={langInfo?.label ?? t.language}>{langInfo?.flag}</span>
                      {t.aspect_ratio && t.aspect_ratio !== "1:1" && (
                        <span className="text-xs text-gray-400 bg-gray-100 px-1 rounded">{t.aspect_ratio}</span>
                      )}
                      <TranslationStatusBadge status={t.status} />
                      {versionCount > 1 && (
                        <span className="text-xs text-gray-400">v{versionCount}</span>
                      )}
                    </div>
                    {t.status === "failed" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRetrySingle(t.id); }}
                        className="text-gray-400 hover:text-indigo-700 transition-colors"
                        title="Retry"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      </>
      )}
      </>
      ) : step === 1 ? (
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

          {/* Landing Page */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <Globe className="w-4 h-4" />
              Landing Page
            </label>
            {landingPages.length > 0 ? (
              <select
                value={metaPush.landingPageId}
                onChange={(e) => handleLandingPageChange(e.target.value)}
                className="w-full bg-white border border-gray-300 text-gray-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="">Select a landing page...</option>
                {landingPages.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-400">
                No published landing pages found for this product
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
                          {ct?.status === "completed" && ct.quality_score != null && (
                            <QualityBadge score={ct.quality_score} />
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

                      {/* Translation content */}
                      {ct?.status === "completed" && (
                        <div className="px-4 py-3 space-y-3">
                          {/* Primary texts */}
                          {ct.primary_texts.map((text, i) => (
                            <div key={`p-${i}`} className="space-y-1">
                              {ct.primary_texts.length > 1 && (
                                <p className="text-xs text-gray-400">Primary text {i + 1}</p>
                              )}
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{text}</p>
                            </div>
                          ))}

                          {/* Headlines */}
                          {ct.headlines.length > 0 && ct.headlines.some((h) => h.trim()) && (
                            <div className="border-t border-gray-100 pt-2">
                              {ct.headlines.map((text, i) => (
                                <div key={`h-${i}`} className="space-y-1">
                                  {ct.headlines.length > 1 && (
                                    <p className="text-xs text-gray-400">Headline {i + 1}</p>
                                  )}
                                  <p className="text-sm font-medium text-gray-700">{text}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Quality analysis details */}
                          {ct.quality_analysis && (
                            <div className="border-t border-gray-100 pt-2">
                              <p className="text-xs text-gray-500 mb-1">{ct.quality_analysis.overall_assessment}</p>
                              {ct.quality_analysis.fluency_issues?.length > 0 && (
                                <p className="text-xs text-amber-600">Fluency: {ct.quality_analysis.fluency_issues.join("; ")}</p>
                              )}
                              {ct.quality_analysis.grammar_issues?.length > 0 && (
                                <p className="text-xs text-red-600">Grammar: {ct.quality_analysis.grammar_issues.join("; ")}</p>
                              )}
                              {ct.quality_analysis.context_errors?.length > 0 && (
                                <p className="text-xs text-orange-600">Context: {ct.quality_analysis.context_errors.join("; ")}</p>
                              )}
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
                                  className="mt-2 flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 disabled:opacity-50 transition-colors"
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

        </div>
      ) : (
        <MetaAdPreview
          job={job}
          copyTranslations={copyTranslations}
          metaPush={metaPush}
          deployments={deployments}
          onPushToMeta={handlePushToMeta}
          landingPageUrls={previewData?.landingPageUrls ?? {}}
          campaignMappings={previewData?.campaignMappings ?? []}
          pageConfigs={previewData?.pageConfigs ?? []}
          markedReadyAt={job.marked_ready_at}
          onMarkReady={async () => {
            const now = new Date().toISOString();
            await fetch(`/api/image-jobs/${job.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ marked_ready_at: now }),
            });
            setJob(prev => ({ ...prev, marked_ready_at: now }));
          }}
        />
      )}

      {/* Preview modal (always rendered regardless of tab) */}
      {previewImage && (() => {
        const allImages = job.source_images ?? [];
        const currentIdx = allImages.findIndex((si) => si.id === previewImage.id);
        return (
          <ImagePreviewModal
            sourceImage={previewImage}
            activeLang={previewLang}
            onChangeLang={setPreviewLang}
            onClose={() => setPreviewImage(null)}
            onRetry={(id) => { handleRetrySingle(id); }}
            onPrev={currentIdx > 0 ? () => { setPreviewImage(allImages[currentIdx - 1]); setPreviewLang(null); } : undefined}
            onNext={currentIdx < allImages.length - 1 ? () => { setPreviewImage(allImages[currentIdx + 1]); setPreviewLang(null); } : undefined}
            currentIndex={currentIdx}
            totalCount={allImages.length}
          />
        );
      })()}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
  completed,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  completed?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
        active
          ? "text-indigo-600 border-indigo-500"
          : "text-gray-400 hover:text-gray-700 border-transparent"
      }`}
    >
      {label}
      <span
        className={`px-1.5 py-0.5 rounded text-xs font-medium ${
          completed !== undefined && completed === count
            ? "bg-emerald-50 text-emerald-600"
            : "bg-gray-200 text-gray-500"
        }`}
      >
        {completed !== undefined ? `${completed}/${count}` : count}
      </span>
    </button>
  );
}


function ElapsedTimer() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return (
    <span className="tabular-nums">
      {mins > 0 ? `${mins}m ${secs.toString().padStart(2, "0")}s` : `${secs}s`}
    </span>
  );
}

function ProcessingTimer({ startTime, processedCount, remainingCount }: {
  startTime: number;
  processedCount: number;
  remainingCount: number;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsed = Math.floor((now - startTime) / 1000);
  const elapsedMin = Math.floor(elapsed / 60);
  const elapsedSec = elapsed % 60;
  const elapsedStr = elapsedMin > 0
    ? `${elapsedMin}m ${elapsedSec.toString().padStart(2, "0")}s`
    : `${elapsedSec}s`;

  // Estimate remaining time based on avg per image
  let etaStr = "";
  if (processedCount > 0 && remainingCount > 0) {
    const avgPerItem = elapsed / processedCount;
    const etaSec = Math.ceil(avgPerItem * remainingCount);
    const etaMin = Math.floor(etaSec / 60);
    const etaRemSec = etaSec % 60;
    etaStr = etaMin > 0
      ? `~${etaMin}m ${etaRemSec.toString().padStart(2, "0")}s left`
      : `~${etaRemSec}s left`;
  }

  return (
    <span className="text-xs text-gray-400 tabular-nums">
      {elapsedStr}{etaStr && <> &middot; {etaStr}</>}
    </span>
  );
}

function QualityBadge({ score }: { score: number }) {
  const color =
    score >= 90
      ? "bg-emerald-50 text-emerald-700"
      : score >= 70
      ? "bg-amber-50 text-amber-700"
      : "bg-red-50 text-red-700";
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${color}`}>
      {score}
    </span>
  );
}

function TranslationStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <span className="flex items-center gap-1 text-xs text-emerald-600">
          <CheckCircle2 className="w-3 h-3" />
          Ready
        </span>
      );
    case "processing":
      return (
        <span className="flex items-center gap-1 text-xs text-indigo-600">
          <Loader2 className="w-3 h-3 animate-spin" />
          Generating...
        </span>
      );
    case "failed":
      return (
        <span className="flex items-center gap-1 text-xs text-red-600">
          <AlertTriangle className="w-3 h-3" />
          Failed
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <Loader2 className="w-3 h-3" />
          Pending
        </span>
      );
  }
}
