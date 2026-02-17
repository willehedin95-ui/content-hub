"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Clock, Image as ImageIcon } from "lucide-react";
import { ImageJob, LANGUAGES } from "@/types";
import ImageJobCard from "@/components/images/ImageJobCard";
import NewConceptModal from "@/components/images/NewConceptModal";
import JSZip from "jszip";

export default function ImagesPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<ImageJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/image-jobs");
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Poll when any job is processing
  useEffect(() => {
    const hasProcessing = jobs.some((j) => j.status === "processing");
    if (!hasProcessing) return;

    const interval = setInterval(fetchJobs, 10000);
    return () => clearInterval(interval);
  }, [jobs, fetchJobs]);

  async function handleRetry(jobId: string) {
    const res = await fetch(`/api/image-jobs/${jobId}/retry`, { method: "POST" });
    if (res.ok) fetchJobs();
  }

  async function handleDelete(jobId: string) {
    if (!confirm("Delete this concept and all its translations?")) return;
    const res = await fetch(`/api/image-jobs/${jobId}`, { method: "DELETE" });
    if (res.ok) setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }

  async function handleExport(jobId: string) {
    const res = await fetch(`/api/image-jobs/${jobId}`);
    if (!res.ok) return;
    const job: ImageJob = await res.json();

    const zip = new JSZip();
    const sourceImages = job.source_images ?? [];

    for (const si of sourceImages) {
      for (const t of si.image_translations ?? []) {
        if (t.status === "completed" && t.translated_url) {
          try {
            const imgRes = await fetch(t.translated_url);
            const blob = await imgRes.blob();
            const langLabel = LANGUAGES.find((l) => l.value === t.language)?.label ?? t.language;
            const filename = si.filename || `${si.id}.png`;
            zip.file(`${langLabel}/${filename}`, blob);
          } catch {
            // Skip failed downloads
          }
        }
      }
    }

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${job.name}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCreated(jobId: string) {
    setShowModal(false);
    router.push(`/images/${jobId}`);
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Images</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New
        </button>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-gray-400 mb-6">
        <Clock className="w-3.5 h-3.5" />
        Current average: ~75s per image
      </p>

      {/* Job list */}
      {loading ? (
        <div className="text-sm text-gray-400">Loading...</div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ImageIcon className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">No image concepts yet</p>
          <p className="text-gray-400 text-xs mt-1">
            Click &quot;+ New&quot; to create your first batch
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <ImageJobCard
              key={job.id}
              job={job}
              onRetry={handleRetry}
              onDelete={handleDelete}
              onExport={handleExport}
            />
          ))}
        </div>
      )}

      <NewConceptModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
