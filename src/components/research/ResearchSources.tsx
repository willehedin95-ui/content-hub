"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Pause,
  Play,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Trash2,
  Upload,
  FileText,
  X,
  Loader2,
  Pencil,
  Check,
  RefreshCw,
  ArrowDownToLine,
  ChevronDown,
  Database,
  Info,
} from "lucide-react";
import {
  SiTrustpilot,
  SiReddit,
  SiFacebook,
  SiInstagram,
  SiTiktok,
} from "react-icons/si";
import { FaAmazon } from "react-icons/fa";

interface Source {
  id: string;
  name: string;
  domain: string;
  platform: string;
  config: Record<string, string> | null;
  is_own_brand: boolean;
  language: string | null;
  last_scanned_at: string | null;
  last_review_date: string | null;
  total_reviews_fetched: number;
  status: string;
  error_message: string | null;
}

type AddPlatform = "trustpilot" | "reddit" | "amazon" | "apify_instagram" | "apify_facebook" | "apify_tiktok" | "manual_import";

const PLATFORM_OPTIONS: { value: AddPlatform; label: string; icon: React.ReactNode; description: string }[] = [
  { value: "trustpilot", label: "Trustpilot", icon: <SiTrustpilot className="w-5 h-5 text-[#00B67A]" />, description: "Auto-scanned daily for new reviews" },
  { value: "reddit", label: "Reddit", icon: <SiReddit className="w-5 h-5 text-[#FF4500]" />, description: "Subreddits and search queries" },
  { value: "amazon", label: "Amazon", icon: <FaAmazon className="w-5 h-5 text-[#FF9900]" />, description: "Product reviews (scanned once)" },
  { value: "apify_instagram", label: "Instagram", icon: <SiInstagram className="w-5 h-5 text-[#E4405F]" />, description: "Post & reel comments" },
  { value: "apify_facebook", label: "Facebook", icon: <SiFacebook className="w-5 h-5 text-[#1877F2]" />, description: "Page post comments" },
  { value: "apify_tiktok", label: "TikTok", icon: <SiTiktok className="w-5 h-5" />, description: "Video comments" },
  { value: "manual_import", label: "Manual", icon: <FileText className="w-5 h-5 text-emerald-600" />, description: "Paste your own research text" },
];

const AMAZON_MARKETPLACES = [
  { value: "us", label: "Amazon.com (US)" },
  { value: "se", label: "Amazon.se (Sweden)" },
  { value: "de", label: "Amazon.de (Germany)" },
  { value: "uk", label: "Amazon.co.uk (UK)" },
];

