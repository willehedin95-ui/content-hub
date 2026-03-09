"use client";

import { useBuilder } from "../BuilderContext";
import { Layers, Plus, Settings } from "lucide-react";
import LayersTab from "./LayersTab";
import ComponentsTab from "./ComponentsTab";
import SettingsTab from "./SettingsTab";

const TABS = [
  { id: "layers" as const, icon: Layers, label: "Layers" },
  { id: "components" as const, icon: Plus, label: "Components" },
  { id: "settings" as const, icon: Settings, label: "Settings" },
];

export default function LeftSidebar() {
  const { leftTab, setLeftTab, leftSidebarOpen, setLeftSidebarOpen } =
    useBuilder();

  if (!leftSidebarOpen) {
    return (
      <div className="w-10 border-r border-gray-200 bg-white shrink-0 flex flex-col items-center pt-2 gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setLeftTab(tab.id);
              setLeftSidebarOpen(true);
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

  return (
    <div className="w-[280px] border-r border-gray-200 bg-white shrink-0 flex flex-col">
      <div className="flex border-b border-gray-200 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setLeftTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
              leftTab === tab.id
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
        {leftTab === "layers" && <LayersTab />}
        {leftTab === "components" && <ComponentsTab />}
        {leftTab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}
