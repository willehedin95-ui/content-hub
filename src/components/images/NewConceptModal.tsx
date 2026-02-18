"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Loader2, Link } from "lucide-react";
import { Product, PRODUCTS } from "@/types";

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
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Google Drive state
  const [folderUrl, setFolderUrl] = useState("");
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [fetchingDrive, setFetchingDrive] = useState(false);
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null);
  const [product, setProduct] = useState<Product>("happysleep");
  const fetchingRef = useRef(false);

  // Extract folder ID from a Google Drive URL
  function extractFolderId(url: string): string | null {
    const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  const handleFetchDriveFiles = useCallback(async (url: string) => {
    if (!url.trim() || !extractFolderId(url)) return;
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setFetchingDrive(true);
    setError("");

    try {
      const res = await fetch("/api/drive/list-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderUrl: url.trim() }),
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
      fetchingRef.current = false;
    }
  }, []);

  // Auto-fetch when a valid Drive folder URL is pasted or typed
  useEffect(() => {
    if (folderUrl && extractFolderId(folderUrl) && !fetchingRef.current && driveFiles.length === 0) {
      handleFetchDriveFiles(folderUrl);
    }
  }, [folderUrl, handleFetchDriveFiles, driveFiles.length]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const selectedDriveFiles = driveFiles.filter((f) => f.selected);
  const imageCount = selectedDriveFiles.length;
  const expansionCost = (imageCount * 0.09).toFixed(2);

  function toggleDriveFile(index: number) {
    setDriveFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, selected: !f.selected } : f))
    );
  }

  async function handleSubmit() {
    if (selectedDriveFiles.length === 0 || !name.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      // 1. Create the job (languages selected later, after expansion review)
      const createRes = await fetch("/api/image-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          target_ratios: ["1:1", "9:16"],
          ...(driveFolderId ? { source_folder_id: driveFolderId } : {}),
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

      // 2. Download from Google Drive
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

      // 3. Set job to expanding (9:16 expansion happens first, then translate)
      await fetch(`/api/image-jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "expanding" }),
      });

      onCreated(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  function handleUrlChange(newUrl: string) {
    setFolderUrl(newUrl);
    // Reset drive state when URL changes significantly
    if (driveFiles.length > 0 && extractFolderId(newUrl) !== driveFolderId) {
      setDriveFiles([]);
      setDriveFolderId(null);
      setName("");
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h2 className="text-lg font-semibold text-gray-900">New Concept</h2>
          <button onClick={onClose} disabled={submitting} className="text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-5">
          {/* Google Drive Folder URL — auto-fetches on paste */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <Link className="w-4 h-4" />
              Google Drive Folder URL
            </label>
            <input
              type="text"
              value={folderUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/abc123..."
              className="w-full bg-white border border-gray-300 text-gray-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
            />
            {fetchingDrive && (
              <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Fetching files from Drive...
              </div>
            )}
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

          {/* Product — always one selected */}
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
          {imageCount > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl shadow-sm px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">{name || "Untitled"}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {imageCount} images &middot; expand to 9:16 (~{expansionCost} USD)
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Languages selected after expansion review
                </p>
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting || !name.trim()}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
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
