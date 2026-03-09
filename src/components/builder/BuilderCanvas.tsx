"use client";

import { useBuilder, DEFAULT_VIEWPORT_WIDTH, DEFAULT_VIEWPORT_HEIGHT } from "./BuilderContext";

export default function BuilderCanvas() {
  const {
    iframeRef,
    iframeKey,
    translation,
    isSource,
    pageId,
    handleIframeLoad,
    viewportConfig,
  } = useBuilder();

  const previewId = isSource ? `source_${pageId}` : translation.id;
  const previewUrl = `/api/preview/${previewId}?v=${iframeKey}`;

  const isFixedViewport = viewportConfig.device !== "desktop";
  const width = viewportConfig.width || DEFAULT_VIEWPORT_WIDTH;
  const height = viewportConfig.height || DEFAULT_VIEWPORT_HEIGHT;

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-gray-100 overflow-hidden">
      <div
        className={`flex-1 overflow-auto ${
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
        <iframe
          ref={iframeRef}
          key={iframeKey}
          src={previewUrl}
          className={
            isFixedViewport
              ? `border border-gray-300 rounded-lg shadow-lg bg-white shrink-0`
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
    </div>
  );
}
