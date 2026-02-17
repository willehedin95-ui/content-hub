"use client";

import { useState, useRef } from "react";
import { X, Upload, Loader2, Trash2 } from "lucide-react";
import { Language, LANGUAGES } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (jobId: string) => void;
}

export default function NewConceptModal({ open, onClose, onCreated }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState(
    `Concept - ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
  );
  const [selectedLanguages, setSelectedLanguages] = useState<Set<Language>>(
    new Set(LANGUAGES.map((l) => l.value))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const totalTranslations = files.length * selectedLanguages.size;
  const estimatedMinutes = Math.ceil((totalTranslations * 75) / 60);
  const estimatedCost = (totalTranslations * 0.09).toFixed(2);

  function toggleLanguage(lang: Language) {
    setSelectedLanguages((prev) => {
      const next = new Set(prev);
      if (next.has(lang)) {
        next.delete(lang);
      } else {
        next.add(lang);
      }
      return next;
    });
  }

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...selected]);
    e.target.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (files.length === 0 || selectedLanguages.size === 0 || !name.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      // 1. Create the job (JSON, no files)
      const createRes = await fetch("/api/image-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          target_languages: Array.from(selectedLanguages),
        }),
      });

      if (!createRes.ok) {
        const text = await createRes.text();
        try {
          const data = JSON.parse(text);
          throw new Error(data.error || "Failed to create concept");
        } catch {
          throw new Error(text || "Failed to create concept");
        }
      }

      const job = await createRes.json();

      // 2. Upload images one at a time
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);

        const uploadRes = await fetch(`/api/image-jobs/${job.id}/upload`, {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          const data = await uploadRes.json().catch(() => ({}));
          throw new Error(data.error || `Failed to upload ${file.name}`);
        }
      }

      // 3. Set job to processing
      await fetch(`/api/image-jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "processing" }),
      });

      onCreated(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-[#141620] border border-[#1e2130] rounded-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h2 className="text-lg font-semibold text-white">New Concept</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-5">
          {/* Concept Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Concept Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#0a0c14] border border-[#1e2130] text-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Upload Area */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Images</label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFilesSelected}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#1e2130] hover:border-indigo-500/40 rounded-xl py-6 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Upload className="w-6 h-6" />
              <span className="text-sm">Click to upload images</span>
              <span className="text-xs text-slate-600">PNG, JPG, WebP</span>
            </button>

            {/* File list */}
            {files.length > 0 && (
              <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
                {files.map((file, i) => (
                  <div
                    key={`${file.name}-${i}`}
                    className="flex items-center justify-between bg-[#0a0c14] rounded-lg px-3 py-2 text-sm"
                  >
                    <span className="text-slate-300 truncate mr-2">{file.name}</span>
                    <button
                      onClick={() => removeFile(i)}
                      className="text-slate-600 hover:text-red-400 shrink-0 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Target Languages */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Target Languages</label>
            <div className="grid grid-cols-2 gap-2">
              {LANGUAGES.map((lang) => {
                const selected = selectedLanguages.has(lang.value);
                return (
                  <button
                    key={lang.value}
                    onClick={() => toggleLanguage(lang.value)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                      selected
                        ? "bg-indigo-600/15 border-indigo-500/40 text-indigo-300"
                        : "bg-[#0a0c14] border-[#1e2130] text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    <span className="text-base">{lang.flag}</span>
                    {lang.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          {/* Summary + Submit */}
          {files.length > 0 && selectedLanguages.size > 0 && (
            <div className="bg-[#0a0c14] border border-[#1e2130] rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-200">{name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {totalTranslations} translations will be created
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  Credits: {estimatedCost} USD &middot; ~{estimatedMinutes} min
                </p>
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? "Creating..." : "Translate"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
