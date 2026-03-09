"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface LinkModalProps {
  show: boolean;
  onClose: () => void;
  onInsert: (url: string) => void;
  initialUrl?: string;
}

export default function LinkModal({ show, onClose, onInsert, initialUrl = "" }: LinkModalProps) {
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens with initialUrl
  useEffect(() => {
    if (show) {
      setUrl(initialUrl);
      setError("");
    }
  }, [show, initialUrl]);

  // Validate URL
  useEffect(() => {
    if (!url.trim()) {
      setError("");
      return;
    }

    const trimmedUrl = url.trim();
    const safeSchemes = /^(https?|mailto|tel):/i;
    const isRelative = /^[./]|^[^:/?#]+$/;

    if (!safeSchemes.test(trimmedUrl) && !isRelative.test(trimmedUrl)) {
      setError("Invalid URL. Only http://, https://, mailto:, tel:, or relative URLs are allowed.");
    } else {
      setError("");
    }
  }, [url]);

  // Auto-focus input when modal opens
  useEffect(() => {
    if (show && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [show]);

  // Handle ESC key
  useEffect(() => {
    if (!show) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [show, onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || error) return;
    onInsert(url.trim());
    setUrl("");
    setError("");
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  if (!show || typeof document === 'undefined') return null;

  const isValid = url.trim() && !error;

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Insert Link</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4">
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            URL
          </label>
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 ${
              error
                ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                : "border-gray-300 focus:ring-indigo-500 focus:border-indigo-500"
            }`}
          />
          {error && (
            <p className="mt-1.5 text-xs text-red-600">{error}</p>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid}
              className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Insert
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
