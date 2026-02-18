"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Clock, Image as ImageIcon } from "lucide-react";
import { ImageJob } from "@/types";
import ImageJobCard from "@/components/images/ImageJobCard";
import NewConceptModal from "@/components/images/NewConceptModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { exportJobAsZip } from "@/lib/export-zip";

export default function ImagesPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<ImageJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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
    const hasProcessing = jobs.some((j) => j.status === "processing" || j.status === "expanding");
    if (!hasProcessing) return;

    const interval = setInterval(fetchJobs, 10000);
    return () => clearInterval(interval);
  }, [jobs, fetchJobs]);

  async function handleRetry(jobId: string) {
    const res = await fetch(`/api/image-jobs/${jobId}/retry`, { method: "POST" });
    if (res.ok) fetchJobs();
  }

  async function handleDelete(jobId: string) {
    setConfirmDeleteId(null);
    const res = await fetch(`/api/image-jobs/${jobId}`, { method: "DELETE" });
    if (res.ok) setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }

  async function handleExport(jobId: string) {
    const res = await fetch(`/api/image-jobs/${jobId}`);
    if (!res.ok) return;
    const job: ImageJob = await res.json();
    await exportJobAsZip(job);
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
          New Concept
        </button>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-gray-400 mb-6">
        <Clock className="w-3.5 h-3.5" />
        Current average: ~75s per image
      </p>

      {/* Job list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm animate-pulse">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-48 bg-gray-200 rounded" />
                  <div className="h-3 w-32 bg-gray-100 rounded" />
                </div>
                <div className="h-8 w-20 bg-gray-100 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ImageIcon className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">No image concepts yet</p>
          <p className="text-gray-400 text-xs mt-1">
            Click &quot;+ New Concept&quot; to create your first batch
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <ImageJobCard
              key={job.id}
              job={job}
              onRetry={handleRetry}
              onDelete={(id) => setConfirmDeleteId(id)}
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

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete concept"
        message="Delete this concept and all its translations?"
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
