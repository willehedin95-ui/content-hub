"use client";

import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const SECTIONS = [
  {
    title: "General",
    shortcuts: [
      { keys: ["Ctrl", "S"], label: "Save" },
      { keys: ["Ctrl", "Z"], label: "Undo" },
      { keys: ["Ctrl", "Y"], label: "Redo" },
      { keys: ["Esc"], label: "Deselect" },
      { keys: ["?"], label: "Toggle this modal" },
    ],
  },
  {
    title: "Elements",
    shortcuts: [
      { keys: ["Del"], label: "Delete selected" },
      { keys: ["Ctrl", "D"], label: "Duplicate" },
      { keys: ["Ctrl", "C"], label: "Copy" },
      { keys: ["Ctrl", "V"], label: "Paste" },
      { keys: ["Ctrl", "G"], label: "Group into container" },
    ],
  },
  {
    title: "Selection",
    shortcuts: [
      { keys: ["Shift", "Click"], label: "Multi-select" },
      { keys: ["Ctrl", "Click"], label: "Toggle selection" },
      { keys: ["Ctrl", "A"], label: "Select all siblings" },
    ],
  },
  {
    title: "Canvas",
    shortcuts: [
      { keys: ["Ctrl", "Scroll"], label: "Zoom in/out" },
      { keys: ["Ctrl", "+"], label: "Zoom in" },
      { keys: ["Ctrl", "-"], label: "Zoom out" },
    ],
  },
];

export default function ShortcutsModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {section.title}
              </h3>
              <div className="space-y-1.5">
                {section.shortcuts.map((s) => (
                  <div
                    key={s.label}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm text-gray-700">{s.label}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((key) => (
                        <kbd
                          key={key}
                          className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono text-gray-600"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
