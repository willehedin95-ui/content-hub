"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  RotateCcw,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { ImageJob, ImageTranslation, SourceImage, QualityAnalysis, Language, LANGUAGES, MetaCampaign, MetaCampaignMapping, MetaPageConfig, ConceptCopyTranslations } from "@/types";
import { getSettings } from "@/lib/settings";
import ImagePreviewModal from "./ImagePreviewModal";
import ConceptStepper, { StepDef } from "./ConceptStepper";
import EditableTags from "@/components/pages/EditableTags";
import ConceptImagesStep from "./ConceptImagesStep";
import ConceptAdCopyStep from "./ConceptAdCopyStep";
import ConceptPreviewStep from "./ConceptPreviewStep";

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

  // Step 2: Ad Copy — has primary text + landing page/AB test + all target languages translated
  const hasPrimary = (j.ad_copy_primary ?? []).some((t: string) => t.trim());
  const hasLanding = !!j.landing_page_id || !!j.ab_test_id;
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
  const [showAddLang, setShowAddLang] = useState(false);
  const [addLangSelected, setAddLangSelected] = useState<Set<Language>>(new Set());
  const [addLangLoading, setAddLangLoading] = useState(false);

  // Meta push states
  const [metaPush, setMetaPush] = useState<{
    primaryTexts: string[];
    headlines: string[];
    landingPageId: string;
    abTestId: string;
    pushing: boolean;
    pushResults: Array<{ language: string; country: string; status: string; error?: string; scheduled_time?: string }> | null;
  }>(() => ({
    primaryTexts: (initialJob.ad_copy_primary ?? []).length > 0 ? initialJob.ad_copy_primary! : [""],
    headlines: (initialJob.ad_copy_headline ?? []).length > 0 ? initialJob.ad_copy_headline! : [""],
    landingPageId: initialJob.landing_page_id ?? "",
    abTestId: initialJob.ab_test_id ?? "",
    pushing: false,
    pushResults: null,
  }));

  const [landingPages, setLandingPages] = useState<Array<{ id: string; name: string; slug: string; product: string; tags?: string[] }>>([]);
  const [abTests, setAbTests] = useState<Array<{ id: string; name: string; slug: string; language: string; router_url: string }>>([]);
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
  const translatedCopyDebounceRef = useRef<NodeJS.Timeout | null>(null);
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

  // Fetch landing pages and AB tests for this product
  useEffect(() => {
    if (!initialJob.product) return;
    // Fetch for all target languages to get AB tests across languages
    const langs = initialJob.target_languages?.length ? initialJob.target_languages : ["no"];
    const fetches = langs.map((lang) =>
      fetch(`/api/meta/assets/landing-pages?language=${lang}&product=${initialJob.product}`)
        .then((res) => res.json())
    );
    Promise.all(fetches)
      .then((results) => {
        // Deduplicate pages across languages
        const seenPages = new Set<string>();
        const pages: Array<{ id: string; name: string; slug: string; product: string; tags?: string[] }> = [];
        const seenTests = new Set<string>();
        const tests: Array<{ id: string; name: string; slug: string; language: string; router_url: string }> = [];
        for (const data of results) {
          for (const t of data.pages ?? []) {
            const pageId = (t.pages as { id: string; name: string; slug: string; product: string; tags?: string[] }).id;
            if (!seenPages.has(pageId)) {
              seenPages.add(pageId);
              pages.push(t.pages as { id: string; name: string; slug: string; product: string; tags?: string[] });
            }
          }
          for (const ab of data.abTests ?? []) {
            if (!seenTests.has(ab.id)) {
              seenTests.add(ab.id);
              tests.push(ab);
            }
          }
        }
        setLandingPages(pages);
        setAbTests(tests);
      })
      .catch(() => {});
  }, [initialJob.product, initialJob.target_languages]);

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

  function handleTranslatedCopyChange(lang: string, field: "primary_texts" | "headlines", index: number, value: string) {
    setCopyTranslations((prev) => {
      const ct = prev[lang];
      if (!ct) return prev;
      const updated = { ...ct, [field]: ct[field].map((t, i) => (i === index ? value : t)) };
      const next = { ...prev, [lang]: updated };
      if (translatedCopyDebounceRef.current) clearTimeout(translatedCopyDebounceRef.current);
      translatedCopyDebounceRef.current = setTimeout(async () => {
        setCopyState((s) => ({ ...s, saving: true }));
        await fetch(`/api/image-jobs/${initialJob.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ad_copy_translations: next }),
        });
        setCopyState((s) => ({ ...s, saving: false }));
      }, 1000);
      return next;
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

  // Save website URL selection (landing page or AB test)
  async function handleWebsiteUrlChange(value: string) {
    if (value.startsWith("abtest:")) {
      const abTestId = value.replace("abtest:", "");
      setMetaPush(prev => ({ ...prev, landingPageId: "", abTestId }));
      await fetch(`/api/image-jobs/${initialJob.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ab_test_id: abTestId, landing_page_id: null }),
      });
    } else {
      setMetaPush(prev => ({ ...prev, landingPageId: value, abTestId: "" }));
      await fetch(`/api/image-jobs/${initialJob.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ landing_page_id: value || null, ab_test_id: null }),
      });
    }
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
  // Also auto-recover: if stuck in draft with source images for >2min, retry create-translations
  useEffect(() => {
    if (job.status !== "draft") return;
    const interval = setInterval(() => refreshJob(), 3000);

    const staleMs = Date.now() - new Date(job.created_at).getTime();
    const hasImages = (job.source_images?.length ?? 0) > 0;
    if (staleMs > 2 * 60 * 1000 && hasImages) {
      fetch(`/api/image-jobs/${job.id}/create-translations`, { method: "POST" })
        .then((res) => { if (res.ok) refreshJob(); })
        .catch(() => {});
    }

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

  async function handleAddLanguages() {
    if (addLangSelected.size === 0) return;
    setAddLangLoading(true);
    const res = await fetch(`/api/image-jobs/${job.id}/add-languages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ languages: Array.from(addLangSelected) }),
    });
    if (!res.ok) {
      setAddLangLoading(false);
      return;
    }
    setShowAddLang(false);
    setAddLangSelected(new Set());
    setAddLangLoading(false);
    const updated = await refreshJob();
    if (updated) {
      const pending = getAllPending(updated);
      if (pending.length > 0) {
        startQueue(pending);
      }
    }
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
          <div className="mt-2">
            <EditableTags entityId={job.id} entityType="image-job" initialTags={job.tags ?? []} />
          </div>
          {/* Linked page / AB test */}
          {(job.landing_page_id || job.ab_test_id) && (() => {
            const linkedPage = landingPages.find((p) => p.id === job.landing_page_id);
            const linkedTest = abTests.find((t) => t.id === job.ab_test_id);
            if (!linkedPage && !linkedTest) return null;
            return (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-400">
                <ExternalLink className="w-3 h-3" />
                {linkedPage && (
                  <Link href={`/pages/${linkedPage.id}`} className="text-indigo-500 hover:text-indigo-700 transition-colors">
                    {linkedPage.name}
                  </Link>
                )}
                {linkedTest && (
                  <Link href={`/ab-tests/${linkedTest.id}`} className="text-indigo-500 hover:text-indigo-700 transition-colors">
                    {linkedTest.name}
                  </Link>
                )}
              </div>
            );
          })()}
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
        <ConceptImagesStep
          job={job}
          sourceImages={sourceImages}
          totalCount={totalCount}
          completedCount={completedCount}
          failedCount={failedCount}
          pendingCount={pendingCount}
          langCounts={langCounts}
          filteredImages={filteredImages}
          proc={proc}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          selectedLanguages={selectedLanguages}
          setSelectedLanguages={setSelectedLanguages}
          showTranslateConfirm={showTranslateConfirm}
          setShowTranslateConfirm={setShowTranslateConfirm}
          handleTranslateAll={handleTranslateAll}
          showAddLang={showAddLang}
          setShowAddLang={setShowAddLang}
          addLangSelected={addLangSelected}
          setAddLangSelected={setAddLangSelected}
          addLangLoading={addLangLoading}
          handleAddLanguages={handleAddLanguages}
          setPreviewImage={setPreviewImage}
          setPreviewLang={setPreviewLang}
          handleCancel={handleCancel}
          handleRetryAll={handleRetryAll}
          handleRetrySingle={handleRetrySingle}
        />
      ) : step === 1 ? (
        <ConceptAdCopyStep
          job={job}
          metaPush={metaPush}
          copyTranslations={copyTranslations}
          copyState={copyState}
          doc={doc}
          landingPages={landingPages}
          abTests={abTests}
          handlePrimaryChange={handlePrimaryChange}
          handleHeadlineChange={handleHeadlineChange}
          handleTranslatedCopyChange={handleTranslatedCopyChange}
          addPrimaryText={addPrimaryText}
          removePrimaryText={removePrimaryText}
          addHeadline={addHeadline}
          removeHeadline={removeHeadline}
          handleFetchFromDoc={handleFetchFromDoc}
          handleTranslateCopy={handleTranslateCopy}
          handleWebsiteUrlChange={handleWebsiteUrlChange}
        />
      ) : (
        <ConceptPreviewStep
          job={job}
          copyTranslations={copyTranslations}
          metaPush={metaPush}
          deployments={deployments}
          previewData={previewData}
          onPushToMeta={handlePushToMeta}
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

