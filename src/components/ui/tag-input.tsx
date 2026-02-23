"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { X } from "lucide-react";

const TAG_COLORS = [
  { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" },
  { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
];

export function getTagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export function TagBadge({ tag }: { tag: string }) {
  const color = getTagColor(tag);
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border font-medium ${color.bg} ${color.text} ${color.border}`}
    >
      {tag}
    </span>
  );
}

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onBlur?: () => void;
}

export default function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Add tags...",
  disabled = false,
  autoFocus = false,
  onBlur,
}: TagInputProps) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter suggestions: not already selected, matches typed text
  const filtered = suggestions.filter(
    (s) => !value.includes(s) && s.toLowerCase().includes(input.toLowerCase())
  );
  const exactMatch = suggestions.some((s) => s.toLowerCase() === input.trim().toLowerCase());
  const showCreate = input.trim() && !exactMatch && !value.includes(input.trim().toLowerCase());

  // Close dropdown on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        onBlur?.();
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [onBlur]);

  // Auto-focus
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [input]);

  function addTag(tag: string) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized || value.includes(normalized)) return;
    onChange([...value, normalized]);
    setInput("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const totalItems = filtered.length + (showCreate ? 1 : 0);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlightIndex((i) => (i + 1) % Math.max(totalItems, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i - 1 + Math.max(totalItems, 1)) % Math.max(totalItems, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && filtered.length > 0 && highlightIndex < filtered.length) {
        addTag(filtered[highlightIndex]);
      } else if (input.trim()) {
        addTag(input.trim());
      }
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      removeTag(value[value.length - 1]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex flex-wrap items-center gap-1.5 border rounded-lg bg-white px-2 py-1.5 transition-colors ${
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-text"
        } ${open ? "border-indigo-500 ring-1 ring-indigo-500" : "border-gray-300"}`}
        onClick={() => !disabled && inputRef.current?.focus()}
      >
        {value.map((tag) => {
          const color = getTagColor(tag);
          return (
            <span
              key={tag}
              className={`text-xs px-2 py-0.5 rounded-full border font-medium inline-flex items-center gap-1 ${color.bg} ${color.text} ${color.border}`}
            >
              {tag}
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTag(tag);
                  }}
                  className="hover:bg-black/10 rounded-full p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          );
        })}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          disabled={disabled}
          className="flex-1 min-w-[80px] text-sm outline-none bg-transparent placeholder:text-gray-400"
        />
      </div>

      {/* Dropdown */}
      {open && (filtered.length > 0 || showCreate) && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((tag, i) => {
            const color = getTagColor(tag);
            return (
              <button
                key={tag}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addTag(tag)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                  i === highlightIndex ? "bg-gray-50" : "hover:bg-gray-50"
                }`}
              >
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border font-medium ${color.bg} ${color.text} ${color.border}`}
                >
                  {tag}
                </span>
              </button>
            );
          })}
          {showCreate && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(input.trim())}
              className={`w-full text-left px-3 py-2 text-sm text-gray-500 transition-colors ${
                highlightIndex === filtered.length ? "bg-gray-50" : "hover:bg-gray-50"
              }`}
            >
              Create &quot;{input.trim().toLowerCase()}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
