"use client";

import { useBuilder } from "./BuilderContext";

export default function BuilderCanvas() {
  const {
    iframeRef,
    iframeKey,
    viewMode,
    translation,
    isSource,
    pageId,
    handleIframeLoad,
  } = useBuilder();

  const previewId = isSource ? `source_${pageId}` : translation.id;
  const previewUrl = `/api/preview/${previewId}?v=${iframeKey}`;

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-gray-100 overflow-hidden">
      <div
        className={`flex-1 overflow-auto ${
          viewMode === "mobile" ? "flex justify-center items-start p-8" : ""
        }`}
      >
        <iframe
          ref={iframeRef}
          key={iframeKey}
          src={previewUrl}
          className={
            viewMode === "mobile"
              ? "w-[375px] h-[812px] border border-gray-300 rounded-lg shadow-lg bg-white shrink-0"
              : "w-full h-full border-0"
          }
          sandbox="allow-scripts allow-same-origin"
          onLoad={handleIframeLoad}
        />
      </div>
    </div>
  );
}
