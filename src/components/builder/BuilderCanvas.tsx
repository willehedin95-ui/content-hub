"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useBuilder, DEFAULT_VIEWPORT_WIDTH, DEFAULT_VIEWPORT_HEIGHT } from "./BuilderContext";

// Inline tags that should be skipped when finding a drop target
const INLINE_TAGS = new Set([
  "SPAN", "EM", "STRONG", "B", "I", "U", "A", "SMALL", "SUB", "SUP",
  "ABBR", "CITE", "CODE", "MARK", "S", "DEL", "INS", "BR", "WBR",
]);

type DropIndicator = { top: number; left: number; width: number };
type DropTarget = { el: HTMLElement; position: "before" | "after" };

export default function BuilderCanvas() {
  const {
    iframeRef,
    iframeKey,
    translation,
    isSource,
    pageId,
    handleIframeLoad,
    viewportConfig,
    isDraggingFromComponents,
    setIsDraggingFromComponents,
    dragComponentRef,
    insertAtPosition,
    zoom,
    setZoom,
  } = useBuilder();

  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const previewId = isSource ? `source_${pageId}` : translation.id;
  const previewUrl = `/api/preview/${previewId}?v=${iframeKey}`;

  const isFixedViewport = viewportConfig.device !== "desktop";
  const width = viewportConfig.width || DEFAULT_VIEWPORT_WIDTH;
  const height = viewportConfig.height || DEFAULT_VIEWPORT_HEIGHT;
  const scale = zoom / 100;

  // Ctrl/Cmd + scroll wheel to zoom
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    function handleWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -10 : 10;
      setZoom((prev: number) => Math.max(50, Math.min(200, prev + delta)));
    }
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [setZoom]);

  // Walk up from an element to find the nearest block-level ancestor
  const findBlockAncestor = useCallback((el: HTMLElement, body: HTMLElement): HTMLElement | null => {
    let current: HTMLElement | null = el;
    while (current && current !== body) {
      if (!INLINE_TAGS.has(current.tagName)) return current;
      current = current.parentElement;
    }
    return null;
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";

      const iframe = iframeRef.current;
      if (!iframe) return;
      const iframeDoc = iframe.contentDocument;
      if (!iframeDoc?.body) return;

      const iframeRect = iframe.getBoundingClientRect();
      // Translate mouse position to iframe coordinate space, accounting for zoom
      const x = (e.clientX - iframeRect.left) / scale;
      const y = (e.clientY - iframeRect.top) / scale;

      const targetEl = iframeDoc.elementFromPoint(x, y) as HTMLElement | null;
      if (!targetEl) {
        setDropIndicator(null);
        dropTargetRef.current = null;
        return;
      }

      const blockEl = findBlockAncestor(targetEl, iframeDoc.body);
      if (!blockEl) {
        // Mouse is directly on body — treat as append at end
        const lastChild = iframeDoc.body.lastElementChild as HTMLElement | null;
        if (lastChild) {
          dropTargetRef.current = { el: lastChild, position: "after" };
          const lastRect = lastChild.getBoundingClientRect();
          setDropIndicator({
            top: iframeRect.top + lastRect.bottom * scale,
            left: iframeRect.left + lastRect.left * scale,
            width: lastRect.width * scale,
          });
        }
        return;
      }

      // Determine before/after based on mouse Y relative to element midpoint
      const blockRect = blockEl.getBoundingClientRect();
      const midpoint = blockRect.top + blockRect.height / 2;
      const position: "before" | "after" = y < midpoint ? "before" : "after";

      dropTargetRef.current = { el: blockEl, position };

      // Position the indicator line (viewport-relative for fixed positioning)
      const indicatorY =
        position === "before"
          ? iframeRect.top + blockRect.top * scale
          : iframeRect.top + blockRect.bottom * scale;

      setDropIndicator({
        top: indicatorY,
        left: iframeRect.left + blockRect.left * scale,
        width: blockRect.width * scale,
      });
    },
    [iframeRef, findBlockAncestor, scale]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const payload = dragComponentRef.current;
      const target = dropTargetRef.current;

      if (payload && target) {
        insertAtPosition(target.el, target.position, payload);
      }

      // Clean up
      setDropIndicator(null);
      dropTargetRef.current = null;
      dragComponentRef.current = null;
      setIsDraggingFromComponents(false);
    },
    [dragComponentRef, insertAtPosition, setIsDraggingFromComponents]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      // Only clear if actually leaving the overlay (not entering a child)
      if (e.currentTarget === e.target) {
        setDropIndicator(null);
        dropTargetRef.current = null;
      }
    },
    []
  );

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-gray-100 overflow-hidden">
      <div
        ref={scrollContainerRef}
        className={`flex-1 overflow-auto relative ${
          isFixedViewport ? "flex justify-center items-start p-8" : ""
        }`}
      >
        {/*
          Security note: allow-scripts + allow-same-origin is required for the editor
          to access iframe contentDocument. This is safe because:
          1. iframe src is same-origin (/api/preview/)
          2. Content is user's own authenticated pages
          3. No external/untrusted content is loaded
        */}
        <div
          style={zoom !== 100 ? {
            transform: `scale(${scale})`,
            transformOrigin: isFixedViewport ? "top center" : "0 0",
            ...(isFixedViewport ? {
              // Compensate layout for mobile: adjust margins so parent flexbox
              // centers the visual size correctly
              width: `${width}px`,
              height: `${height}px`,
              marginRight: `${width * (scale - 1)}px`,
              marginBottom: `${height * (scale - 1)}px`,
            } : {
              // Desktop: fill container, let transform handle visual scaling
              width: "100%",
              height: "100%",
            }),
          } : (isFixedViewport ? undefined : { width: "100%", height: "100%" })}
        >
          <iframe
            ref={iframeRef}
            key={iframeKey}
            src={previewUrl}
            className={
              isFixedViewport
                ? "border border-gray-300 rounded-lg shadow-lg bg-white shrink-0"
                : "w-full h-full border-0"
            }
            style={
              isFixedViewport
                ? { width: `${width}px`, height: `${height}px` }
                : undefined
            }
            sandbox="allow-scripts allow-same-origin"
            onLoad={handleIframeLoad}
          />
        </div>

        {/* Transparent overlay to catch drag events over the iframe */}
        {isDraggingFromComponents && (
          <div
            className="absolute inset-0 z-10"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragLeave={handleDragLeave}
          />
        )}
      </div>

      {/* Drop indicator line — fixed position so it works above everything */}
      {dropIndicator && (
        <div
          className="fixed pointer-events-none z-50 bg-indigo-500"
          style={{
            top: `${dropIndicator.top}px`,
            left: `${dropIndicator.left}px`,
            width: `${dropIndicator.width}px`,
            height: "2px",
          }}
        >
          <div className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-indigo-500" />
          <div className="absolute -right-1 -top-[3px] w-2 h-2 rounded-full bg-indigo-500" />
        </div>
      )}
    </div>
  );
}
