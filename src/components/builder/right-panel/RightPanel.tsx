"use client";

import { useBuilder } from "../BuilderContext";
import { Paintbrush, Settings2, Sparkles, MousePointer } from "lucide-react";
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
          <div className="p-6 flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <MousePointer className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-500 mb-1">No element selected</p>
            <p className="text-xs text-gray-400 mb-4">Click an element on the canvas to edit its styles and properties</p>
            <div className="w-full text-left bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Quick shortcuts</p>
              <div className="grid grid-cols-2 gap-y-1.5 text-[11px] text-gray-500">
                <span><kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-[10px] font-mono">Ctrl+S</kbd> Save</span>
                <span><kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-[10px] font-mono">Ctrl+Z</kbd> Undo</span>
                <span><kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-[10px] font-mono">Ctrl+D</kbd> Duplicate</span>
                <span><kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-[10px] font-mono">Del</kbd> Delete</span>
                <span><kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-[10px] font-mono">Esc</kbd> Deselect</span>
                <span><kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-[10px] font-mono">Ctrl+G</kbd> Group</span>
              </div>
            </div>
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
