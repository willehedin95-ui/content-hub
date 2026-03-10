"use client";

import { useState, useCallback, useEffect } from "react";
import { ChevronDown, ChevronRight, Monitor, Smartphone } from "lucide-react";
import { useBuilder } from "../BuilderContext";
import SpacingControl from "./controls/SpacingControl";
import SizeControl from "./controls/SizeControl";
import TypographyControl from "./controls/TypographyControl";
import BackgroundControl from "./controls/BackgroundControl";
import BorderControl from "./controls/BorderControl";
import EffectsControl from "./controls/EffectsControl";
import LayoutControl from "./controls/LayoutControl";
import PositionControl from "./controls/PositionControl";
import TextEditorControl from "./controls/TextEditorControl";

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
      >
        {open ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        {title}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

export default function DesignTab() {
  const { viewMode, setViewMode, selectedElRef, iframeRef, hasSelectedEl, layersRefreshKey } = useBuilder();

  // Detect if selected element is flex/grid for dynamic section title
  const [isFlexOrGrid, setIsFlexOrGrid] = useState(false);

  const getComputedValue = useCallback(
    (prop: string): string => {
      const el = selectedElRef.current;
      if (!el) return "";
      const doc = iframeRef.current?.contentDocument;
      if (!doc?.defaultView) return "";
      return doc.defaultView.getComputedStyle(el).getPropertyValue(prop);
    },
    [selectedElRef, iframeRef]
  );

  useEffect(() => {
    if (!hasSelectedEl) { setIsFlexOrGrid(false); return; }
    const d = getComputedValue("display");
    setIsFlexOrGrid(d === "flex" || d === "inline-flex" || d === "grid");
  }, [hasSelectedEl, layersRefreshKey, getComputedValue]);

  return (
    <div>
      {/* Responsive breakpoint indicator */}
      <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            Editing styles for
          </span>
          <div className="flex items-center bg-white rounded border border-gray-200 p-0.5">
            <button
              onClick={() => setViewMode("desktop")}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                viewMode === "desktop"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <Monitor className="w-3 h-3" />
              Desktop
            </button>
            <button
              onClick={() => setViewMode("mobile")}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                viewMode === "mobile"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <Smartphone className="w-3 h-3" />
              Mobile
            </button>
          </div>
        </div>
        <p className="text-[9px] text-gray-400 mt-0.5">
          {viewMode === "desktop" ? "min-width: 769px" : "max-width: 768px"}
        </p>
      </div>

      {/* Rich text editor — shown for text elements */}
      <div className="px-4 py-3 border-b border-gray-100">
        <TextEditorControl />
      </div>

      <Section title="Size">
        <SizeControl />
      </Section>
      <Section title={isFlexOrGrid ? "Auto Layout" : "Layout"} defaultOpen={isFlexOrGrid}>
        <LayoutControl />
      </Section>
      <Section title="Spacing">
        <SpacingControl />
      </Section>
      <Section title="Typography">
        <TypographyControl />
      </Section>
      <Section title="Background" defaultOpen={false}>
        <BackgroundControl />
      </Section>
      <Section title="Border" defaultOpen={false}>
        <BorderControl />
      </Section>
      <Section title="Effects" defaultOpen={false}>
        <EffectsControl />
      </Section>
      <Section title="Position" defaultOpen={false}>
        <PositionControl />
      </Section>
    </div>
  );
}
