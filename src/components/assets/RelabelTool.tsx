"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  RefreshCw,
  Tag,
  X,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type Product, type Asset } from "@/types";
import { useProducts } from "@/hooks/useProducts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type JobStatus = "queued" | "uploading" | "generating" | "done" | "error";

interface RelabelJob {
  id: string;
  fileName: string;
  /** Local object URL (preview) until uploaded, then the public temp URL */
  sourcePreview: string;
  sourceFile: File | null;
  sourceUrl: string | null;
  status: JobStatus;
  resultUrl: string | null;
  error: string | null;
  saved: boolean;
  saving: boolean;
}

interface RelabelSettings {
  reference_url?: string;
  text_spec?: string;
}

interface Props {
  onAssetCreated?: (asset: Asset) => void;
}

// How many jobs generate at the same time. Each generation takes 60-120s on
// nano-banana-pro 2K, so 2 keeps a batch moving without hammering Kie.
const CONCURRENCY = 2;

let jobCounter = 0;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RelabelTool({ onAssetCreated }: Props) {
  const products = useProducts();

  // Reference settings (persisted per workspace)
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [textSpec, setTextSpec] = useState("");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingRef, setUploadingRef] = useState(false);
  const refInputRef = useRef<HTMLInputElement>(null);

  // Job queue
  const [jobs, setJobs] = useState<RelabelJob[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saveProduct, setSaveProduct] = useState<Product | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const runningRef = useRef(0);
  const jobsRef = useRef<RelabelJob[]>([]);
  jobsRef.current = jobs;

  // Load persisted reference settings
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((settings) => {
        const relabel = (settings?.relabel ?? {}) as RelabelSettings;
        if (relabel.reference_url) setReferenceUrl(relabel.reference_url);
        if (relabel.text_spec) setTextSpec(relabel.text_spec);
        // Open settings automatically when no reference is configured yet
        if (!relabel.reference_url) setSettingsOpen(true);
      })
      .catch(() => {})
      .finally(() => setSettingsLoaded(true));
  }, []);

  const persistSettings = useCallback(
    async (next: RelabelSettings) => {
      setSavingSettings(true);
      try {
        await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ relabel: next }),
        });
      } finally {
        setSavingSettings(false);
      }
    },
    []
  );

  const handleReferenceUpload = useCallback(
    async (file: File) => {
      setError(null);
      setUploadingRef(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload-temp", { method: "POST", body: formData });
        if (!res.ok) throw new Error("Failed to upload reference image");
        const { url } = await res.json();
        setReferenceUrl(url);
        await persistSettings({ reference_url: url, text_spec: textSpec });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Reference upload failed");
      } finally {
        setUploadingRef(false);
      }
    },
    [persistSettings, textSpec]
  );

  const handleSaveTextSpec = useCallback(async () => {
    if (!referenceUrl) return;
    await persistSettings({ reference_url: referenceUrl, text_spec: textSpec });
  }, [persistSettings, referenceUrl, textSpec]);

  // ------------------------------------------------------------------
  // Queue processing
  // ------------------------------------------------------------------

  const updateJob = useCallback((id: string, patch: Partial<RelabelJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const runJob = useCallback(
    async (job: RelabelJob) => {
      try {
        let sourceUrl = job.sourceUrl;

        if (!sourceUrl && job.sourceFile) {
          updateJob(job.id, { status: "uploading" });
          const formData = new FormData();
          formData.append("file", job.sourceFile);
          const uploadRes = await fetch("/api/upload-temp", { method: "POST", body: formData });
          if (!uploadRes.ok) throw new Error("Failed to upload image");
          const { url } = await uploadRes.json();
          sourceUrl = url;
          updateJob(job.id, { sourceUrl: url });
        }

        if (!sourceUrl) throw new Error("No source image");

        updateJob(job.id, { status: "generating" });

        const res = await fetch("/api/assets/relabel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: sourceUrl,
            notes: notes.trim() || undefined,
          }),
        });

        if (!res.ok || !res.body) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || "Generation request failed");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let resultUrl: string | null = null;
        let streamError: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line);
              if (event.step === "completed" && event.image_url) {
                resultUrl = event.image_url;
              } else if (event.step === "error") {
                streamError = event.message || "Generation failed";
              }
            } catch {
              // ignore malformed lines
            }
          }
        }

        if (streamError) throw new Error(streamError);
        if (!resultUrl) throw new Error("No image generated");

        updateJob(job.id, { status: "done", resultUrl });
      } catch (err) {
        updateJob(job.id, {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        runningRef.current -= 1;
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        pumpQueue();
      }
    },
    [notes, updateJob]
  );

  const pumpQueue = useCallback(() => {
    while (runningRef.current < CONCURRENCY) {
      const next = jobsRef.current.find((j) => j.status === "queued");
      if (!next) return;
      runningRef.current += 1;
      // Mark synchronously in the ref-backed state so we don't double-pick
      updateJob(next.id, { status: next.sourceFile && !next.sourceUrl ? "uploading" : "generating" });
      jobsRef.current = jobsRef.current.map((j) =>
        j.id === next.id ? { ...j, status: "uploading" as JobStatus } : j
      );
      void runJob(next);
    }
  }, [runJob, updateJob]);

  const enqueueFiles = useCallback(
    (files: File[]) => {
      if (!referenceUrl) {
        setError("Upload a label reference first (open Reference settings).");
        setSettingsOpen(true);
        return;
      }
      setError(null);
      const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
      const newJobs: RelabelJob[] = [];
      for (const file of files) {
        if (!validTypes.includes(file.type)) continue;
        newJobs.push({
          id: `relabel-${Date.now()}-${jobCounter++}`,
          fileName: file.name,
          sourcePreview: URL.createObjectURL(file),
          sourceFile: file,
          sourceUrl: null,
          status: "queued",
          resultUrl: null,
          error: null,
          saved: false,
          saving: false,
        });
      }
      if (newJobs.length === 0) {
        setError("Please upload JPG, PNG, or WebP images.");
        return;
      }
      setJobs((prev) => [...prev, ...newJobs]);
      // Let state settle before pumping
      setTimeout(pumpQueue, 0);
    },
    [pumpQueue, referenceUrl]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      enqueueFiles(Array.from(e.dataTransfer.files));
    },
    [enqueueFiles]
  );

  // Global clipboard paste with image data
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        enqueueFiles(files);
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [enqueueFiles]);

  const handleRegenerate = useCallback(
    (id: string) => {
      const job = jobsRef.current.find((j) => j.id === id);
      if (!job) return;
      updateJob(id, { status: "queued", resultUrl: null, error: null, saved: false });
      setTimeout(pumpQueue, 0);
    },
    [pumpQueue, updateJob]
  );

  const handleRemove = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const handleSave = useCallback(
    async (id: string) => {
      const job = jobsRef.current.find((j) => j.id === id);
      if (!job?.resultUrl || job.saving || job.saved) return;
      updateJob(id, { saving: true });
      try {
        const baseName = job.fileName.replace(/\.[^.]+$/, "");
        const res = await fetch("/api/assets/import-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: job.resultUrl,
            name: `${baseName} - relabeled`,
            category: "product",
            product: saveProduct || undefined,
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || "Failed to save asset");
        }
        const asset = await res.json();
        updateJob(id, { saved: true, saving: false });
        onAssetCreated?.(asset);
      } catch (err) {
        updateJob(id, { saving: false });
        setError(err instanceof Error ? err.message : "Failed to save asset");
      }
    },
    [onAssetCreated, saveProduct, updateJob]
  );

  const activeCount = jobs.filter((j) => j.status === "uploading" || j.status === "generating").length;
  const queuedCount = jobs.filter((j) => j.status === "queued").length;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Tag className="w-5 h-5 text-indigo-600" />
          Relabel
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Upload photos of the bottle with the old label — Nano Banana Pro regenerates them
          with the new label from the reference packshot. Everything else in the photo stays identical.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Reference settings */}
      <div className="bg-white rounded-lg border border-gray-200">
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
        >
          <span className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-gray-400" />
            Label reference
            {settingsLoaded && !referenceUrl && (
              <span className="text-xs font-normal text-amber-600">— not configured</span>
            )}
          </span>
          {referenceUrl && !settingsOpen && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={referenceUrl} alt="Reference" className="w-8 h-8 rounded object-cover border border-gray-200" />
          )}
        </button>
        {settingsOpen && (
          <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
            <div className="flex items-start gap-4">
              {referenceUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={referenceUrl}
                  alt="Label reference"
                  className="w-32 h-32 rounded-lg object-cover border border-gray-200"
                />
              ) : (
                <div className="w-32 h-32 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-400 text-center px-2">
                  No reference yet
                </div>
              )}
              <div className="flex-1 space-y-2">
                <p className="text-xs text-gray-500">
                  Use a studio packshot of the bottle wearing the NEW label (a mockup render works
                  great). This gives the model both the artwork and how the label sits on the bottle.
                </p>
                <button
                  onClick={() => refInputRef.current?.click()}
                  disabled={uploadingRef}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-50"
                >
                  {uploadingRef ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  {referenceUrl ? "Replace reference" : "Upload reference"}
                </button>
                <input
                  ref={refInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleReferenceUpload(file);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Label text spec (optional — improves text fidelity)
              </label>
              <textarea
                value={textSpec}
                onChange={(e) => setTextSpec(e.target.value)}
                onBlur={handleSaveTextSpec}
                rows={5}
                placeholder={`The label's exact texts (copy character by character):\n- Wordmark: "..."\n- Heading: "..."`}
                className="w-full text-xs border border-gray-200 rounded-lg p-2.5 font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                List every text string on the label exactly as written. Saved automatically
                {savingSettings ? " — saving..." : "."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
      >
        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-700">
          Drop images with the old label here
        </p>
        <p className="text-xs text-gray-400 mt-1">
          or click to browse — multiple files supported, paste works too
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            enqueueFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {/* Shared options */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-64">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Extra instructions (optional, applies to new generations)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder='e.g. "keep the shadow soft"'
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Product (for saved assets)
          </label>
          <select
            value={saveProduct ?? ""}
            onChange={(e) => setSaveProduct((e.target.value || null) as Product | null)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">General</option>
            {products.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {(activeCount > 0 || queuedCount > 0) && (
          <p className="text-xs text-gray-500 pb-2.5">
            {activeCount} running{queuedCount > 0 ? `, ${queuedCount} queued` : ""}
          </p>
        )}
      </div>

      {/* Job cards */}
      <div className="space-y-4">
        {jobs.map((job) => (
          <div key={job.id} className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-700 truncate">{job.fileName}</p>
              <div className="flex items-center gap-2">
                {job.status === "done" && job.resultUrl && (
                  <>
                    <a
                      href={job.resultUrl}
                      download={`relabel-${job.fileName.replace(/\.[^.]+$/, "")}.png`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </a>
                    <button
                      onClick={() => handleRegenerate(job.id)}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Regenerate
                    </button>
                    <button
                      onClick={() => handleSave(job.id)}
                      disabled={job.saving || job.saved}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg",
                        job.saved
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                      )}
                    >
                      {job.saving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : job.saved ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : null}
                      {job.saved ? "Saved" : "Save to Assets"}
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleRemove(job.id)}
                  className="text-gray-300 hover:text-gray-500"
                  title="Remove"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">
                  Original
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={job.sourcePreview}
                  alt="Original"
                  className="w-full rounded-lg border border-gray-100"
                />
              </div>
              <div>
                <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">
                  New label
                </p>
                {job.status === "done" && job.resultUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={job.resultUrl}
                    alt="Relabeled"
                    className="w-full rounded-lg border border-gray-100"
                  />
                ) : job.status === "error" ? (
                  <div className="w-full aspect-square rounded-lg border border-red-200 bg-red-50 flex flex-col items-center justify-center gap-2 p-4">
                    <AlertCircle className="w-6 h-6 text-red-400" />
                    <p className="text-xs text-red-600 text-center">{job.error}</p>
                    <button
                      onClick={() => handleRegenerate(job.id)}
                      className="flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-800 mt-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Try again
                    </button>
                  </div>
                ) : (
                  <div className="w-full aspect-square rounded-lg border border-gray-100 bg-gray-50 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                    <p className="text-xs text-gray-400">
                      {job.status === "queued"
                        ? "Queued..."
                        : job.status === "uploading"
                          ? "Uploading..."
                          : "Generating (60-120s)..."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
