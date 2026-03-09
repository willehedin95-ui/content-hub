"use client";

import { BuilderProvider, type BuilderProps } from "./BuilderContext";
import BuilderTopBar from "./BuilderTopBar";
import BuilderCanvas from "./BuilderCanvas";
import BuilderStatusBar from "./BuilderStatusBar";
import LeftSidebar from "./left-sidebar/LeftSidebar";
import RightPanel from "./right-panel/RightPanel";

export default function BuilderShell(props: BuilderProps) {
  return (
    <BuilderProvider {...props}>
      <div className="flex flex-col h-full">
        <BuilderTopBar />
        <div className="flex flex-1 min-h-0">
          <LeftSidebar />
          <BuilderCanvas />
          <RightPanel />
        </div>
        <BuilderStatusBar />
      </div>
    </BuilderProvider>
  );
}
