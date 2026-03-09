"use client";

import { useEffect, useRef } from "react";
import {
  Copy,
  ClipboardPaste,
  CopyPlus,
  Pencil,
  Trash2,
  Group,
  Save,
} from "lucide-react";
import { useBuilder } from "../BuilderContext";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
  action: () => void;
}

// ---------------------------------------------------------------------------
// ContextMenu
// ---------------------------------------------------------------------------

export default function ContextMenu() {
  const {
    contextMenu,
    closeContextMenu,
    handleCopyElement,
    handlePasteElement,
    handleDuplicateElement,
    handleDeleteElement,
    handleGroupElement,
    startRenameElement,
    handleSaveAsComponent,
    copiedHtmlRef,
  } = useBuilder();

  const menuRef = useRef<HTMLDivElement>(null);

  // Close on mousedown outside (use setTimeout(0) to avoid the opening click closing it)
  useEffect(() => {
    if (!contextMenu) return;

    const timer = setTimeout(() => {
      function handleMouseDown(e: MouseEvent) {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          closeContextMenu();
        }
      }
      window.addEventListener("mousedown", handleMouseDown);
      // Store cleanup ref
      cleanupRef.current = () => {
        window.removeEventListener("mousedown", handleMouseDown);
      };
    }, 0);

    const cleanupRef = { current: () => {} };

    return () => {
      clearTimeout(timer);
      cleanupRef.current();
    };
  }, [contextMenu, closeContextMenu]);

  if (!contextMenu) return null;

  const hasCopied = copiedHtmlRef.current !== null;

  const items: MenuItem[] = [
    {
      label: "Copy",
      icon: <Copy className="w-4 h-4" />,
      shortcut: "\u2318C",
      action: () => {
        handleCopyElement();
        closeContextMenu();
      },
    },
    {
      label: "Paste",
      icon: <ClipboardPaste className="w-4 h-4" />,
      shortcut: "\u2318V",
      disabled: !hasCopied,
      action: () => {
        handlePasteElement();
        closeContextMenu();
      },
    },
    {
      label: "Duplicate",
      icon: <CopyPlus className="w-4 h-4" />,
      shortcut: "\u2318D",
      action: () => {
        handleDuplicateElement();
        closeContextMenu();
      },
    },
    {
      label: "Rename",
      icon: <Pencil className="w-4 h-4" />,
      action: () => {
        startRenameElement();
        // closeContextMenu is called inside startRenameElement
      },
    },
    {
      label: "Delete",
      icon: <Trash2 className="w-4 h-4" />,
      shortcut: "\u232B",
      separator: true,
      action: () => {
        handleDeleteElement();
        closeContextMenu();
      },
    },
    {
      label: "Group Into Container",
      icon: <Group className="w-4 h-4" />,
      shortcut: "\u2318G",
      separator: true,
      action: () => {
        handleGroupElement();
        closeContextMenu();
      },
    },
    {
      label: "Save as Component",
      icon: <Save className="w-4 h-4" />,
      shortcut: "\u2318\u21E7S",
      action: () => {
        handleSaveAsComponent();
        // closeContextMenu is called inside handleSaveAsComponent
      },
    },
  ];

  // Clamp position to viewport
  const menuWidth = 208; // w-52 = 13rem = 208px
  const menuHeight = items.length * 36 + 16; // approximate
  const x = Math.min(contextMenu.x, window.innerWidth - menuWidth - 8);
  const y = Math.min(contextMenu.y, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={menuRef}
      className="fixed w-52 bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-[9999]"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.separator && (
            <div className="border-t border-gray-100 my-1" />
          )}
          <button
            onClick={item.action}
            disabled={item.disabled}
            className={`flex items-center w-full px-3 py-2 text-left text-sm transition-colors ${
              item.disabled
                ? "text-gray-300 cursor-not-allowed"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <span className={`shrink-0 mr-2.5 ${item.disabled ? "text-gray-300" : "text-gray-500"}`}>
              {item.icon}
            </span>
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className={`text-xs ml-2 ${item.disabled ? "text-gray-300" : "text-gray-400"}`}>
                {item.shortcut}
              </span>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
