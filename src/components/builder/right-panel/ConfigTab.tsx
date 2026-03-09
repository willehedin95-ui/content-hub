"use client";

import { useState, useEffect } from "react";
import { useBuilder } from "../BuilderContext";
import { EyeOff, Trash2, Copy, X, Link2, Image, Video, Clipboard, ClipboardPaste } from "lucide-react";

export default function ConfigTab() {
  const {
    selectedElRef,
    iframeRef,
    hasSelectedEl,
    markDirty,
    pushUndoSnapshot,
    handleHideElement,
    handleDeleteElement,
    handleDuplicateElement,
    handleCopyStyles,
    handlePasteStyles,
    hasCopiedStyles,
    deselectElement,
    layersRefreshKey,
  } = useBuilder();

  // --- Link editing state ---
  const [linkHref, setLinkHref] = useState("");
  const [linkTarget, setLinkTarget] = useState("_self");

  // --- Image editing state ---
  const [imgSrc, setImgSrc] = useState("");
  const [imgAlt, setImgAlt] = useState("");

  // --- Video editing state ---
  const [videoSrc, setVideoSrc] = useState("");

  // Derive element types from current selection
  const el = selectedElRef.current;
  const linkEl =
    el?.tagName === "A"
      ? (el as HTMLAnchorElement)
      : (el?.closest("a") as HTMLAnchorElement | null);
  const isLink = !!linkEl;
  const isImage = el?.tagName === "IMG";
  const isVideo = el?.tagName === "VIDEO" || el?.tagName === "SOURCE";

  // Sync state from DOM when selection changes
  useEffect(() => {
    const currentEl = selectedElRef.current;
    if (!currentEl || !hasSelectedEl) return;

    // Link
    const anchor =
      currentEl.tagName === "A"
        ? (currentEl as HTMLAnchorElement)
        : (currentEl.closest("a") as HTMLAnchorElement | null);
    if (anchor) {
      setLinkHref(anchor.getAttribute("href") || "");
      setLinkTarget(anchor.getAttribute("target") || "_self");
    }

    // Image
    if (currentEl.tagName === "IMG") {
      const img = currentEl as HTMLImageElement;
      setImgSrc(img.getAttribute("src") || "");
      setImgAlt(img.getAttribute("alt") || "");
    }

    // Video
    if (currentEl.tagName === "VIDEO") {
      const video = currentEl as HTMLVideoElement;
      const source = video.querySelector("source");
      setVideoSrc(source?.getAttribute("src") || video.getAttribute("src") || "");
    }
    if (currentEl.tagName === "SOURCE") {
      setVideoSrc(currentEl.getAttribute("src") || "");
    }
  }, [hasSelectedEl, selectedElRef, layersRefreshKey]);

  // --- Link handlers ---
  function handleLinkHrefChange(newHref: string) {
    setLinkHref(newHref);
    if (linkEl) {
      pushUndoSnapshot();
      linkEl.setAttribute("href", newHref);
      markDirty();
    }
  }

  function handleLinkTargetChange(newTarget: string) {
    setLinkTarget(newTarget);
    if (linkEl) {
      pushUndoSnapshot();
      linkEl.setAttribute("target", newTarget);
      markDirty();
    }
  }

  // --- Image handlers ---
  function handleImgSrcChange(newSrc: string) {
    setImgSrc(newSrc);
    const currentEl = selectedElRef.current;
    if (currentEl?.tagName === "IMG") {
      pushUndoSnapshot();
      (currentEl as HTMLImageElement).src = newSrc;
      markDirty();
    }
  }

  function handleImgAltChange(newAlt: string) {
    setImgAlt(newAlt);
    const currentEl = selectedElRef.current;
    if (currentEl?.tagName === "IMG") {
      pushUndoSnapshot();
      (currentEl as HTMLImageElement).alt = newAlt;
      markDirty();
    }
  }

  // --- Video handlers ---
  function handleVideoSrcChange(newSrc: string) {
    setVideoSrc(newSrc);
    const currentEl = selectedElRef.current;
    if (!currentEl) return;

    pushUndoSnapshot();

    if (currentEl.tagName === "VIDEO") {
      const video = currentEl as HTMLVideoElement;
      const source = video.querySelector("source");
      if (source) {
        source.setAttribute("src", newSrc);
      } else {
        video.setAttribute("src", newSrc);
      }
      video.load();
    } else if (currentEl.tagName === "SOURCE") {
      currentEl.setAttribute("src", newSrc);
      const parentVideo = currentEl.closest("video");
      if (parentVideo) parentVideo.load();
    }
    markDirty();
  }

  if (!hasSelectedEl) return null;

  const inputClass =
    "w-full bg-white border border-gray-300 text-gray-900 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-indigo-500";

  return (
    <div className="space-y-0">
      {/* Link Editing */}
      {isLink && (
        <div className="px-4 py-3 space-y-2 border-b border-gray-100">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <Link2 className="w-3 h-3" /> Link
          </label>
          <div className="space-y-1.5">
            <div>
              <span className="text-[10px] text-gray-400 uppercase">URL</span>
              <input
                type="text"
                value={linkHref}
                onChange={(e) => handleLinkHrefChange(e.target.value)}
                placeholder="https://..."
                className={inputClass}
              />
            </div>
            <div>
              <span className="text-[10px] text-gray-400 uppercase">Target</span>
              <select
                value={linkTarget}
                onChange={(e) => handleLinkTargetChange(e.target.value)}
                className="w-full bg-white border border-gray-300 text-gray-900 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="_self">Same window (_self)</option>
                <option value="_blank">New tab (_blank)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Image Editing */}
      {isImage && (
        <div className="px-4 py-3 space-y-2 border-b border-gray-100">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <Image className="w-3 h-3" /> Image
          </label>
          <div className="space-y-1.5">
            <div>
              <span className="text-[10px] text-gray-400 uppercase">Source URL</span>
              <input
                type="text"
                value={imgSrc}
                onChange={(e) => handleImgSrcChange(e.target.value)}
                placeholder="https://..."
                className={inputClass}
              />
            </div>
            <div>
              <span className="text-[10px] text-gray-400 uppercase">Alt text</span>
              <input
                type="text"
                value={imgAlt}
                onChange={(e) => handleImgAltChange(e.target.value)}
                placeholder="Describe the image..."
                className={inputClass}
              />
            </div>
          </div>
        </div>
      )}

      {/* Video Editing */}
      {isVideo && (
        <div className="px-4 py-3 space-y-2 border-b border-gray-100">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <Video className="w-3 h-3" /> Video
          </label>
          <div>
            <span className="text-[10px] text-gray-400 uppercase">Source URL</span>
            <input
              type="text"
              value={videoSrc}
              onChange={(e) => handleVideoSrcChange(e.target.value)}
              placeholder="https://..."
              className={inputClass}
            />
          </div>
        </div>
      )}

      {/* Element Actions — always shown */}
      <div className="px-4 py-3 space-y-2">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Actions
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={handleDuplicateElement}
            className="flex items-center justify-center gap-1 text-xs font-medium px-2 py-1.5 rounded-md border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors"
            title="Duplicate element"
          >
            <Copy className="w-3 h-3" /> Clone
          </button>
          <button
            onClick={handleHideElement}
            className="flex items-center justify-center gap-1 text-xs font-medium px-2 py-1.5 rounded-md border border-amber-200 text-amber-600 hover:bg-amber-50 transition-colors"
            title="Hide element"
          >
            <EyeOff className="w-3 h-3" /> Hide
          </button>
          <button
            onClick={handleCopyStyles}
            className="flex items-center justify-center gap-1 text-xs font-medium px-2 py-1.5 rounded-md border border-teal-200 text-teal-600 hover:bg-teal-50 transition-colors"
            title="Copy styles from this element"
          >
            <Clipboard className="w-3 h-3" /> Copy Style
          </button>
          <button
            onClick={handlePasteStyles}
            disabled={!hasCopiedStyles}
            className="flex items-center justify-center gap-1 text-xs font-medium px-2 py-1.5 rounded-md border border-teal-200 text-teal-600 hover:bg-teal-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Paste copied styles to this element"
          >
            <ClipboardPaste className="w-3 h-3" /> Paste Style
          </button>
          <button
            onClick={handleDeleteElement}
            className="flex items-center justify-center gap-1 text-xs font-medium px-2 py-1.5 rounded-md border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
            title="Delete element"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </button>
          <button
            onClick={deselectElement}
            className="flex items-center justify-center gap-1 text-xs font-medium px-2 py-1.5 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
            title="Deselect element"
          >
            <X className="w-3 h-3" /> Deselect
          </button>
        </div>
      </div>
    </div>
  );
}
