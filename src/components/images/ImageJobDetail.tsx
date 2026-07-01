"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  RotateCcw,
  RefreshCw,
  ExternalLink,
  GitBranch,
  ChevronDown,
  TrendingUp,
  Rocket,
  X,
  Trash2,
  Zap,
  MoreHorizontal,
  Info,
  Type,
  Loader2,
  FileText,
  Eye,
  Globe,
} from "lucide-react";
import { ImageJob, ImageTranslation, SourceImage, QualityAnalysis, Language, LANGUAGES, MetaCampaign, MetaCampaignMapping, MetaPageConfig, ConceptCopyTranslations, ProductSegment } from "@/types";
import { useWorkspaceLanguages } from "@/components/WorkspaceProvider";
import { deriveImageGrade } from "@/lib/quality-grades";
import { STATIC_STYLES, AWARENESS_STYLE_MAP } from "@/lib/constants";
import { getSettings } from "@/lib/settings";
import ImagePreviewModal from "./ImagePreviewModal";
import EditableTags from "@/components/pages/EditableTags";
import ConceptImagesStep from "./ConceptImagesStep";
import GenesisStaticPanel from "./GenesisStaticPanel";
import ConceptAdCopyStep, { LandingPageModalTrigger } from "./ConceptAdCopyStep";
import ConceptPreviewStep from "./ConceptPreviewStep";
import CashDnaEditor from "./CashDnaEditor";
import SmartIterateModal from "./SmartIterateModal";
import ConfirmDialog from "@/components/ui/confirm-dialog";

const DEFAULT_MAX_VERSIONS = 5;

interface Props {
  initialJob: ImageJob;
  autoIterate?: boolean;
  iterateMarket?: string;
  iteratePerf?: string;
}

// --- Status-driven helpers ---

type ConceptStatus = "generating" | "processing" | "ready" | "needs_copy" | "needs_review" | "on_launchpad" | "live" | "draft";

function computeConceptStatus(
  job: ImageJob,
  copyTranslations: ConceptCopyTranslations,
  launchpadPriority: number | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  perfData: { markets: Array<{ market: string; metrics?: { spend?: number; impressions?: number } | null }> } | null,
  proc: { processing: boolean },
  finishQueue: { started: boolean },
  completedCount: number,
  totalCount: number,
): ConceptStatus {
  // "Live" requires Meta to have ACTUALLY served the ad recently. Previously
  // this just checked `perfData.markets.length > 0`, which was true the moment
  // we pushed to any market — so paused / zero-delivery ad sets showed as
  // "Live" in the UI. The root-cause fix is to trust Meta's effective_status,
  // but `meta_campaigns.status` is only updated at push time and never synced
  // from Meta, so we use the 7-day aggregated metrics instead: if the concept
  // has recent impressions or spend in at least one market, it's serving.
  const hasRecentDelivery = (perfData?.markets ?? []).some(
    (m) => (m.metrics?.impressions ?? 0) > 0 || (m.metrics?.spend ?? 0) > 0
  );
  if (hasRecentDelivery) return "live";
  if (launchpadPriority !== null) return "on_launchpad";
  // Check if fully done BEFORE checking processing — processing flags may linger
  const hasPrimary = (job.ad_copy_primary ?? []).some((t: string) => t.trim());
  const allImgDone = totalCount > 0 && completedCount === totalCount;
  const translatableLangs = job.target_languages.filter((lang) => lang !== job.source_language);
  const allCopyDone = translatableLangs.length === 0 || translatableLangs.every((lang) => copyTranslations[lang]?.status === "completed");
  const anyReview = translatableLangs.some((lang) => copyTranslations[lang]?.status === "review");
  if (hasPrimary && allImgDone && allCopyDone) return "ready";
  if (hasPrimary && allImgDone && anyReview) return "needs_review";
  if (job.status === "draft") return "generating";
  if (job.status === "processing" || proc.processing || finishQueue.started) return "processing";
  if (!hasPrimary) return "needs_copy";
  return "draft";
}

