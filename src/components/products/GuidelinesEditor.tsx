"use client";

import { useState } from "react";
import { Plus, Save, Trash2, Loader2, Globe, Package } from "lucide-react";
import type { CopywritingGuideline } from "@/types";

interface Props {
  productId: string;
  guidelines: CopywritingGuideline[];
  onGuidelinesChange: (guidelines: CopywritingGuideline[]) => void;
}

export default function GuidelinesEditor({
  productId,
  guidelines,
  onGuidelinesChange,
}: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newIsGlobal, setNewIsGlobal] = useState(false);

  // Local edits for each guideline
  const [edits, setEdits] = useState<Record<string, { name: string; content: string }>>({});

  async function handleCreate() {
    if (!newName.trim() || !newContent.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/products/${productId}/guidelines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          content: newContent.trim(),
          is_global: newIsGlobal,
        }),
      });
      if (res.ok) {
        const guideline = await res.json();
        onGuidelinesChange([...guidelines, guideline]);
        setNewName("");
        setNewContent("");
        setNewIsGlobal(false);
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleSave(id: string) {
    const edit = edits[id];
    if (!edit) return;
    setSaving(id);
    try {
      const res = await fetch(
        `/api/products/${productId}/guidelines/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(edit),
        }
      );
      if (res.ok) {
        const updated = await res.json();
        onGuidelinesChange(
          guidelines.map((g) => (g.id === id ? updated : g))
        );
        setEditing(null);
        setEdits((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(
        `/api/products/${productId}/guidelines/${id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        onGuidelinesChange(guidelines.filter((g) => g.id !== id));
      }
    } finally {
      setDeleting(null);
    }
  }

  function startEditing(guideline: CopywritingGuideline) {
    setEditing(guideline.id);
    setEdits((prev) => ({
      ...prev,
      [guideline.id]: { name: guideline.name, content: guideline.content },
    }));
  }

  const globalGuidelines = guidelines.filter((g) => !g.product_id);
  const productGuidelines = guidelines.filter((g) => g.product_id);

  return (
    <div className="space-y-6">
      {/* Global guidelines */}
      {globalGuidelines.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Globe className="w-3 h-3" />
            Global Guidelines
          </h3>
          <div className="space-y-3">
            {globalGuidelines.map((g) => (
              <GuidelineCard
                key={g.id}
                guideline={g}
                editing={editing === g.id}
                edit={edits[g.id]}
                saving={saving === g.id}
                deleting={deleting === g.id}
                onStartEdit={() => startEditing(g)}
                onEditChange={(edit) =>
                  setEdits((prev) => ({ ...prev, [g.id]: edit }))
                }
                onSave={() => handleSave(g.id)}
                onDelete={() => handleDelete(g.id)}
                onCancel={() => {
                  setEditing(null);
                  setEdits((prev) => {
                    const next = { ...prev };
                    delete next[g.id];
                    return next;
                  });
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Product-specific guidelines */}
      {productGuidelines.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Package className="w-3 h-3" />
            Product-Specific Guidelines
          </h3>
          <div className="space-y-3">
            {productGuidelines.map((g) => (
              <GuidelineCard
                key={g.id}
                guideline={g}
                editing={editing === g.id}
                edit={edits[g.id]}
                saving={saving === g.id}
                deleting={deleting === g.id}
                onStartEdit={() => startEditing(g)}
                onEditChange={(edit) =>
                  setEdits((prev) => ({ ...prev, [g.id]: edit }))
                }
                onSave={() => handleSave(g.id)}
                onDelete={() => handleDelete(g.id)}
                onCancel={() => {
                  setEditing(null);
                  setEdits((prev) => {
                    const next = { ...prev };
                    delete next[g.id];
                    return next;
                  });
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Add new */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Guideline
        </h3>
        <div className="space-y-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder='Name (e.g. "Brand Voice", "Tone of Voice")'
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
          />
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Write your copywriting guidelines in markdown..."
            rows={8}
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 font-mono resize-y"
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={newIsGlobal}
                onChange={(e) => setNewIsGlobal(e.target.checked)}
                className="rounded border-gray-300"
              />
              Global (applies to all products)
            </label>
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim() || !newContent.trim()}
              className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GuidelineCard({
  guideline,
  editing,
  edit,
  saving,
  deleting,
  onStartEdit,
  onEditChange,
  onSave,
  onDelete,
  onCancel,
}: {
  guideline: CopywritingGuideline;
  editing: boolean;
  edit?: { name: string; content: string };
  saving: boolean;
  deleting: boolean;
  onStartEdit: () => void;
  onEditChange: (edit: { name: string; content: string }) => void;
  onSave: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  if (editing && edit) {
    return (
      <div className="bg-white border border-indigo-200 rounded-xl p-4 shadow-sm">
        <input
          type="text"
          value={edit.name}
          onChange={(e) => onEditChange({ ...edit, name: e.target.value })}
          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:border-indigo-500 mb-2"
        />
        <textarea
          value={edit.content}
          onChange={(e) => onEditChange({ ...edit, content: e.target.value })}
          rows={10}
          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 font-mono resize-y"
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-1.5 bg-indigo-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save
          </button>
          <button
            onClick={onCancel}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm group">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-900">{guideline.name}</h4>
          <p className="text-xs text-gray-400 mt-1 line-clamp-2 whitespace-pre-wrap">
            {guideline.content.slice(0, 200)}
            {guideline.content.length > 200 && "..."}
          </p>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-3">
          <button
            onClick={onStartEdit}
            className="text-xs text-gray-500 hover:text-indigo-600 px-2 py-1 rounded hover:bg-gray-50"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-gray-50"
          >
            {deleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
