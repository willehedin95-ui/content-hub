"use client";

import { useState, useRef, useEffect } from "react";
import { Pencil } from "lucide-react";

interface Props {
  pageId: string;
  initialName: string;
}

export default function EditablePageName({ pageId, initialName }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === savedName) {
      setName(savedName);
      setEditing(false);
      return;
    }

    const res = await fetch(`/api/pages/${pageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });

    if (res.ok) {
      setSavedName(trimmed);
      setName(trimmed);
    } else {
      setName(savedName);
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setName(savedName);
            setEditing(false);
          }
        }}
        className="text-2xl font-bold text-white bg-transparent border-b border-indigo-500 outline-none w-full"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center gap-2 text-left"
    >
      <h1 className="text-2xl font-bold text-white">{savedName}</h1>
      <Pencil className="w-3.5 h-3.5 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}
