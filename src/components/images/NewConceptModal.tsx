"use client";

import { useState, useRef } from "react";
import { X, Upload, Loader2, Trash2, Search, Link, ChevronDown, ChevronRight } from "lucide-react";
import { Language, LANGUAGES, AspectRatio, ASPECT_RATIOS } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (jobId: string) => void;
}

interface DriveFileItem {
  id: string;
  name: string;
  selected: boolean;
}

export default function NewConceptModal({ open, onClose, onCreated }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [selectedLanguages, setSelectedLanguages] = useState<Set<Language>>(() => {
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
  const [selectedRatios, setSelectedRatios] = useState<Set<AspectRatio>>(new Set(["1:1"]));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Google Drive state
  const [folderUrl, setFolderUrl] = useState("");
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [fetchingDrive, setFetchingDrive] = useState(false);
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  if (!open) return null;

  const selectedDriveFiles = driveFiles.filter((f) => f.selected);
  const imageCount = files.length + selectedDriveFiles.length;
  const totalTranslations = imageCount * selectedLanguages.size * selectedRatios.size;
  const estimatedMinutes = Math.ceil((totalTranslations * 75) / 60);
  const estimatedCost = (totalTranslations * 0.09).toFixed(2);

  function toggleRatio(ratio: AspectRatio) {
    setSelectedRatios((prev) => {
      const next = new Set(prev);
      if (next.has(ratio)) {
        if (next.size > 1) next.delete(ratio);
      } else {
        next.add(ratio);
      }
      return next;
    });
  }

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

  // Resize image client-side to stay under server body limit
  function resizeImage(file: File, maxDim = 2048): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        let { width, height } = img;
        if (width <= maxDim && height <= maxDim && file.size < 3_000_000) {
          resolve(file);
          return;
        }
        if (width > height) {
          if (width > maxDim) { height = Math.round(height * (maxDim / width)); width = maxDim; }
        } else {
          if (height > maxDim) { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Failed to resize"))),
          "image/jpeg",
          0.9
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = URL.createObjectURL(file);
    });
  }

  async function handleFetchDriveFiles() {
    if (!folderUrl.trim()) return;
    setFetchingDrive(true);
    setError("");

    try {
      const res = await fetch("/api/drive/list-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderUrl: folderUrl.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch files from Drive");
      }

      const { folderId, folderName, files: driveFilesList } = await res.json();
      setDriveFolderId(folderId);
      setDriveFiles(
        driveFilesList.map((f: { id: string; name: string }) => ({
          id: f.id,
          name: f.name,
          selected: true,
        }))
      );
      // Auto-set concept name to folder name
      if (folderName) {
        setName(folderName);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch Drive files");
    } finally {
      setFetchingDrive(false);
    }
  }

  function toggleDriveFile(index: number) {
    setDriveFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, selected: !f.selected } : f))
    );
  }

  async function handleSubmit() {
    const hasImages = files.length > 0 || selectedDriveFiles.length > 0;
    if (!hasImages || selectedLanguages.size === 0 || !name.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      // 1. Create the job
      const createRes = await fetch("/api/image-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          target_languages: Array.from(selectedLanguages),
          target_ratios: Array.from(selectedRatios),
          ...(driveFolderId ? { source_folder_id: driveFolderId } : {}),
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

      // 2a. Upload local files
      for (const file of files) {
        const resized = await resizeImage(file);
        const formData = new FormData();
        formData.append("file", resized, file.name);

        const uploadRes = await fetch(`/api/image-jobs/${job.id}/upload`, {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          const data = await uploadRes.json().catch(() => ({}));
          throw new Error(data.error || `Failed to upload ${file.name}`);
        }
      }

      // 2b. Download from Google Drive
      for (const driveFile of selectedDriveFiles) {
        const dlRes = await fetch("/api/drive/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId: driveFile.id,
            fileName: driveFile.name,
            jobId: job.id,
          }),
        });

        if (!dlRes.ok) {
          const data = await dlRes.json().catch(() => ({}));
          throw new Error(data.error || `Failed to download ${driveFile.name}`);
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
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h2 className="text-lg font-semibold text-gray-900">New Concept</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-5">
          {/* Google Drive Folder URL — primary input */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <Link className="w-4 h-4" />
              Google Drive Folder URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={folderUrl}
                onChange={(e) => setFolderUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleFetchDriveFiles()}
                placeholder="https://drive.google.com/drive/folders/abc123..."
                className="flex-1 bg-white border border-gray-300 text-gray-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleFetchDriveFiles}
                disabled={fetchingDrive || !folderUrl.trim()}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
              >
                {fetchingDrive ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                Fetch
              </button>
            </div>
          </div>

          {/* Drive file list with checkboxes */}
          {driveFiles.length > 0 && (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {driveFiles.map((file, i) => (
                <label
                  key={file.id}
                  className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={file.selected}
                    onChange={() => toggleDriveFile(i)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-gray-700 truncate">{file.name}</span>
                </label>
              ))}
              <p className="text-xs text-gray-400 mt-1">
                {selectedDriveFiles.length} of {driveFiles.length} files selected
              </p>
            </div>
          )}

          {/* Upload from computer — collapsible secondary option */}
          <div>
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              {showUpload ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <Upload className="w-3.5 h-3.5" />
              Or upload from computer
            </button>

            {showUpload && (
              <div className="mt-2">
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
                  className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 hover:border-indigo-300 rounded-xl py-5 text-gray-500 hover:text-gray-900 transition-colors"
                >
                  <Upload className="w-5 h-5" />
                  <span className="text-sm">Click to upload images</span>
                  <span className="text-xs text-gray-400">PNG, JPG, WebP</span>
                </button>

                {files.length > 0 && (
                  <div className="mt-2 space-y-1.5 max-h-32 overflow-y-auto">
                    {files.map((file, i) => (
                      <div
                        key={`${file.name}-${i}`}
                        className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm"
                      >
                        <span className="text-gray-700 truncate mr-2">{file.name}</span>
                        <button
                          onClick={() => removeFile(i)}
                          className="text-gray-400 hover:text-red-600 shrink-0 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Target Languages — checkboxes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Target Languages</label>
            <div className="grid grid-cols-2 gap-2">
              {LANGUAGES.map((lang) => {
                const selected = selectedLanguages.has(lang.value);
                return (
                  <label
                    key={lang.value}
                    className={`flex items-center gap-2.5 px-4 py-3 rounded-lg border text-sm font-medium cursor-pointer transition-colors ${
                      selected
                        ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                        : "bg-white border-gray-200 text-gray-400 hover:text-gray-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleLanguage(lang.value)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-base">{lang.flag}</span>
                    {lang.label}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Aspect Ratios — checkboxes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Aspect Ratios</label>
            <div className="grid grid-cols-3 gap-2">
              {ASPECT_RATIOS.map((ratio) => {
                const selected = selectedRatios.has(ratio.value);
                return (
                  <label
                    key={ratio.value}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium cursor-pointer transition-colors ${
                      selected
                        ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                        : "bg-white border-gray-200 text-gray-400 hover:text-gray-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleRatio(ratio.value)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    {ratio.label}
                  </label>
                );
              })}
            </div>
          </div>

          {/* No images hint */}
          {imageCount === 0 && !fetchingDrive && (
            <p className="text-sm text-gray-400 text-center">
              Paste a Google Drive folder URL above to get started
            </p>
          )}

          {/* Error */}
          {error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}

          {/* Summary + Submit */}
          {imageCount > 0 && selectedLanguages.size > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl shadow-sm px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">{name || "Untitled"}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {imageCount} images &middot; {selectedLanguages.size} languages &middot; {selectedRatios.size} ratio{selectedRatios.size !== 1 ? "s" : ""} &middot; {totalTranslations} translations
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  ~{estimatedCost} USD &middot; ~{estimatedMinutes} min
                </p>
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting || !name.trim()}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
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