function StatusBadge({ status }: { status: ConceptStatus }) {
  const config: Record<ConceptStatus, { label: string; cls: string }> = {
    generating: { label: "Generating", cls: "bg-amber-50 text-amber-700" },
    draft: { label: "Draft", cls: "bg-gray-100 text-gray-600" },
    processing: { label: "Processing", cls: "bg-indigo-50 text-indigo-700" },
    needs_copy: { label: "Needs Copy", cls: "bg-amber-50 text-amber-700" },
    needs_review: { label: "Quality Review", cls: "bg-amber-50 text-amber-700" },
    ready: { label: "Ready", cls: "bg-blue-50 text-blue-700" },
    on_launchpad: { label: "Launch Pad", cls: "bg-emerald-50 text-emerald-700" },
    live: { label: "Live", cls: "bg-green-50 text-green-700" },
  };
  const c = config[status];
  return <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${c.cls}`}>{c.label}</span>;
}

function CollapsibleSection({
  title,
  icon: Icon,
  badge,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Icon className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-800">{title}</span>
          {badge}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4">
          {children}
        </div>
      )}
    </div>
  );
}

export default function ImageJobDetail({ initialJob, autoIterate, iterateMarket, iteratePerf }: Props) {
  const wsLanguages = useWorkspaceLanguages();
  const router = useRouter();
  const [job, setJob] = useState<ImageJob>(initialJob);
  const [confirmDeleteConcept, setConfirmDeleteConcept] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const sections = new Set<string>(["images"]);
    const hasPrimary = (initialJob.ad_copy_primary ?? []).some((t: string) => t.trim());
    const initCt = initialJob.ad_copy_translations ?? {};
    const initTranslatable = initialJob.target_languages.filter((lang) => lang !== initialJob.source_language);
    const allCopyDone = initTranslatable.length === 0 || initTranslatable.every((lang) => (initCt as ConceptCopyTranslations)[lang]?.status === "completed");
    if (!hasPrimary || !allCopyDone) sections.add("adcopy");
    const hasPushed = (initialJob.deployments ?? []).some((d: { status: string }) => d.status === "pushed");
    if (hasPushed) sections.add("preview");
    return sections;
  });
  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const adCopySectionRef = useRef<HTMLDivElement>(null);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"all" | string>("all");
  const [selectedRatio, setSelectedRatio] = useState<string>("4:5");
  // A/B page testing disabled — all concepts use primary landing page from workspace settings
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
  const genAbortRef = useRef<AbortController | null>(null);
  const [showTranslateConfirm, setShowTranslateConfirm] = useState(false);
  const [showAddLang, setShowAddLang] = useState(false);
  const [addLangSelected, setAddLangSelected] = useState<Set<Language>>(new Set());
  const [addLangLoading, setAddLangLoading] = useState(false);

  // Meta push states
  const [metaPush, setMetaPush] = useState<{
    primaryTexts: string[];
    headlines: string[];
    landingPageId: string;
    landingPageIdB: string;
    pushing: boolean;
    pushResults: Array<{ language: string; country: string; status: string; error?: string; scheduled_time?: string }> | null;
  }>(() => ({
    primaryTexts: (initialJob.ad_copy_primary ?? []).length > 0 ? initialJob.ad_copy_primary! : [""],
    headlines: (initialJob.ad_copy_headline ?? []).length > 0 ? initialJob.ad_copy_headline! : [""],
    landingPageId: initialJob.landing_page_id ?? "",
    landingPageIdB: initialJob.landing_page_id_b ?? "",
    pushing: false,
    pushResults: null,
  }));

  // Sync metaPush ad copy when job data updates (e.g. from background swipe pipeline)
  useEffect(() => {
    const jobPrimary = job.ad_copy_primary ?? [];
    const jobHeadline = job.ad_copy_headline ?? [];
    const currentPrimary = metaPush.primaryTexts;
    const currentHeadline = metaPush.headlines;
    // Only sync if metaPush has empty/placeholder values and job has real data
    const primaryIsEmpty = currentPrimary.length <= 1 && !currentPrimary[0]?.trim();
    const headlineIsEmpty = currentHeadline.length <= 1 && !currentHeadline[0]?.trim();
    if ((primaryIsEmpty && jobPrimary.length > 0 && jobPrimary.some((t: string) => t.trim())) ||
        (headlineIsEmpty && jobHeadline.length > 0 && jobHeadline.some((t: string) => t.trim()))) {
      setMetaPush((prev) => ({
        ...prev,
        primaryTexts: jobPrimary.length > 0 ? jobPrimary : prev.primaryTexts,
        headlines: jobHeadline.length > 0 ? jobHeadline : prev.headlines,
        landingPageId: job.landing_page_id ?? prev.landingPageId,
        landingPageIdB: job.landing_page_id_b ?? prev.landingPageIdB,
      }));
    }
  }, [job.ad_copy_primary, job.ad_copy_headline, job.landing_page_id, job.landing_page_id_b]);

  const [landingPages, setLandingPages] = useState<Array<{ id: string; name: string; slug: string; product: string; tags?: string[]; page_type?: string; angle?: string; thumbnail_url?: string | null; isPublished?: boolean }>>([]);
  const [deployments, setDeployments] = useState<MetaCampaign[]>([]);
  const [previewData, setPreviewData] = useState<{
    landingPageUrls: Record<string, string>;
    campaignMappings: MetaCampaignMapping[];
    pageConfigs: MetaPageConfig[];
  } | null>(null);

  // Re-roll state
  const [rerollingId, setRerollingId] = useState<string | null>(null);

  // Static ad generation states
  const [genState, setGenState] = useState<{
    generating: boolean;
    count: number;
    selectedStyles: string[];
    segmentId: string | null;
    progress: string | null;
    error: string | null;
    results: Array<{ label: string; original_url: string; style?: string; reptileTriggers?: string[]; prompt?: string }> | null;
  }>({ generating: false, count: 3, selectedStyles: [], segmentId: null, progress: null, error: null, results: null });

  // Initialize selectedStyles from awareness level (once on mount)
  const stylesInitialized = useRef(false);
  useEffect(() => {
    if (stylesInitialized.current) return;
    stylesInitialized.current = true;
    const level = (job.cash_dna as Record<string, unknown> | null)?.awareness_level as string | undefined;
    if (level && AWARENESS_STYLE_MAP[level]) {
      setGenState(prev => ({ ...prev, selectedStyles: [...AWARENESS_STYLE_MAP[level]] }));
    } else {
      setGenState(prev => ({ ...prev, selectedStyles: STATIC_STYLES.slice(0, 3).map(s => s.id) }));
    }
  }, [job.cash_dna]);

  // Competitor swipe variation states
  const isCompetitorSwipe = (job.tags ?? []).includes("competitor-swipe");
  const competitorImageUrls = (job.competitor_reference_data as { competitor_image_urls?: string[] } | null)?.competitor_image_urls ?? [];
  const [varState, setVarState] = useState<{
    generating: boolean;
    count: number;
    progress: string | null;
    error: string | null;
  }>({ generating: false, count: 3, progress: null, error: null });
  const varAbortRef = useRef<AbortController | null>(null);

  // V3.3: Product segments for targeting
  const [productSegments, setProductSegments] = useState<ProductSegment[]>([]);

  // V3.4: Iteration dialog + lineage
  const [showIterateDialog, setShowIterateDialog] = useState(autoIterate ?? false);
  const [parentJob, setParentJob] = useState<{ id: string; name: string } | null>(null);
  const [childJobs, setChildJobs] = useState<Array<{ id: string; name: string; iteration_type: string }>>([]);

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

  // Finish & Queue state
  const [finishQueue, setFinishQueue] = useState<{
    loading: boolean;
    started: boolean;
    error: string | null;
  }>({ loading: false, started: false, error: null });

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

  // Sync copyTranslations from refreshed job data (e.g. autopilot pipeline, page reload)
  // and auto-recover stale "translating" states left by timed-out requests
  useEffect(() => {
    if (!job.ad_copy_translations || copyState.translating || copyState.translatingLang) return;
    const fresh = job.ad_copy_translations as ConceptCopyTranslations;
    const recovered = { ...fresh };
    let changed = false;
    for (const lang of Object.keys(recovered)) {
      if (recovered[lang]?.status === "translating") {
        recovered[lang] = { ...recovered[lang], status: "error", error: "Translation timed out — try again" };
        changed = true;
      }
    }
    setCopyTranslations(changed ? recovered : fresh);
  }, [job.ad_copy_translations, copyState.translating, copyState.translatingLang]);

  // Performance data from pipeline API
  const [perfData, setPerfData] = useState<{
    markets: Array<{
      market: string;
      stage: string;
      daysSincePush: number;
      metrics: { spend: number; revenue: number; roas: number; cpa: number; ctr: number; impressions: number; clicks: number; conversions: number } | null;
    }>;
    totals: { spend: number; revenue: number; roas: number; sales: number } | null;
  } | null>(null);
  const [perfExpanded, setPerfExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/pipeline/concept/${initialJob.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.markets?.length) return;
        const markets = data.markets.map((m: { market: string; stage: string; daysSincePush: number; metrics: Record<string, number> | null }) => ({
          market: m.market,
          stage: m.stage,
          daysSincePush: m.daysSincePush,
          metrics: m.metrics,
        }));
        const totalSpend = markets.reduce((s: number, m: { metrics: { spend: number } | null }) => s + (m.metrics?.spend ?? 0), 0);
        const totalRevenue = markets.reduce((s: number, m: { metrics: { revenue: number } | null }) => s + (m.metrics?.revenue ?? 0), 0);
        const totalSales = markets.reduce((s: number, m: { metrics: { conversions: number } | null }) => s + (m.metrics?.conversions ?? 0), 0);
        setPerfData({
          markets,
          totals: totalSpend > 0 ? {
            spend: totalSpend,
            revenue: totalRevenue,
            roas: Math.round((totalRevenue / totalSpend) * 100) / 100,
            sales: totalSales,
          } : null,
        });
      })
      .catch(() => {});
  }, [initialJob.id]);

  const [selectedLanguages, setSelectedLanguages] = useState<Set<Language>>(() => {
    const srcLang = initialJob.source_language;
    // Init from job if already set, otherwise from settings defaults
    if (initialJob.target_languages?.length) {
      return new Set(initialJob.target_languages.filter((l) => l !== srcLang) as Language[]);
    }
    try {
      const stored = localStorage.getItem("content-hub-settings");
      if (stored) {
        const settings = JSON.parse(stored);
        if (settings.static_ads_default_languages?.length) {
          return new Set(settings.static_ads_default_languages.filter((l: string) => l !== srcLang));
        }
      }
    } catch {}
    return new Set(wsLanguages.map((l) => l.value).filter((v) => v !== srcLang));
  });

  // Fetch landing pages for this product
  useEffect(() => {
    if (!initialJob.product) return;
    // Fetch for all target languages to get pages across languages
    const langs = initialJob.target_languages?.length ? initialJob.target_languages : ["no"];
    const fetches = langs.map((lang) =>
      fetch(`/api/meta/assets/landing-pages?language=${lang}&product=${initialJob.product}`)
        .then((res) => res.json())
    );
    Promise.all(fetches)
      .then((results) => {
        // Deduplicate pages across languages, track published status
        const seenPages = new Set<string>();
        const publishedPageIds = new Set<string>();
        const pages: Array<{ id: string; name: string; slug: string; product: string; tags?: string[]; page_type?: string; angle?: string; thumbnail_url?: string | null; isPublished?: boolean }> = [];
        // First pass: collect published page IDs
        for (const data of results) {
          for (const t of data.pages ?? []) {
            const page = t.pages as { id: string };
            if (t.published_url) publishedPageIds.add(page.id);
          }
        }
        // Second pass: deduplicate and add isPublished flag
        for (const data of results) {
          for (const t of data.pages ?? []) {
            const page = t.pages as { id: string; name: string; slug: string; product: string; tags?: string[]; page_type?: string; angle?: string; thumbnail_url?: string | null };
            if (!seenPages.has(page.id)) {
              seenPages.add(page.id);
              pages.push({ ...page, isPublished: publishedPageIds.has(page.id) });
            }
          }
        }
        // Sort: published first
        pages.sort((a, b) => (a.isPublished === b.isPublished ? 0 : a.isPublished ? -1 : 1));
        setLandingPages(pages);
      })
      .catch(() => {});
  }, [initialJob.product, initialJob.target_languages]);

  // V3.3: Fetch product segments for targeting
  useEffect(() => {
    if (!initialJob.product) return;
    // Need to look up product ID from slug, then fetch segments
    fetch("/api/products")
      .then((res) => res.json())
      .then((products: Array<{ id: string; slug: string }>) => {
        const match = products.find((p) => p.slug === initialJob.product);
        if (!match) return;
        return fetch(`/api/products/${match.id}/segments`).then((r) => r.json());
      })
      .then((segments) => {
        if (Array.isArray(segments)) setProductSegments(segments);
      })
      .catch(() => {});
  }, [initialJob.product]);

  // V3.4: Fetch parent job if this is an iteration
  useEffect(() => {
    if (!initialJob.iteration_of) return;
    fetch(`/api/image-jobs/${initialJob.iteration_of}?compact=true`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.id && data?.name) setParentJob({ id: data.id, name: data.name });
      })
      .catch(() => {});
  }, [initialJob.iteration_of]);

  // V3.4: Fetch child iterations of this job
  useEffect(() => {
    fetch(`/api/image-jobs?iteration_of=${initialJob.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setChildJobs(data.map((j: { id: string; name: string; iteration_type: string }) => ({
            id: j.id,
            name: j.name,
            iteration_type: j.iteration_type,
          })));
        }
      })
      .catch(() => {});
  }, [initialJob.id]);

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

  // Fetch preview data when preview section is first expanded (lazy load)
  const previewDataFetched = useRef(false);
  useEffect(() => {
    if (!expandedSections.has("preview") || previewDataFetched.current) return;
    previewDataFetched.current = true;
    fetch(`/api/image-jobs/${initialJob.id}/preview-data`)
      .then((res) => res.json())
      .then((data) => setPreviewData(data))
      .catch(() => {});
  }, [expandedSections, initialJob.id]);
  // Refetch when landing page changes (if preview data already loaded)
  useEffect(() => {
    if (!previewDataFetched.current) return;
    fetch(`/api/image-jobs/${initialJob.id}/preview-data`)
      .then((res) => res.json())
      .then((data) => setPreviewData(data))
      .catch(() => {});
  }, [metaPush.landingPageId, initialJob.id]);

  // Click-outside handler for overflow menu
  useEffect(() => {
    if (!showOverflowMenu) return;
    function handleClick(e: MouseEvent) {
      if (overflowMenuRef.current && !overflowMenuRef.current.contains(e.target as Node)) {
        setShowOverflowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showOverflowMenu]);

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

  // Save landing page A selection
  async function handleWebsiteUrlChange(value: string) {
    setMetaPush(prev => ({ ...prev, landingPageId: value }));
    await fetch(`/api/image-jobs/${initialJob.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landing_page_id: value || null }),
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

  // Launch Pad handlers
  async function handleAddToLaunchpad() {
    setLaunchpad(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch("/api/launchpad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageJobId: job.id }),
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

  async function handleApproveCopy(lang?: string) {
    try {
      const res = await fetch(`/api/image-jobs/${job.id}/approve-translations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lang ? { language: lang } : {}),
      });
      if (res.ok) {
        setCopyTranslations((prev) => {
          const next = { ...prev };
          for (const [key, val] of Object.entries(next)) {
            if (val.status === "review" && (!lang || key === lang)) {
              next[key] = { ...val, status: "completed" };
            }
          }
          return next;
        });
      }
    } catch {
      // Silently fail — user can retry
    }
  }

  async function handleRemoveFromLaunchpad() {
    setLaunchpad(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch("/api/launchpad", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageJobId: job.id }),
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

  // Finish & Queue handler
  async function handleFinishAndQueue() {
    setFinishQueue({ loading: true, started: false, error: null });
    try {
      const res = await fetch(`/api/image-jobs/${initialJob.id}/finish-and-queue`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setFinishQueue({ loading: false, started: true, error: null });
        // Start polling for updates
        await refreshJob();
      } else {
        setFinishQueue({ loading: false, started: false, error: data.error || "Failed to start pipeline" });
      }
    } catch {
      setFinishQueue({ loading: false, started: false, error: "Network error" });
    }
  }

  const allTranslations = job.source_images?.flatMap(
    (si) => si.image_translations ?? []
  ) ?? [];

  // Exclude pre-completed 4:5 stubs for skipped (no-text) images from progress counts
  // These are placeholders that were never processed — counting them inflates the total
  const skippedSourceIds = new Set(
    (job.source_images ?? []).filter((si) => si.skip_translation).map((si) => si.id)
  );
  const primaryRatioForCount = job.target_ratios?.[0] ?? "4:5";
  const activeTranslations = allTranslations.filter(
    (t) => !(skippedSourceIds.has(t.source_image_id) && t.aspect_ratio === primaryRatioForCount)
  );
  const totalCount = activeTranslations.length;
  const completedCount = activeTranslations.filter((t) => t.status === "completed").length;
  const failedCount = activeTranslations.filter((t) => t.status === "failed").length;
  const pendingCount = activeTranslations.filter(
    (t) => t.status === "pending" || t.status === "processing"
  ).length;

  // 9:16 generation readiness — use the job's primary ratio (4:5 for new, 1:1 for old)
  const primaryRatio = job.target_ratios?.[0] ?? "4:5";
  const translationsPrimary = allTranslations.filter((t) => t.aspect_ratio === primaryRatio);
  const translations9x16 = allTranslations.filter((t) => t.aspect_ratio === "9:16");
  const allPrimaryComplete = translationsPrimary.length > 0 && translationsPrimary.every((t) => t.status === "completed");
  const show9x16Button = allPrimaryComplete && translations9x16.length === 0 && !proc.processing;

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

  // Poll when server-side pipeline is running (Finish & Queue / autopilot)
  // The server processes translations via after() — client needs to poll for progress
  useEffect(() => {
    if (job.status !== "processing") return;
    if (proc.processing) return; // Client-side processing has its own watchdog
    const interval = setInterval(() => refreshJob(), 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.status, proc.processing]);

  // Poll when job is "draft" (importing from Drive or generating competitor images in background)
  // Auto-trigger competitor image generation if pending_competitor_gen is present
  // Also auto-recover: if stuck in draft with source images for >2min, retry create-translations
  const competitorGenTriggeredRef = useRef(false);
  useEffect(() => {
    if (job.status !== "draft") return;
    const interval = setInterval(() => refreshJob(), 3000);

    // Auto-trigger competitor image generation
    if (job.pending_competitor_gen && !competitorGenTriggeredRef.current) {
      competitorGenTriggeredRef.current = true;
      fetch(`/api/image-jobs/${job.id}/generate-competitor`, { method: "POST" })
        .then((res) => { if (res.ok) refreshJob(); })
        .catch(() => { competitorGenTriggeredRef.current = false; });
    }

    // Auto-recover stale draft jobs that have images but never got create-translations called.
    // Skip if swipe_progress is set AND the job is fresh — swipe pipeline is still running.
    const staleMs = Date.now() - new Date(job.created_at).getTime();
    const hasImages = (job.source_images?.length ?? 0) > 0;
    const swipeInProgress = !!job.swipe_progress;
    // If swipe_progress exists but updated_at is >6 min old, the Vercel function died
    // without cleanup. Treat it as stale and recover with whatever images we got.
    const swipeStale = swipeInProgress && (Date.now() - new Date(job.updated_at).getTime()) > 6 * 60 * 1000;
    if (staleMs > 2 * 60 * 1000 && hasImages && (!swipeInProgress || swipeStale)) {
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
        if (deriveImageGrade(analysis) !== "needs_fixes") break;

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

  async function handleGenerate9x16() {
    setProc(prev => ({ ...prev, processing: true }));

    const res = await fetch(`/api/image-jobs/${job.id}/generate-9x16`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      console.error("[generate-9x16] API error:", err);
      alert(`Failed to generate 9:16: ${err.error || res.statusText}`);
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


  // Generate static ads via Nano Banana
  function handleCancelGenerate() {
    genAbortRef.current?.abort();
    genAbortRef.current = null;
    setGenState(prev => ({ ...prev, generating: false, progress: null, error: null }));
    refreshJob();
  }

  async function handleGenerateStatic() {
    if (genState.generating) return;
    genAbortRef.current?.abort();
    const controller = new AbortController();
    genAbortRef.current = controller;

    setGenState(prev => ({ ...prev, generating: true, progress: "Starting generation...", error: null, results: null }));

    // Poll for new images while the API request runs — images appear in the grid as they complete
    const pollInterval = setInterval(() => refreshJob(), 3000);

    try {
      const res = await fetch(`/api/image-jobs/${job.id}/generate-static`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styles: genState.selectedStyles, segment_id: genState.segmentId }),
        signal: controller.signal,
      });
      const data = await res.json();
      clearInterval(pollInterval);

      if (!res.ok) {
        setGenState(prev => ({ ...prev, generating: false, progress: null, error: data.error || "Generation failed" }));
        await refreshJob();
        return;
      }
      const summary = data.failed > 0
        ? `Generated ${data.generated} of ${data.generated + data.failed} images. ${data.failed} failed: ${data.errors?.join("; ") ?? "unknown"}`
        : null;
      setGenState(prev => ({
        ...prev,
        generating: false,
        progress: null,
        error: summary,
        results: data.source_images ?? [],
      }));
      // Final refresh to ensure everything is in sync
      await refreshJob();
    } catch (err) {
      clearInterval(pollInterval);
      if (err instanceof DOMException && err.name === "AbortError") return;
      setGenState(prev => ({
        ...prev,
        generating: false,
        progress: null,
        error: err instanceof Error ? err.message : "Generation failed",
      }));
      await refreshJob();
    }
  }

  // Generate variations of a competitor-swipe concept
  async function handleGenerateVariations() {
    if (varState.generating) return;
    varAbortRef.current?.abort();
    const controller = new AbortController();
    varAbortRef.current = controller;

    setVarState(prev => ({ ...prev, generating: true, progress: "Generating variation prompts...", error: null }));

    const pollInterval = setInterval(() => refreshJob(), 3000);

    try {
      const res = await fetch(`/api/image-jobs/${job.id}/generate-variations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: varState.count }),
        signal: controller.signal,
      });
      const data = await res.json();
      clearInterval(pollInterval);

      if (!res.ok) {
        setVarState(prev => ({ ...prev, generating: false, progress: null, error: data.error || "Generation failed" }));
        await refreshJob();
        return;
      }
      const errorMsg = data.failed > 0
        ? `Generated ${data.generated}/${data.generated + data.failed}. ${data.failed} failed.`
        : null;
      setVarState(prev => ({ ...prev, generating: false, progress: null, error: errorMsg }));
      await refreshJob();
    } catch (err) {
      clearInterval(pollInterval);
      if (err instanceof DOMException && err.name === "AbortError") return;
      setVarState(prev => ({
        ...prev,
        generating: false,
        progress: null,
        error: err instanceof Error ? err.message : "Generation failed",
      }));
      await refreshJob();
    }
  }

  // Re-roll a single source image
  async function handleReroll(sourceImageId: string, customInstructions?: string) {
    if (rerollingId) return;
    setRerollingId(sourceImageId);
    try {
      const res = await fetch(`/api/image-jobs/${job.id}/re-roll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_image_id: sourceImageId,
          custom_instructions: customInstructions?.trim() || undefined,
        }),
      });
      if (res.ok) {
        await refreshJob();
        // Close preview modal if the re-rolled image was being viewed
        if (previewImage?.id === sourceImageId) {
          setPreviewImage(null);
        }
      }
    } catch (err) {
      console.error("Re-roll failed:", err);
    } finally {
      setRerollingId(null);
    }
  }

  // Toggle skip_translation on a source image
  async function handleToggleSkip(sourceImageId: string, skip: boolean) {
    // Optimistic update
    setJob((prev) => ({
      ...prev,
      source_images: (prev.source_images ?? []).map((si) =>
        si.id === sourceImageId ? { ...si, skip_translation: skip } : si
      ),
    }));
    try {
      await fetch(`/api/source-images/${sourceImageId}/skip`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skip }),
      });
    } catch (err) {
      console.error("Toggle skip failed:", err);
      // Revert on error
      setJob((prev) => ({
        ...prev,
        source_images: (prev.source_images ?? []).map((si) =>
          si.id === sourceImageId ? { ...si, skip_translation: !skip } : si
        ),
      }));
    }
  }

  async function handleDeleteImage(sourceImageId: string) {
    // Optimistic removal
    setJob((prev) => ({
      ...prev,
      source_images: (prev.source_images ?? []).filter((si) => si.id !== sourceImageId),
    }));
    try {
      const res = await fetch(`/api/source-images/${sourceImageId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    } catch (err) {
      console.error("Delete image failed:", err);
      await refreshJob();
    }
  }

  async function handleDeleteConcept() {
    const res = await fetch(`/api/image-jobs/${job.id}`, { method: "DELETE" });
    if (res.ok) router.push("/images");
  }

  // Filter images based on active tab
  const filteredImages = (job.source_images ?? []).map((si) => ({
    ...si,
    image_translations:
      activeTab === "all"
        ? si.image_translations
        : si.image_translations?.filter((t) => t.language === activeTab),
  }));

  // Count per language for tabs — only count primary ratio (4:5) to show "images translated" not "files generated"
  const langCounts = new Map<string, { total: number; completed: number }>();
  for (const t of activeTranslations) {
    if (t.aspect_ratio !== primaryRatioForCount) continue; // skip 9:16 so count = source images, not files
    const curr = langCounts.get(t.language) ?? { total: 0, completed: 0 };
    curr.total++;
    if (t.status === "completed") curr.completed++;
    langCounts.set(t.language, curr);
  }

  // Concept status for status-driven layout
  const conceptStatus = computeConceptStatus(job, copyTranslations, launchpad.priority, perfData, proc, finishQueue, completedCount, totalCount);

  // Ad copy completion for badge
  const translatableLangsForBadge = job.target_languages.filter((lang) => lang !== job.source_language);
  const adCopyLangsDone = translatableLangsForBadge.filter((lang) => copyTranslations[lang]?.status === "completed").length;
  const adCopyHasPrimary = (metaPush.primaryTexts ?? []).some((t) => t.trim());

  // Scroll to and expand ad copy section
  function scrollToAdCopy() {
    setExpandedSections((prev) => { const next = new Set(prev); next.add("adcopy"); return next; });
    setTimeout(() => adCopySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Back */}
      <Link
        href="/images"
        className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900 text-sm mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Concepts
      </Link>

      {/* ===== Slim Header ===== */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{job.name}</h1>
          <StatusBadge status={conceptStatus} />
        </div>
        <div className="flex items-center gap-2">
          {/* Status-driven primary CTA */}
          {conceptStatus === "generating" && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Generating...
            </span>
          )}
          {conceptStatus === "processing" && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg">
              <Zap className="w-3.5 h-3.5 animate-pulse" />
              Processing {completedCount}/{totalCount}
            </span>
          )}
          {conceptStatus === "needs_copy" && (
            <button
              onClick={scrollToAdCopy}
              className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Type className="w-3.5 h-3.5" />
              Write Ad Copy
            </button>
          )}
          {conceptStatus === "needs_review" && (
            <button
              onClick={() => handleApproveCopy()}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Approve Translations
            </button>
          )}
          {conceptStatus === "ready" && (
            <button
              onClick={handleAddToLaunchpad}
              disabled={launchpad.loading}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <Rocket className="w-3.5 h-3.5" />
              {launchpad.loading ? "Adding..." : "Add to Launch Pad"}
            </button>
          )}
          {conceptStatus === "draft" && (() => {
            const hasSources = (job.source_images?.length ?? 0) > 0;
            const hasPrimary = (metaPush.primaryTexts ?? []).some((t) => t.trim());
            if (hasSources && hasPrimary) return (
              <button
                onClick={handleFinishAndQueue}
                disabled={finishQueue.loading}
                className="flex items-center gap-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                title="Translate images + ad copy + add to Launch Pad"
              >
                <Zap className="w-3.5 h-3.5" />
                {finishQueue.loading ? "Starting..." : "Finish & Queue"}
              </button>
            );
            return null;
          })()}
          {conceptStatus === "on_launchpad" && (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg">
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
          )}
          {conceptStatus === "live" && perfData?.totals && (
            <span className="flex items-center gap-2 text-xs text-gray-600">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              {Math.round(perfData.totals.spend)} kr &middot;{" "}
              <span className={perfData.totals.roas >= 1 ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>
                {perfData.totals.roas}x
              </span>
              {" "}&middot; {perfData.totals.sales} sales
            </span>
          )}
          {/* Overflow menu */}
          <div ref={overflowMenuRef} className="relative">
            <button
              onClick={() => setShowOverflowMenu(!showOverflowMenu)}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="More actions"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {showOverflowMenu && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                {launchpad.priority === null ? (
                  <button onClick={() => { handleAddToLaunchpad(); setShowOverflowMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors">
                    <Rocket className="w-3.5 h-3.5" /> Add to Launch Pad
                  </button>
                ) : (
                  <button onClick={() => { handleRemoveFromLaunchpad(); setShowOverflowMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors">
                    <Rocket className="w-3.5 h-3.5" /> Remove from Launch Pad
                  </button>
                )}
                {sourceImages.length > 0 && (
                  <button onClick={() => { setShowIterateDialog(true); setShowOverflowMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors">
                    <GitBranch className="w-3.5 h-3.5" /> Iterate
                  </button>
                )}
                <button onClick={async () => { setProc(prev => ({ ...prev, refreshing: true })); await refreshJob(); setProc(prev => ({ ...prev, refreshing: false })); setShowOverflowMenu(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors">
                  <RefreshCw className={`w-3.5 h-3.5 ${proc.refreshing ? "animate-spin" : ""}`} /> Refresh
                </button>
                <div className="border-t border-gray-100 my-1" />
                <button onClick={() => { setConfirmDeleteConcept(true); setShowOverflowMenu(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Delete concept
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== Processing Banner (conditional) ===== */}
      {showRestartBanner && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="text-sm text-amber-700">Processing appears stalled.</span>
          </div>
          <button onClick={handleRestart}
            className="flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-800 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors">
            <RotateCcw className="w-3.5 h-3.5" /> Restart Now
          </button>
        </div>
      )}
      {(proc.processing || finishQueue.started) && !showRestartBanner && conceptStatus === "processing" && (() => {
        const imagesAllDone = totalCount > 0 && completedCount === totalCount;
        const procTranslatable = job.target_languages.filter((lang) => lang !== job.source_language);
        const copyDoneCount = procTranslatable.filter((lang) => copyTranslations[lang]?.status === "completed").length;
        const copyAllDone = procTranslatable.length === 0 || copyDoneCount === procTranslatable.length;
        const onlyCopyLeft = imagesAllDone && !copyAllDone;
        const onlyImagesLeft = copyAllDone && !imagesAllDone;

        const bannerLabel = onlyCopyLeft
          ? `Translating ad copy... (${copyDoneCount}/${procTranslatable.length})`
          : onlyImagesLeft
          ? `Processing ${completedCount}/${totalCount} images`
          : `Processing... (${completedCount}/${totalCount} images, ${copyDoneCount}/${procTranslatable.length} copy)`;

        const progress = onlyCopyLeft
          ? (procTranslatable.length > 0 ? (copyDoneCount / procTranslatable.length) * 100 : 0)
          : (totalCount > 0 ? (completedCount / totalCount) * 100 : 0);

        return (
          <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span className="text-sm font-medium text-indigo-700">
                  {bannerLabel}
                </span>
              </div>
              {proc.processing && (
                <button onClick={handleCancel} className="text-xs text-red-600 hover:text-red-700 font-medium">
                  Stop
                </button>
              )}
            </div>
            <div className="w-full h-1.5 bg-indigo-100 rounded-full overflow-hidden mb-2">
              <div className="bg-indigo-500 h-full transition-all duration-500 rounded-full"
                style={{ width: `${progress}%` }} />
            </div>
            <div className="flex gap-2">
              {(job.target_languages as Language[]).map((lang) => {
                const langInfo = LANGUAGES.find((l) => l.value === lang);
                const counts = langCounts.get(lang);
                const imgDone = counts ? counts.completed === counts.total : false;
                const copyDone = copyTranslations[lang]?.status === "completed";
                const allDone = imgDone && copyDone;
                return (
                  <span key={lang} className={`text-xs px-2 py-0.5 rounded-full ${allDone ? "bg-emerald-100 text-emerald-700" : "bg-white text-gray-500"}`}>
                    {langInfo?.flag} {counts?.completed ?? 0}/{counts?.total ?? 0}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Error banners */}
      {launchpad.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-sm text-red-700">{launchpad.error}</span>
          </div>
          <button onClick={() => setLaunchpad(prev => ({ ...prev, error: null }))} className="text-red-400 hover:text-red-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {finishQueue.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <span className="text-sm text-red-700">{finishQueue.error}</span>
        </div>
      )}

      {/* ===== Genesis image-bot static ads ===== */}
      {job.visual_direction && (
        <div className="mb-4">
          <GenesisStaticPanel jobId={job.id} onDone={() => refreshJob()} />
        </div>
      )}

      {/* ===== Images (hero section, always visible) ===== */}
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
        generateState={{
          ...genState,
          setCount: (n: number) => setGenState(prev => ({ ...prev, count: n })),
          setSelectedStyles: (styles: string[]) => setGenState(prev => ({ ...prev, selectedStyles: styles })),
          setSegmentId: (id: string | null) => setGenState(prev => ({ ...prev, segmentId: id })),
          segments: productSegments,
        }}
        handleGenerateStatic={handleGenerateStatic}
        hideStyleGenerator={true}
        handleCancelGenerate={handleCancelGenerate}
        onReroll={handleReroll}
        rerollingId={rerollingId}
        onToggleSkip={handleToggleSkip}
        handleGenerate9x16={handleGenerate9x16}
        show9x16Button={show9x16Button}
        count9x16={translationsPrimary.length}
        onDeleteImage={handleDeleteImage}
        isCompetitorSwipe={isCompetitorSwipe}
        competitorImageUrls={competitorImageUrls}
        variationState={{
          ...varState,
          setCount: (n: number) => setVarState(prev => ({ ...prev, count: n })),
        }}
        handleGenerateVariations={handleGenerateVariations}
        selectedRatio={selectedRatio}
        setSelectedRatio={setSelectedRatio}
      />

      {/* ===== Landing Page (compact row) ===== */}
      <div className="mt-6 bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Landing Page</span>
        </div>
        {landingPages.length > 0 ? (
          <>
            {(() => {
              const isNative = (job.cash_dna as { awareness_level?: string } | null)?.awareness_level === "Unaware" ||
                (job.tags ?? []).some((t: string) => t === "unaware" || t === "native");
              const hasAdvertorials = landingPages.some((p) => p.page_type === "advertorial");
              return isNative ? (
                <p className="text-xs text-amber-600 mb-1.5">
                  {hasAdvertorials
                    ? "Advertorial pages are recommended for native/unaware ads."
                    : "Tip: Native ads convert best with advertorial landing pages."}
                </p>
              ) : null;
            })()}
            <LandingPageModalTrigger
              landingPages={landingPages}
              selectedValue={metaPush.landingPageId}
              onSelect={(value) => handleWebsiteUrlChange(value)}
              conceptTags={job.tags ?? undefined}
              conceptAngle={(job.cash_dna as { angle?: string } | null)?.angle}
            />
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-400">No landing pages found for this product.</p>
            <a
              href="/pages"
              className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              Go to Pages to create or publish one
            </a>
          </div>
        )}
      </div>

      {/* ===== Ad Copy (collapsible) ===== */}
      <div className="mt-4" ref={adCopySectionRef}>
        <CollapsibleSection
          title="Ad Copy"
          icon={FileText}
          badge={
            adCopyHasPrimary ? (
              <span className={`text-xs px-2 py-0.5 rounded-full ${adCopyLangsDone === translatableLangsForBadge.length ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                {translatableLangsForBadge.length === 0 ? "primary" : `${adCopyLangsDone}/${translatableLangsForBadge.length} languages`}
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">Not started</span>
            )
          }
          expanded={expandedSections.has("adcopy")}
          onToggle={() => toggleSection("adcopy")}
        >
          <ConceptAdCopyStep
            job={job}
            metaPush={metaPush}
            copyTranslations={copyTranslations}
            copyState={copyState}
            handlePrimaryChange={handlePrimaryChange}
            handleHeadlineChange={handleHeadlineChange}
            handleTranslatedCopyChange={handleTranslatedCopyChange}
            addPrimaryText={addPrimaryText}
            removePrimaryText={removePrimaryText}
            addHeadline={addHeadline}
            removeHeadline={removeHeadline}
            handleTranslateCopy={handleTranslateCopy}
            handleApproveCopy={handleApproveCopy}
          />
        </CollapsibleSection>
      </div>

      {/* ===== Preview & Push (collapsible) ===== */}
      <div className="mt-4">
        <CollapsibleSection
          title="Preview & Push"
          icon={Eye}
          badge={
            deployments.length > 0 ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Pushed</span>
            ) : null
          }
          expanded={expandedSections.has("preview")}
          onToggle={() => toggleSection("preview")}
        >
          <ConceptPreviewStep
            job={job}
            copyTranslations={copyTranslations}
            metaPush={metaPush}
            deployments={deployments}
            previewData={previewData}
            onPushToMeta={handlePushToMeta}
          />
        </CollapsibleSection>
      </div>

      {/* ===== Performance (conditional, only when live) ===== */}
      {/* Show the "Live Performance" panel only if Meta has actually served
          the ads recently. `perfData.markets.length > 0` was the old check
          and it fired as soon as a concept was pushed, even for paused ad
          sets with zero impressions - see computeConceptStatus for details. */}
      {perfData && perfData.markets.some((m) => (m.metrics?.impressions ?? 0) > 0 || (m.metrics?.spend ?? 0) > 0) && (
        <div className="mt-4 border border-gray-200 rounded-xl bg-white overflow-hidden">
          <button
            onClick={() => setPerfExpanded(!perfExpanded)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <TrendingUp className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-800">Live Performance</span>
              {perfData.totals && (
                <span className="text-xs text-gray-400">
                  7d: {Math.round(perfData.totals.spend)} kr &middot;{" "}
                  <span className={perfData.totals.roas >= 1 ? "text-green-600 font-medium" : "text-red-500 font-medium"}>
                    {perfData.totals.roas}x ROAS
                  </span>
                  {" "}&middot; {perfData.totals.sales} sales
                </span>
              )}
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${perfExpanded ? "rotate-180" : ""}`} />
          </button>
          {perfExpanded && (
            <div className="border-t border-gray-100 px-5 py-3.5">
              <div className="grid gap-3">
                {perfData.markets.map((m) => {
                  const flag = m.market === "SE" ? "\u{1F1F8}\u{1F1EA}" : m.market === "NO" ? "\u{1F1F3}\u{1F1F4}" : m.market === "DK" ? "\u{1F1E9}\u{1F1F0}" : "";
                  return (
                    <div key={m.market} className="flex items-center gap-3">
                      <span className="text-sm">{flag} {m.market}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{m.stage}</span>
                      <span className="text-[11px] text-gray-400">{m.daysSincePush}d</span>
                      {m.metrics ? (
                        <div className="flex items-center gap-3 text-xs text-gray-600 ml-auto">
                          <span>{Math.round(m.metrics.spend)} kr</span>
                          <span className={m.metrics.roas >= 1 ? "text-green-600 font-medium" : "text-red-500 font-medium"}>
                            {m.metrics.roas}x
                          </span>
                          <span>{m.metrics.ctr}% CTR</span>
                          <span>{m.metrics.conversions} sales</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 ml-auto">No data yet</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== Details (collapsed by default) ===== */}
      <div className="mt-4">
        <CollapsibleSection
          title="Details"
          icon={Info}
          expanded={expandedSections.has("details")}
          onToggle={() => toggleSection("details")}
        >
          {/* Tags */}
          <div className="mb-5">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 block">Tags</label>
            <EditableTags entityId={job.id} entityType="image-job" initialTags={job.tags ?? []} />
          </div>
          {/* CASH DNA */}
          <div className="mb-5">
            <CashDnaEditor
              jobId={job.id}
              initialDna={job.cash_dna ?? null}
              hasAdCopy={(job.ad_copy_primary ?? []).some((t: string) => t.trim())}
            />
          </div>
          {/* Lineage */}
          {parentJob && (
            <div className="mb-3 flex items-center gap-1.5 text-xs text-gray-400">
              <GitBranch className="w-3 h-3" />
              <span>Iteration of</span>
              <Link href={`/images/${parentJob.id}`} className="text-indigo-500 hover:text-indigo-700 transition-colors font-medium">
                {parentJob.name}
              </Link>
              {job.iteration_type && (
                <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-medium">
                  {job.iteration_type.replace("_", " ")}
                </span>
              )}
            </div>
          )}
          {childJobs.length > 0 && (
            <div className="mb-3 flex items-center gap-1.5 text-xs text-gray-400 flex-wrap">
              <GitBranch className="w-3 h-3" />
              <span>Iterations:</span>
              {childJobs.map((child, i) => (
                <span key={child.id}>
                  <Link href={`/images/${child.id}`} className="text-indigo-500 hover:text-indigo-700 transition-colors">
                    {child.name}
                  </Link>
                  <span className="px-1 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-medium ml-0.5">
                    {child.iteration_type.replace("_", " ")}
                  </span>
                  {i < childJobs.length - 1 && <span className="mx-1">&middot;</span>}
                </span>
              ))}
            </div>
          )}
          {/* Linked pages */}
          {job.landing_page_id && (() => {
            const linkedPage = landingPages.find((p) => p.id === job.landing_page_id);
            if (!linkedPage) return null;
            return (
              <div className="mb-3 flex items-center gap-1.5 text-xs text-gray-400">
                <ExternalLink className="w-3 h-3" />
                <Link href={`/pages/${linkedPage.id}`} className="text-indigo-500 hover:text-indigo-700 transition-colors">
                  {linkedPage.name}
                </Link>
              </div>
            );
          })()}
          {/* Metadata */}
          <div className="text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
            {job.total_images ?? job.source_images?.length ?? 0} images &times;{" "}
            {job.target_languages.length} languages
            {job.target_ratios && job.target_ratios.length > 1 && (
              <> &times; {job.target_ratios.length} ratios</>
            )}
            {job.source && <> &middot; Source: {job.source}</>}
          </div>
        </CollapsibleSection>
      </div>

      {/* ===== Modals ===== */}
      {showIterateDialog && (
        <SmartIterateModal
          job={job}
          market={iterateMarket}
          performanceContext={iteratePerf}
          onClose={() => setShowIterateDialog(false)}
        />
      )}
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
            onReroll={previewImage.generation_style ? handleReroll : undefined}
            rerollingId={rerollingId}
            onPrev={currentIdx > 0 ? () => { setPreviewImage(allImages[currentIdx - 1]); setPreviewLang(null); } : undefined}
            onNext={currentIdx < allImages.length - 1 ? () => { setPreviewImage(allImages[currentIdx + 1]); setPreviewLang(null); } : undefined}
            currentIndex={currentIdx}
            totalCount={allImages.length}
          />
        );
      })()}
      <ConfirmDialog
        open={confirmDeleteConcept}
        title="Delete concept"
        message="Delete this concept and all its images and translations? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteConcept}
        onCancel={() => setConfirmDeleteConcept(false)}
      />
    </div>
  );
}

