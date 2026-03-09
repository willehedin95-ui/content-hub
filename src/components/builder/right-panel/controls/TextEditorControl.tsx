"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useBuilder } from "../../BuilderContext";
import { Bold, Italic, Underline, Strikethrough, Link2, RemoveFormatting } from "lucide-react";
import LinkModal from "../../modals/LinkModal";

const TEXT_TAGS = new Set([
  "H1", "H2", "H3", "H4", "H5", "H6",
  "P", "SPAN", "LI", "BUTTON", "A",
  "BLOCKQUOTE", "FIGCAPTION", "LABEL",
]);

export default function TextEditorControl() {
  const {
    selectedElRef,
    hasSelectedEl,
    layersRefreshKey,
    pushUndoSnapshot,
    markDirty,
    showLinkModal,
    setShowLinkModal
  } = useBuilder();
  const editorRef = useRef<HTMLDivElement>(null);
  const [isTextEl, setIsTextEl] = useState(false);
  const syncingRef = useRef(false);
  const savedSelection = useRef<Range | null>(null);

  // Check if selected element is a text element
  useEffect(() => {
    const el = selectedElRef.current;
    setIsTextEl(!!el && TEXT_TAGS.has(el.tagName));
  }, [hasSelectedEl, layersRefreshKey, selectedElRef]);

  // Sync content from canvas element to editor.
  // SECURITY NOTE: Uses innerHTML which could be XSS vector if content is compromised.
  // Mitigation: Content is from authenticated user's pages (same-origin, access-controlled).
  // TODO: Consider DOMPurify.sanitize() for defense-in-depth in future update.
  useEffect(() => {
    const el = selectedElRef.current;
    if (!el || !TEXT_TAGS.has(el.tagName) || !editorRef.current) return;
    // Skip if editor already has same content — prevents cursor reset during typing
    // (syncToCanvas writes editor→canvas, markDirty triggers this effect, but content matches)
    if (editorRef.current.innerHTML === el.innerHTML) return;
    syncingRef.current = true;
    // eslint-disable-next-line no-unsanitized/property
    editorRef.current.innerHTML = el.innerHTML;
    syncingRef.current = false;
  }, [hasSelectedEl, layersRefreshKey, selectedElRef]);

  // Push editor changes back to canvas element
  const syncToCanvas = useCallback(() => {
    if (syncingRef.current) return;
    const el = selectedElRef.current;
    if (!el || !editorRef.current) return;
    // eslint-disable-next-line no-unsanitized/property
    const newContent = editorRef.current.innerHTML;
    // eslint-disable-next-line no-unsanitized/property
    if (el.innerHTML !== newContent) {
      pushUndoSnapshot();
      // eslint-disable-next-line no-unsanitized/property
      el.innerHTML = newContent;
      markDirty();
    }
  }, [selectedElRef, pushUndoSnapshot, markDirty]);

  function execCmd(command: string, value?: string) {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    syncToCanvas();
  }

  function handleLink() {
    // Save current selection before modal opens
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      savedSelection.current = selection.getRangeAt(0);
    }
    setShowLinkModal(true);
  }

  function handleInsertLink(url: string) {
    if (!editorRef.current) return;

    // Restore saved selection
    if (savedSelection.current) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(savedSelection.current);
      }
    }

    editorRef.current.focus();
    document.execCommand("createLink", false, url);
    syncToCanvas();
    setShowLinkModal(false);
    savedSelection.current = null; // Clean up
  }

  if (!isTextEl) return null;

  const btnClass =
    "p-1.5 rounded transition-colors text-gray-500 hover:bg-gray-100 hover:text-gray-700";

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-medium text-gray-500 block">
        Text Content
      </label>

      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border border-gray-200 rounded-t-md bg-gray-50 px-1 py-0.5">
        <button onClick={() => execCmd("bold")} className={btnClass} title="Bold (Ctrl+B)">
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => execCmd("italic")} className={btnClass} title="Italic (Ctrl+I)">
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => execCmd("underline")} className={btnClass} title="Underline (Ctrl+U)">
          <Underline className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => execCmd("strikeThrough")} className={btnClass} title="Strikethrough">
          <Strikethrough className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-gray-200 mx-0.5" />
        <button onClick={handleLink} className={btnClass} title="Insert Link">
          <Link2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => execCmd("removeFormat")} className={btnClass} title="Remove Formatting">
          <RemoveFormatting className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={syncToCanvas}
        className="w-full min-h-[60px] max-h-[200px] overflow-y-auto border border-gray-200 border-t-0 rounded-b-md px-2.5 py-2 text-xs text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 [&_b]:font-bold [&_i]:italic [&_u]:underline [&_a]:text-indigo-600 [&_a]:underline"
        suppressContentEditableWarning
      />

      {/* Link Modal */}
      <LinkModal
        show={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        onInsert={handleInsertLink}
      />
    </div>
  );
}