export default function ResearchSources() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);

  // Unified add form
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [addPlatform, setAddPlatform] = useState<AddPlatform | null>(null);
  const [addName, setAddName] = useState("");
  const [addDomain, setAddDomain] = useState("");
  const [addMarketplace, setAddMarketplace] = useState("us");
  const [adding, setAdding] = useState(false);
  const [fetchingAmazonName, setFetchingAmazonName] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Source | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Upload state
  const [uploadTarget, setUploadTarget] = useState<Source | null>(null);
  const [uploadText, setUploadText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    chunks_found: number;
    nuggets_created: number;
    skipped: number;
    errors: number;
  } | null>(null);

  // Scan state
  const [scanningIds, setScanningIds] = useState<Set<string>>(new Set());
  const [scanResults, setScanResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch("/api/research/sources");
      const data = await res.json();
      setSources(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to fetch sources:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const scanSource = async (source: Source, deep = false) => {
    setScanningIds((prev) => new Set(prev).add(source.id));
    setScanResults((prev) => {
      const next = { ...prev };
      delete next[source.id];
      return next;
    });
    try {
      const url = `/api/research/sources/${source.id}/scan${deep ? "?deep=true" : ""}`;
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setScanResults((prev) => ({
          ...prev,
          [source.id]: { ok: false, msg: data.error ?? "Scan failed" },
        }));
      } else {
        setScanResults((prev) => ({
          ...prev,
          [source.id]: {
            ok: true,
            msg: `${data.reviewsScraped} scraped, ${data.nuggetsStored} nuggets`,
          },
        }));
        await fetchSources();
      }
    } catch {
      setScanResults((prev) => ({
        ...prev,
        [source.id]: { ok: false, msg: "Network error" },
      }));
    } finally {
      setScanningIds((prev) => {
        const next = new Set(prev);
        next.delete(source.id);
        return next;
      });
    }
  };

  const addSource = async () => {
    if (!addPlatform || !addName.trim()) return;
    if (addPlatform !== "manual_import" && !addDomain.trim()) return;
    setAdding(true);
    try {
      const body: Record<string, unknown> = {
        name: addName.trim(),
        platform: addPlatform,
        domain: addDomain.trim() || undefined,
      };
      if (addPlatform === "amazon") {
        body.config = { marketplace: addMarketplace };
      }
      if (addPlatform.startsWith("apify_")) {
        body.config = { urls: addDomain.trim() };
      }
      const res = await fetch("/api/research/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const newSource = await res.json();
        resetAddForm();
        await fetchSources();
        // Auto-trigger one-time scan for Amazon
        if (addPlatform === "amazon" && newSource?.id) {
          scanSource(newSource as Source);
        }
      }
    } catch (e) {
      console.error("Failed to add source:", e);
    } finally {
      setAdding(false);
    }
  };

  const resetAddForm = () => {
    setShowAddPicker(false);
    setAddPlatform(null);
    setAddName("");
    setAddDomain("");
    setAddMarketplace("us");
  };

  const fetchAmazonProductName = async (input: string, mp: string) => {
    if (!input.trim()) return;
    setFetchingAmazonName(true);
    try {
      const res = await fetch(
        `/api/research/sources/amazon-info?asin=${encodeURIComponent(input.trim())}&marketplace=${mp}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.title && !addName.trim()) {
          setAddName(data.title.slice(0, 80));
        }
      }
    } catch {
      // Non-critical
    } finally {
      setFetchingAmazonName(false);
    }
  };

  const toggleSource = async (source: Source) => {
    const newStatus = source.status === "active" ? "paused" : "active";
    try {
      await fetch("/api/research/sources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: source.id, status: newStatus }),
      });
      await fetchSources();
    } catch (e) {
      console.error("Failed to toggle source:", e);
    }
  };

  const deleteSource = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/research/sources", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      if (res.ok) {
        setDeleteTarget(null);
        await fetchSources();
      }
    } catch (e) {
      console.error("Failed to delete source:", e);
    } finally {
      setDeleting(false);
    }
  };

  const renameSource = async (sourceId: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      await fetch("/api/research/sources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sourceId, name: newName.trim() }),
      });
      await fetchSources();
    } catch (e) {
      console.error("Failed to rename source:", e);
    }
  };

  const uploadContent = async () => {
    if (!uploadTarget || !uploadText.trim()) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const res = await fetch("/api/research/sources/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_id: uploadTarget.id,
          content: uploadText.trim(),
        }),
      });
      if (res.ok) {
        const result = await res.json();
        setUploadResult(result);
        setUploadText("");
        await fetchSources();
      }
    } catch (e) {
      console.error("Failed to upload content:", e);
    } finally {
      setUploading(false);
    }
  };

  // Group sources by platform for display
  const activeSources = sources.filter((s) => s.platform !== "facebook_group" || sources.some((x) => x.platform === "facebook_group"));
  const hasSources = sources.length > 0;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-5 h-5 bg-gray-200 rounded" />
              <div className="h-4 bg-gray-200 rounded w-32" />
              <div className="ml-auto h-4 bg-gray-200 rounded w-20" />
            </div>
            <div className="h-3 bg-gray-100 rounded w-48" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add Source CTA */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {hasSources
            ? `${sources.length} source${sources.length !== 1 ? "s" : ""} configured. Active sources are scanned daily.`
            : "Add sources to start collecting customer intelligence."}
        </p>
        <button
          onClick={() => setShowAddPicker(!showAddPicker)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" />
          Add Source
        </button>
      </div>

      {/* Unified Add Source picker */}
      {showAddPicker && !addPlatform && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Choose a platform</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PLATFORM_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setAddPlatform(opt.value)}
                className="flex items-center gap-2.5 p-3 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-left"
              >
                {opt.icon}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">{opt.label}</div>
                  <div className="text-xs text-gray-500 truncate">{opt.description}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="flex justify-end mt-3">
            <button
              onClick={resetAddForm}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add Source form (after platform is selected) */}
      {addPlatform && (
        <div className="bg-white border border-indigo-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            {PLATFORM_OPTIONS.find((p) => p.value === addPlatform)?.icon}
            <h3 className="text-sm font-medium text-gray-900">
              Add {PLATFORM_OPTIONS.find((p) => p.value === addPlatform)?.label} Source
            </h3>
          </div>

          <div className={`grid gap-3 ${addPlatform === "amazon" ? "grid-cols-3" : addPlatform === "manual_import" ? "grid-cols-1" : "grid-cols-2"}`}>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Display name</label>
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder={
                  addPlatform === "trustpilot" ? "e.g. Oslo Skin Lab SE" :
                  addPlatform === "reddit" ? 'e.g. "Skincare Addiction"' :
                  addPlatform === "amazon" ? 'e.g. "Competitor Collagen"' :
                  addPlatform === "manual_import" ? 'e.g. "Customer Interview Notes"' :
                  "Source name"
                }
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              />
            </div>

            {addPlatform !== "manual_import" && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {addPlatform === "trustpilot" ? "Trustpilot domain" :
                   addPlatform === "reddit" ? "Subreddit or search query" :
                   addPlatform === "amazon" ? "ASIN or Amazon URL" :
                   "URL(s) — comma-separated"}
                </label>
                <input
                  type="text"
                  value={addDomain}
                  onChange={(e) => setAddDomain(e.target.value)}
                  onBlur={() => {
                    if (addPlatform === "amazon" && addDomain.trim() && !addName.trim()) {
                      fetchAmazonProductName(addDomain, addMarketplace);
                    }
                  }}
                  placeholder={
                    addPlatform === "trustpilot" ? "e.g. osloskinlab.se" :
                    addPlatform === "reddit" ? 'e.g. "SkincareAddiction"' :
                    addPlatform === "amazon" ? "e.g. B0XXXXXX or full URL" :
                    "https://..."
                  }
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                />
                {addPlatform === "reddit" && (
                  <p className="text-xs text-gray-400 mt-1">Subreddit name (without r/) or a search query with spaces</p>
                )}
                {fetchingAmazonName && (
                  <p className="text-xs text-indigo-500 mt-1 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Fetching product name...
                  </p>
                )}
              </div>
            )}

            {addPlatform === "amazon" && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Marketplace</label>
                <select
                  value={addMarketplace}
                  onChange={(e) => setAddMarketplace(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                >
                  {AMAZON_MARKETPLACES.map((mp) => (
                    <option key={mp.value} value={mp.value}>{mp.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {addPlatform.startsWith("apify_") && (
            <p className="text-xs text-gray-400 mt-2">
              Requires APIFY_TOKEN env var. Costs per 1K items: Instagram ~$2.30, Facebook ~$0.50, TikTok ~$5.00
            </p>
          )}

          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={resetAddForm}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={addSource}
              disabled={adding || !addName.trim() || (addPlatform !== "manual_import" && !addDomain.trim())}
              className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {adding ? "Adding..." : "Add"}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasSources && !showAddPicker && (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-lg">
          <Database className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-1">No sources configured yet.</p>
          <p className="text-sm text-gray-400 mb-4">
            Add Trustpilot pages, Reddit threads, Amazon products, or social media to start collecting customer intelligence automatically.
          </p>
          <button
            onClick={() => setShowAddPicker(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" />
            Add Your First Source
          </button>
        </div>
      )}

      {/* Unified source table */}
      {hasSources && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Source</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Platform</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Nuggets</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Last Scan</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="w-36"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeSources.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <SourcePlatformIcon platform={s.platform} />
                      <EditableName
                        name={s.name}
                        onSave={(name) => renameSource(s.id, name)}
                      />
                      {s.is_own_brand && (
                        <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">Own</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {getDomainDisplay(s) ? (
                      <a
                        href={getDomainLink(s)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-600 hover:text-indigo-600 flex items-center gap-1 text-xs"
                      >
                        {getDomainDisplay(s)}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">{getPlatformLabel(s.platform)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">
                    {s.total_reviews_fetched}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {s.last_scanned_at
                      ? new Date(s.last_scanned_at).toLocaleDateString()
                      : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    {s.status === "active" && (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700">
                        <CheckCircle className="w-3 h-3" /> Active
                      </span>
                    )}
                    {s.status === "paused" && (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                        <Pause className="w-3 h-3" /> Paused
                      </span>
                    )}
                    {s.status === "error" && (
                      <div>
                        <span className="inline-flex items-center gap-1 text-xs text-red-600">
                          <AlertCircle className="w-3 h-3" /> Error
                        </span>
                        {s.error_message && (
                          <p className="text-xs text-red-500 mt-0.5 truncate max-w-[140px]" title={s.error_message}>
                            {s.error_message}
                          </p>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {/* Scan buttons (not for manual/facebook_group) */}
                      {s.platform !== "manual_import" && s.platform !== "facebook_group" && (
                        <ScanButton
                          source={s}
                          scanning={scanningIds.has(s.id)}
                          onScan={scanSource}
                        />
                      )}
                      {/* Upload button for manual & facebook_group */}
                      {(s.platform === "manual_import" || s.platform === "facebook_group") && (
                        <button
                          onClick={() => {
                            setUploadTarget(s);
                            setUploadText("");
                            setUploadResult(null);
                          }}
                          className="p-1 text-indigo-400 hover:text-indigo-700"
                          title="Upload content"
                        >
                          <Upload className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => toggleSource(s)}
                        className="p-1 text-gray-400 hover:text-gray-700"
                        title={s.status === "active" ? "Pause scanning" : "Resume scanning"}
                      >
                        {s.status === "active" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(s)}
                        className="p-1 text-gray-400 hover:text-red-600"
                        title="Delete source and all nuggets"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {scanResults[s.id] && (
                      <div className={`text-xs mt-1 text-right ${scanResults[s.id].ok ? "text-green-600" : "text-red-600"}`}>
                        {scanResults[s.id].msg}
                        {!scanResults[s.id].ok && (
                          <button
                            onClick={() => scanSource(s)}
                            className="ml-1 text-indigo-500 hover:text-indigo-700 underline"
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Facebook Groups help text */}
      {sources.some((s) => s.platform === "facebook_group") && (
        <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-400" />
          <p>
            Facebook Group sources are imported via the Chrome extension or manual paste. They are not auto-scanned.
            Use the upload button to add new content from group discussions.
          </p>
        </div>
      )}

      {/* ===== DELETE CONFIRMATION MODAL ===== */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Delete &ldquo;{deleteTarget.name}&rdquo;?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently remove this source and all{" "}
              <strong>{deleteTarget.total_reviews_fetched}</strong> research
              nuggets associated with it. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={deleteSource}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== UPLOAD CONTENT MODAL ===== */}
      {uploadTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Upload to &ldquo;{uploadTarget.name}&rdquo;
              </h3>
              <button
                onClick={() => {
                  setUploadTarget(null);
                  setUploadResult(null);
                }}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {uploadResult ? (
              <div className="space-y-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-emerald-800 mb-1">Upload complete</p>
                  <ul className="text-sm text-emerald-700 space-y-0.5">
                    <li>{uploadResult.chunks_found} text chunks found</li>
                    <li>{uploadResult.nuggets_created} nuggets created (significance 4+)</li>
                    <li>{uploadResult.skipped} below threshold</li>
                    {uploadResult.errors > 0 && (
                      <li className="text-red-600">{uploadResult.errors} errors</li>
                    )}
                  </ul>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setUploadResult(null)}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Upload More
                  </button>
                  <button
                    onClick={() => { setUploadTarget(null); setUploadResult(null); }}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-3">
                  Paste research text below. Each paragraph becomes a separate chunk, evaluated by AI for significance. Only insights scoring 4+ are stored.
                </p>
                <textarea
                  value={uploadText}
                  onChange={(e) => setUploadText(e.target.value)}
                  placeholder="Paste customer reviews, forum posts, interview notes, VOC data..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-64 resize-y"
                  disabled={uploading}
                />
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-gray-400">
                    {uploadText.trim()
                      ? `~${uploadText.trim().split(/\n\s*\n/).filter((p) => p.trim().length >= 15).length} chunks`
                      : ""}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setUploadTarget(null); setUploadResult(null); }}
                      disabled={uploading}
                      className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={uploadContent}
                      disabled={uploading || !uploadText.trim()}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {uploading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Evaluating...</>
                      ) : (
                        <><Upload className="w-4 h-4" /> Upload & Evaluate</>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Scan button with dropdown for deep scan */
function ScanButton({
  source,
  scanning,
  onScan,
}: {
  source: Source;
  scanning: boolean;
  onScan: (s: Source, deep?: boolean) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="relative">
      <div className="inline-flex items-center">
        <button
          onClick={() => onScan(source)}
          disabled={scanning}
          className="p-1 text-indigo-400 hover:text-indigo-700 disabled:opacity-50"
          title="Scan for new reviews"
        >
          <RefreshCw className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} />
        </button>
        <button
          onClick={() => setShowMenu(!showMenu)}
          disabled={scanning}
          className="p-0.5 text-gray-300 hover:text-gray-500 disabled:opacity-50"
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
      {showMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-44">
            <button
              onClick={() => { onScan(source); setShowMenu(false); }}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Scan new reviews
            </button>
            <button
              onClick={() => { onScan(source, true); setShowMenu(false); }}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <ArrowDownToLine className="w-3.5 h-3.5" />
              Deep scan (all reviews)
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Inline editable name component */
function EditableName({ name, onSave }: { name: string; onSave: (newName: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  if (!editing) {
    return (
      <button
        onClick={() => { setValue(name); setEditing(true); }}
        className="group flex items-center gap-1 font-medium text-gray-900 hover:text-indigo-600"
        title="Click to rename"
      >
        {name}
        <Pencil className="w-3 h-3 text-gray-300 group-hover:text-indigo-400" />
      </button>
    );
  }

  const save = () => {
    if (value.trim() && value.trim() !== name) onSave(value.trim());
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        autoFocus
        className="border border-indigo-300 rounded px-2 py-0.5 text-sm font-medium w-48 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <button onClick={save} className="p-0.5 text-green-600 hover:text-green-700" title="Save">
        <Check className="w-4 h-4" />
      </button>
      <button onClick={() => setEditing(false)} className="p-0.5 text-gray-400 hover:text-gray-600" title="Cancel">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

/** Platform icon for source table */
function SourcePlatformIcon({ platform }: { platform: string }) {
  switch (platform) {
    case "trustpilot": return <SiTrustpilot className="w-4 h-4 text-[#00B67A] flex-shrink-0" />;
    case "reddit": return <SiReddit className="w-4 h-4 text-[#FF4500] flex-shrink-0" />;
    case "amazon": return <FaAmazon className="w-4 h-4 text-[#FF9900] flex-shrink-0" />;
    case "apify_instagram": return <SiInstagram className="w-4 h-4 text-[#E4405F] flex-shrink-0" />;
    case "apify_facebook":
    case "facebook_group": return <SiFacebook className="w-4 h-4 text-[#1877F2] flex-shrink-0" />;
    case "apify_tiktok": return <SiTiktok className="w-4 h-4 flex-shrink-0" />;
    case "manual_import": return <FileText className="w-4 h-4 text-emerald-600 flex-shrink-0" />;
    default: return null;
  }
}

function getPlatformLabel(platform: string): string {
  return PLATFORM_OPTIONS.find((p) => p.value === platform)?.label ?? platform;
}

function getDomainDisplay(s: Source): string {
  if (s.platform === "manual_import") return "";
  if (s.platform === "reddit") return s.domain.includes(" ") ? `search: ${s.domain}` : `r/${s.domain}`;
  if (s.platform.startsWith("apify_")) return s.domain.length > 40 ? s.domain.slice(0, 37) + "..." : s.domain;
  if (s.platform === "amazon") {
    const mp = s.config?.marketplace ?? "se";
    return `${s.domain} (${mp.toUpperCase()})`;
  }
  return s.domain;
}

function getDomainLink(s: Source): string {
  if (s.platform === "trustpilot") return `https://www.trustpilot.com/review/${s.domain}`;
  if (s.platform === "reddit") {
    return s.domain.includes(" ")
      ? `https://www.reddit.com/search/?q=${encodeURIComponent(s.domain)}`
      : `https://www.reddit.com/r/${s.domain}`;
  }
  if (s.platform === "amazon") {
    const mp = s.config?.marketplace ?? "se";
    const domains: Record<string, string> = { se: "www.amazon.se", de: "www.amazon.de", uk: "www.amazon.co.uk", us: "www.amazon.com" };
    return `https://${domains[mp] ?? domains.se}/dp/${s.domain}`;
  }
  // Apify sources — domain is the URL
  if (s.domain.startsWith("http")) return s.domain;
  return "#";
}
