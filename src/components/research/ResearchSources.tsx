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
} from "lucide-react";

interface Source {
  id: string;
  name: string;
  domain: string;
  platform: string;
  is_own_brand: boolean;
  language: string | null;
  last_scanned_at: string | null;
  last_review_date: string | null;
  total_reviews_fetched: number;
  status: string;
  error_message: string | null;
}

export default function ResearchSources() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);

  // Trustpilot add form
  const [showAddTrustpilot, setShowAddTrustpilot] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  // Manual source add form
  const [showAddManual, setShowAddManual] = useState(false);
  const [manualName, setManualName] = useState("");
  const [addingManual, setAddingManual] = useState(false);

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

  const trustpilotSources = sources.filter(
    (s) => s.platform === "trustpilot"
  );
  const manualSources = sources.filter(
    (s) => s.platform === "manual_import"
  );

  const addTrustpilotSource = async () => {
    if (!newDomain.trim() || !newName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/research/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: newDomain.trim(),
          name: newName.trim(),
        }),
      });
      if (res.ok) {
        setNewDomain("");
        setNewName("");
        setShowAddTrustpilot(false);
        await fetchSources();
      }
    } catch (e) {
      console.error("Failed to add source:", e);
    } finally {
      setAdding(false);
    }
  };

  const addManualSource = async () => {
    if (!manualName.trim()) return;
    setAddingManual(true);
    try {
      const res = await fetch("/api/research/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: manualName.trim(),
          platform: "manual_import",
        }),
      });
      if (res.ok) {
        setManualName("");
        setShowAddManual(false);
        await fetchSources();
      }
    } catch (e) {
      console.error("Failed to add manual source:", e);
    } finally {
      setAddingManual(false);
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

  if (loading) {
    return <div className="text-center text-gray-400 py-12">Loading...</div>;
  }

  return (
    <div className="space-y-8">
      {/* ===== TRUSTPILOT SOURCES ===== */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Trustpilot Sources
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Auto-scanned daily for new reviews
            </p>
          </div>
          <button
            onClick={() => setShowAddTrustpilot(!showAddTrustpilot)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" />
            Add Trustpilot Source
          </button>
        </div>

        {showAddTrustpilot && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Display name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Oslo Skin Lab SE"
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Trustpilot domain
                </label>
                <input
                  type="text"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  placeholder="e.g. osloskinlab.se"
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setShowAddTrustpilot(false)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={addTrustpilotSource}
                disabled={adding || !newDomain.trim() || !newName.trim()}
                className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                {adding ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
        )}

        {trustpilotSources.length === 0 ? (
          <div className="text-center text-gray-400 py-8 bg-white border border-gray-200 rounded-lg">
            No Trustpilot sources. Add a domain to start scanning reviews.
          </div>
        ) : (
          <SourceTable
            sources={trustpilotSources}
            onToggle={toggleSource}
            onDelete={setDeleteTarget}
            showDomainLink
          />
        )}
      </section>

      {/* ===== MANUAL RESEARCH ===== */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Manual Research
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Upload your own VOC docs, forum posts, or free text
            </p>
          </div>
          <button
            onClick={() => setShowAddManual(!showAddManual)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4" />
            Add Manual Source
          </button>
        </div>

        {showAddManual && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Source name
              </label>
              <input
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder='e.g. "Forum Research Q1" or "Customer Interview Notes"'
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setShowAddManual(false)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={addManualSource}
                disabled={addingManual || !manualName.trim()}
                className="px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700 disabled:opacity-50"
              >
                {addingManual ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        )}

        {manualSources.length === 0 ? (
          <div className="text-center text-gray-400 py-8 bg-white border border-gray-200 rounded-lg">
            No manual sources. Create one to upload your own research.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">
                    Source
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">
                    Nuggets
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">
                    Last Upload
                  </th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {manualSources.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-500" />
                        <span className="font-medium text-gray-900">
                          {s.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      {s.total_reviews_fetched}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {s.last_scanned_at
                        ? new Date(s.last_scanned_at).toLocaleDateString()
                        : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => {
                            setUploadTarget(s);
                            setUploadText("");
                            setUploadResult(null);
                          }}
                          className="p-1 text-emerald-500 hover:text-emerald-700"
                          title="Upload content"
                        >
                          <Upload className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(s)}
                          className="p-1 text-gray-400 hover:text-red-600"
                          title="Delete source and all nuggets"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
                  <p className="text-sm font-medium text-emerald-800 mb-1">
                    Upload complete
                  </p>
                  <ul className="text-sm text-emerald-700 space-y-0.5">
                    <li>
                      {uploadResult.chunks_found} text chunks found
                    </li>
                    <li>
                      {uploadResult.nuggets_created} nuggets created
                      (significance 4+)
                    </li>
                    <li>
                      {uploadResult.skipped} below threshold
                    </li>
                    {uploadResult.errors > 0 && (
                      <li className="text-red-600">
                        {uploadResult.errors} errors
                      </li>
                    )}
                  </ul>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setUploadResult(null);
                    }}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Upload More
                  </button>
                  <button
                    onClick={() => {
                      setUploadTarget(null);
                      setUploadResult(null);
                    }}
                    className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-3">
                  Paste research text below. Each paragraph becomes a separate
                  chunk, evaluated by AI for significance. Only insights scoring
                  4+ are stored.
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
                      onClick={() => {
                        setUploadTarget(null);
                        setUploadResult(null);
                      }}
                      disabled={uploading}
                      className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={uploadContent}
                      disabled={uploading || !uploadText.trim()}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Evaluating...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Upload & Evaluate
                        </>
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

/** Reusable source table for Trustpilot sources */
function SourceTable({
  sources,
  onToggle,
  onDelete,
  showDomainLink,
}: {
  sources: Source[];
  onToggle: (s: Source) => void;
  onDelete: (s: Source) => void;
  showDomainLink?: boolean;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">
              Source
            </th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">
              Domain
            </th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">
              Reviews
            </th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">
              Last Scan
            </th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">
              Status
            </th>
            <th className="w-20"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sources.map((s) => (
            <tr key={s.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{s.name}</span>
                  {s.is_own_brand && (
                    <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">
                      Own
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                {showDomainLink ? (
                  <a
                    href={`https://www.trustpilot.com/review/${s.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-600 hover:text-indigo-600 flex items-center gap-1"
                  >
                    {s.domain}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-gray-600">{s.domain}</span>
                )}
              </td>
              <td className="px-4 py-3 text-right font-mono text-gray-700">
                {s.total_reviews_fetched}
              </td>
              <td className="px-4 py-3 text-gray-500">
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
                  <span
                    className="inline-flex items-center gap-1 text-xs text-red-600"
                    title={s.error_message ?? ""}
                  >
                    <AlertCircle className="w-3 h-3" /> Error
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1 justify-end">
                  <button
                    onClick={() => onToggle(s)}
                    className="p-1 text-gray-400 hover:text-gray-700"
                    title={
                      s.status === "active"
                        ? "Pause scanning"
                        : "Resume scanning"
                    }
                  >
                    {s.status === "active" ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => onDelete(s)}
                    className="p-1 text-gray-400 hover:text-red-600"
                    title="Delete source and all nuggets"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
