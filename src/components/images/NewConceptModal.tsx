"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Loader2, FolderOpen, ChevronDown, Search, Languages } from "lucide-react";
import { Language, LANGUAGES, Product, PRODUCTS } from "@/types";
import { getSettings } from "@/lib/settings";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (jobId: string) => void;
  avgSecondsPerImage?: number;
}

interface DriveFileItem {
  id: string;
  name: string;
  thumbnailLink?: string;
  translate: boolean; // true = needs translation, false = import only
}

interface DriveFolderItem {
  id: string;
  name: string;
}

export default function NewConceptModal({ open, onClose, onCreated, avgSecondsPerImage = 75 }: Props) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Folder picker state
  const [folders, setFolders] = useState<DriveFolderItem[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<DriveFolderItem | null>(null);
  const [folderDropdownOpen, setFolderDropdownOpen] = useState(false);
  const [folderSearch, setFolderSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Google Drive files state
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [fetchingDrive, setFetchingDrive] = useState(false);
  const [product, setProduct] = useState<Product>("happysleep");
  const [selectedLanguages, setSelectedLanguages] = useState<Set<Language>>(() => {
    try {
      const settings = getSettings();
      if (settings.static_ads_default_languages?.length) {
        return new Set(settings.static_ads_default_languages);
      }
    } catch {}
    return new Set(LANGUAGES.map((l) => l.value));
  });
  const fetchingRef = useRef(false);

  // Fetch concept folders when modal opens
  useEffect(() => {
    if (!open) return;
    if (folders.length > 0) return;

    setLoadingFolders(true);
    fetch("/api/drive/list-folders")
      .then((res) => res.json())
      .then((data) => {
        if (data.folders) setFolders(data.folders);
      })
      .catch(() => setError("Failed to load concept folders"))
      .finally(() => setLoadingFolders(false));
  }, [open, folders.length]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!folderDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setFolderDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [folderDropdownOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (folderDropdownOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [folderDropdownOpen]);

  const handleSelectFolder = useCallback(async (folder: DriveFolderItem) => {
    setSelectedFolder(folder);
    setFolderDropdownOpen(false);
    setFolderSearch("");
    setName(folder.name);
    setDriveFiles([]);
    setError("");

    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setFetchingDrive(true);

    try {
      const res = await fetch("/api/drive/list-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderUrl: `https://drive.google.com/drive/folders/${folder.id}` }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch files from Drive");
      }

      const { files: driveFilesList } = await res.json();
      setDriveFiles(
        driveFilesList.map((f: { id: string; name: string; thumbnailLink?: string }) => ({
          id: f.id,
          name: f.name,
          thumbnailLink: f.thumbnailLink,
          translate: true, // default: all images need translation
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch Drive files");
    } finally {
      setFetchingDrive(false);
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) {
        if (folderDropdownOpen) {
          setFolderDropdownOpen(false);
        } else {
          onClose();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, submitting, onClose, folderDropdownOpen]);

  if (!open) return null;

  const translateCount = driveFiles.filter((f) => f.translate).length;
  const totalFiles = driveFiles.length;
  const translationCostPer = 0.09;

  const filteredFolders = folderSearch
    ? folders.filter((f) => f.name.toLowerCase().includes(folderSearch.toLowerCase()))
    : folders;

  function toggleTranslate(index: number) {
    setDriveFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, translate: !f.translate } : f))
    );
  }

  async function handleSubmit() {
    if (totalFiles === 0 || !name.trim() || selectedLanguages.size === 0) return;

    setSubmitting(true);
    setError("");

    try {
      const createRes = await fetch("/api/image-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          target_ratios: ["1:1"],
          target_languages: Array.from(selectedLanguages),
          ...(selectedFolder ? { source_folder_id: selectedFolder.id } : {}),
          product,
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
      onCreated(job.id);

      // Download ALL files from Drive (fire and forget)
      const allFiles = [...driveFiles];
      (async () => {
        try {
          for (const driveFile of allFiles) {
            await fetch("/api/drive/download", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fileId: driveFile.id,
                fileName: driveFile.name,
                jobId: job.id,
                skipTranslation: !driveFile.translate,
              }),
            });
          }
          await fetch(`/api/image-jobs/${job.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "ready" }),
          });
          // Auto-create translations so detail page can start immediately
          await fetch(`/api/image-jobs/${job.id}/create-translations`, { method: "POST" });
        } catch (err) {
          console.error("Background import failed:", err);
        }
      })();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">New Concept</h2>
          <button onClick={onClose} disabled={submitting} className="text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-5 overflow-y-auto">
          {/* Concept folder picker */}
          <div ref={dropdownRef} className="relative">
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <FolderOpen className="w-4 h-4" />
              Concept Folder
            </label>
            <button
              type="button"
              onClick={() => setFolderDropdownOpen(!folderDropdownOpen)}
              disabled={loadingFolders}
              className="w-full bg-white border border-gray-300 text-left rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 flex items-center justify-between disabled:opacity-50"
            >
              {loadingFolders ? (
                <span className="flex items-center gap-2 text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading folders...
                </span>
              ) : selectedFolder ? (
                <span className="text-gray-800 truncate">{selectedFolder.name}</span>
              ) : (
                <span className="text-gray-400">Select a concept folder...</span>
              )}
              <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${folderDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {folderDropdownOpen && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 flex flex-col">
                <div className="p-2 border-b border-gray-100">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={folderSearch}
                      onChange={(e) => setFolderSearch(e.target.value)}
                      placeholder="Search folders..."
                      className="w-full bg-gray-50 border border-gray-200 rounded-md pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <div className="overflow-y-auto flex-1">
                  {filteredFolders.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">
                      {folderSearch ? "No folders match" : "No folders found"}
                    </p>
                  ) : (
                    filteredFolders.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => handleSelectFolder(folder)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors flex items-center gap-2 ${
                          selectedFolder?.id === folder.id ? "bg-indigo-50 text-indigo-700" : "text-gray-700"
                        }`}
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{folder.name}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {fetchingDrive && (
              <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Fetching files from folder...
              </div>
            )}
          </div>

          {/* Image thumbnail grid */}
          {driveFiles.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <Languages className="w-4 h-4" />
                  Images to translate
                </label>
                <p className="text-xs text-gray-400">
                  {translateCount} of {totalFiles} will be translated
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto">
                {driveFiles.map((file, i) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => toggleTranslate(i)}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                      file.translate
                        ? "border-indigo-400 ring-1 ring-indigo-200"
                        : "border-gray-200 opacity-60"
                    }`}
                    title={`${file.name}\n${file.translate ? "Will be translated" : "Import only (no translation)"}`}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-square bg-gray-100">
                      {file.thumbnailLink ? (
                        <img
                          src={file.thumbnailLink}
                          alt={file.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                          No preview
                        </div>
                      )}
                    </div>
                    {/* Translate badge */}
                    <div className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                      file.translate
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-300 text-gray-600"
                    }`}>
                      {file.translate ? "T" : "—"}
                    </div>
                    {/* Filename */}
                    <div className="px-1 py-0.5 bg-white">
                      <p className="text-[10px] text-gray-500 truncate">{file.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Product */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Product</label>
            <div className="flex gap-2">
              {PRODUCTS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setProduct(p.value)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    product === p.value
                      ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                      : "bg-white border-gray-200 text-gray-400 hover:text-gray-700"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Languages */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Languages</label>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((lang) => {
                const selected = selectedLanguages.has(lang.value);
                return (
                  <button
                    key={lang.value}
                    type="button"
                    onClick={() => {
                      setSelectedLanguages((prev) => {
                        const next = new Set(prev);
                        if (next.has(lang.value)) next.delete(lang.value);
                        else next.add(lang.value);
                        return next;
                      });
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      selected
                        ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                        : "bg-white border-gray-200 text-gray-400 hover:text-gray-700"
                    }`}
                  >
                    <span>{lang.flag}</span>
                    {lang.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* No images hint */}
          {totalFiles === 0 && !fetchingDrive && !selectedFolder && (
            <p className="text-sm text-gray-400 text-center">
              Select a concept folder above to get started
            </p>
          )}

          {/* Error */}
          {error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}

          {/* Summary + Submit */}
          {totalFiles > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl shadow-sm px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">{name || "Untitled"}</p>
                {(() => {
                  const totalTranslations = translateCount * selectedLanguages.size;
                  const batches = Math.ceil(totalTranslations / 10);
                  const estMinutes = Math.ceil(batches * avgSecondsPerImage / 60);
                  return (
                    <>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {totalFiles} images ({translateCount} to translate) &times; {selectedLanguages.size} languages = {totalTranslations} translations
                        {" "}(~${(totalTranslations * translationCostPer).toFixed(2)})
                      </p>
                      {totalTranslations > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          ~{estMinutes} min estimated
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting || !name.trim() || selectedLanguages.size === 0}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors shrink-0"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? "Creating..." : "Create Concept"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
