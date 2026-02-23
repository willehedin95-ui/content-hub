"use client";

import { useState } from "react";
import { Plus, Trash2, Loader2, ExternalLink } from "lucide-react";
import type { ReferencePage } from "@/types";

interface Props {
  productId: string;
  references: ReferencePage[];
  onReferencesChange: (references: ReferencePage[]) => void;
}

export default function ReferencePagesManager({
  productId,
  references,
  onReferencesChange,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newRef, setNewRef] = useState({
    name: "",
    url: "",
    content: "",
    notes: "",
  });

  async function handleCreate() {
    if (!newRef.name.trim() || !newRef.content.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/products/${productId}/references`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRef.name.trim(),
          url: newRef.url.trim() || null,
          content: newRef.content.trim(),
          notes: newRef.notes.trim() || null,
        }),
      });
      if (res.ok) {
        const ref = await res.json();
        onReferencesChange([...references, ref]);
        setNewRef({ name: "", url: "", content: "", notes: "" });
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(
        `/api/products/${productId}/references/${id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        onReferencesChange(references.filter((r) => r.id !== id));
      }
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Add reference pages that represent your ideal copywriting style. The
        Claude agent will learn from these examples when rewriting swiped pages.
      </p>

      {/* Existing references */}
      {references.length > 0 && (
        <div className="space-y-3">
          {references.map((ref) => (
            <div
              key={ref.id}
              className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-gray-900">
                      {ref.name}
                    </h4>
                    {ref.url && (
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-indigo-600"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  {ref.notes && (
                    <p className="text-xs text-gray-400 mt-0.5">{ref.notes}</p>
                  )}
                  <button
                    onClick={() =>
                      setExpanded(expanded === ref.id ? null : ref.id)
                    }
                    className="text-xs text-indigo-600 hover:text-indigo-800 mt-1"
                  >
                    {expanded === ref.id ? "Hide content" : "Show content"}
                  </button>
                  {expanded === ref.id && (
                    <pre className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap max-h-60 overflow-y-auto">
                      {ref.content}
                    </pre>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(ref.id)}
                  disabled={deleting === ref.id}
                  className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-gray-50 ml-3"
                >
                  {deleting === ref.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add new */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Reference Page
        </h3>
        <div className="space-y-3">
          <input
            type="text"
            value={newRef.name}
            onChange={(e) =>
              setNewRef((r) => ({ ...r, name: e.target.value }))
            }
            placeholder="Name (e.g. Best performing HappySleep page)"
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
          />
          <input
            type="url"
            value={newRef.url}
            onChange={(e) =>
              setNewRef((r) => ({ ...r, url: e.target.value }))
            }
            placeholder="Source URL (optional)"
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
          />
          <textarea
            value={newRef.content}
            onChange={(e) =>
              setNewRef((r) => ({ ...r, content: e.target.value }))
            }
            placeholder="Paste the page copy/text here..."
            rows={8}
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-y"
          />
          <input
            type="text"
            value={newRef.notes}
            onChange={(e) =>
              setNewRef((r) => ({ ...r, notes: e.target.value }))
            }
            placeholder="Notes — why is this a good example? (optional)"
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
          />
          <div className="flex justify-end">
            <button
              onClick={handleCreate}
              disabled={
                creating || !newRef.name.trim() || !newRef.content.trim()
              }
              className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Add Reference
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
