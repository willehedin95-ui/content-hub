"use client";

import { useBuilder } from "../BuilderContext";
import { Paintbrush, Settings2, Sparkles } from "lucide-react";
import DesignTab from "./DesignTab";
import ConfigTab from "./ConfigTab";
import AITab from "./AITab";
import ImagePanel from "@/components/pages/ImagePanel";
import VideoPanel from "@/components/pages/VideoPanel";

const TABS = [
  { id: "design" as const, icon: Paintbrush, label: "Design" },
  { id: "config" as const, icon: Settings2, label: "Config" },
  { id: "ai" as const, icon: Sparkles, label: "AI" },
];

export default function RightPanel() {
  const {
    rightTab,
    setRightTab,
    rightPanelOpen,
    setRightPanelOpen,
    hasSelectedEl,
    clickedImage,
    clickedVideo,
    setClickedImage,
    setClickedVideo,
    iframeRef,
    translation,
    language,
    pageProduct,
    isSource,
    markDirty,
    setBgImageTranslating,
    originalHtml,
  } = useBuilder();

  if (!rightPanelOpen) {
    return (
      <div className="w-10 border-l border-gray-200 bg-white shrink-0 flex flex-col items-center pt-2 gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setRightTab(tab.id);
              setRightPanelOpen(true);
            }}
            className="p-2 rounded hover:bg-gray-100 text-gray-500"
            title={tab.label}
          >
            <tab.icon className="w-4 h-4" />
          </button>
        ))}
      </div>
    );
  }

  // Media panels take over the right panel when image/video is clicked
  if (clickedImage) {
    return (
      <div className="w-[320px] border-l border-gray-200 bg-white shrink-0 flex flex-col overflow-y-auto">
        <ImagePanel
          iframeRef={iframeRef}
          translationId={translation.id}
          language={language}
          clickedImage={clickedImage}
          originalHtml={originalHtml}
          onClickedImageClear={() => setClickedImage(null)}
          onImageReplaced={markDirty}
          onImageTranslating={setBgImageTranslating}
          isSource={isSource}
          pageProduct={pageProduct}
        />
      </div>
    );
  }

  if (clickedVideo) {
    return (
      <div className="w-[320px] border-l border-gray-200 bg-white shrink-0 flex flex-col overflow-y-auto">
        <VideoPanel
          iframeRef={iframeRef}
          translationId={translation.id}
          clickedVideo={clickedVideo}
          onClickedVideoClear={() => setClickedVideo(null)}
          onVideoReplaced={markDirty}
        />
      </div>
    );
  }

  return (
    <div className="w-[320px] border-l border-gray-200 bg-white shrink-0 flex flex-col">
      <div className="flex border-b border-gray-200 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setRightTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
              rightTab === tab.id
                ? "text-indigo-600 border-b-2 border-indigo-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {!hasSelectedEl ? (
          <div className="p-6 text-center text-sm text-gray-400">
            Click an element on the canvas to edit its properties
          </div>
        ) : (
          <>
            {rightTab === "design" && <DesignTab />}
            {rightTab === "config" && <ConfigTab />}
            {rightTab === "ai" && <AITab />}
          </>
        )}
      </div>
    </div>
  );
}
