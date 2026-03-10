"use client";

import { useState } from "react";
import {
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useBuilder } from "../BuilderContext";
import { BLOCKS, type BlockDef } from "../block-definitions";

// ---------------------------------------------------------------------------
// ComponentsTab
// ---------------------------------------------------------------------------

export default function ComponentsTab() {
  const {
    hasSelectedEl,
    selectedElRef,
    iframeRef,
    markDirty,
    pushUndoSnapshot,
    savedComponents,
    setSavedComponents,
    insertSavedComponent,
    dragComponentRef,
    setIsDraggingFromComponents,
  } = useBuilder();

  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Filter both saved and basic by search
  const q = search.toLowerCase();
  const filteredSaved = savedComponents.filter((c) =>
    c.name.toLowerCase().includes(q)
  );
  const filteredBlocks = BLOCKS.filter((b) =>
    b.label.toLowerCase().includes(q)
  );

  function handleInsert(block: BlockDef) {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;

    pushUndoSnapshot();
    const newEl = block.insert(doc);

    if (hasSelectedEl && selectedElRef.current) {
      const target = selectedElRef.current;
      target.parentNode?.insertBefore(newEl, target.nextSibling);
    } else {
      doc.body.appendChild(newEl);
    }

    markDirty();
  }

  async function handleDeleteComponent(id: string) {
    await fetch(`/api/saved-components/${id}`, { method: "DELETE" });
    setSavedComponents((prev) => prev.filter((c) => c.id !== id));
    setMenuOpen(null);
  }

  async function handleRenameComponent(id: string) {
    if (!renameValue.trim()) {
      setRenaming(null);
      return;
    }
    const res = await fetch(`/api/saved-components/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameValue.trim() }),
    });
    if (res.ok) {
      const updated = await res.json();
      setSavedComponents((prev) =>
        prev.map((c) => (c.id === id ? updated : c))
      );
    }
    setRenaming(null);
    setMenuOpen(null);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search components..."
            className="w-full pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-100"
            >
              <X className="w-3 h-3 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <p className="text-[11px] text-gray-400 mb-3">
          {hasSelectedEl
            ? "Inserts after selected element"
            : "Inserts at end of page"}
        </p>

        {/* Saved Components */}
        {filteredSaved.length > 0 && (
          <>
            <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Saved
            </h4>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {filteredSaved.map((comp) => (
                <div
                  key={comp.id}
                  className="group relative"
                  draggable
                  onDragStart={(e) => {
                    dragComponentRef.current = { type: "saved", html: comp.html };
                    e.dataTransfer.effectAllowed = "copy";
                    setIsDraggingFromComponents(true);
                  }}
                  onDragEnd={() => {
                    dragComponentRef.current = null;
                    setIsDraggingFromComponents(false);
                  }}
                >
                  <button
                    onClick={() => insertSavedComponent(comp.html)}
                    className="w-full flex flex-col rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors overflow-hidden text-left"
                  >
                    {/* Saved badge */}
                    <div className="px-2 pt-2">
                      <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold text-cyan-600 bg-cyan-50 rounded">
                        Saved
                      </span>
                    </div>

                    {/* Thumbnail */}
                    <div className="w-full h-20 flex items-center justify-center px-2 py-1">
                      {comp.thumbnail_url ? (
                        <img
                          src={comp.thumbnail_url}
                          alt={comp.name}
                          className="max-w-full max-h-full object-contain rounded"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-100 rounded flex items-center justify-center text-gray-400 text-[10px]">
                          No preview
                        </div>
                      )}
                    </div>

                    {/* Name */}
                    <div className="px-2 pb-2 pt-1">
                      {renaming === comp.id ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => handleRenameComponent(comp.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              handleRenameComponent(comp.id);
                            if (e.key === "Escape") setRenaming(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] w-full border border-indigo-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        />
                      ) : (
                        <span className="text-[11px] font-medium text-gray-700 truncate block">
                          {comp.name}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Three-dot menu */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(menuOpen === comp.id ? null : comp.id);
                      }}
                      className="p-1 rounded bg-white/80 hover:bg-gray-100 shadow-sm border border-gray-200"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5 text-gray-500" />
                    </button>

                    {menuOpen === comp.id && (
                      <div className="absolute right-0 top-7 w-32 bg-white border border-gray-200 rounded-md shadow-lg py-1 z-10">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenaming(comp.id);
                            setRenameValue(comp.name);
                            setMenuOpen(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                        >
                          <Pencil className="w-3 h-3" /> Rename
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteComponent(comp.id);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Basic Elements */}
        {filteredBlocks.length > 0 && (
          <>
            <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Basic Elements
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {filteredBlocks.map((block) => (
                <button
                  key={block.id}
                  draggable
                  onDragStart={(e) => {
                    dragComponentRef.current = { type: "block", blockId: block.id };
                    e.dataTransfer.effectAllowed = "copy";
                    setIsDraggingFromComponents(true);
                  }}
                  onDragEnd={() => {
                    dragComponentRef.current = null;
                    setIsDraggingFromComponents(false);
                  }}
                  onClick={() => handleInsert(block)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors text-gray-600 hover:text-gray-900 cursor-grab active:cursor-grabbing"
                >
                  <block.icon className="w-5 h-5" />
                  <span className="text-[11px] font-medium">{block.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Empty state */}
        {filteredSaved.length === 0 && filteredBlocks.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-8">
            No components match &ldquo;{search}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}
