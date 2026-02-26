"use client";

import { useState } from "react";
import { Plus, Save, Trash2, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import type { ProductSegment } from "@/types";

interface Props {
  productId: string;
  segments: ProductSegment[];
  onSegmentsChange: (segments: ProductSegment[]) => void;
}

export default function SegmentEditor({
  productId,
  segments,
  onSegmentsChange,
}: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newSegment, setNewSegment] = useState({
    name: "",
    description: "",
    core_desire: "",
    core_constraints: "",
    demographics: "",
  });

  const [edits, setEdits] = useState<
    Record<string, { name: string; description: string; core_desire: string; core_constraints: string; demographics: string }>
  >({});

  async function handleCreate() {
    if (!newSegment.name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/products/${productId}/segments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSegment.name.trim(),
          description: newSegment.description.trim() || null,
          core_desire: newSegment.core_desire.trim() || null,
          core_constraints: newSegment.core_constraints.trim() || null,
          demographics: newSegment.demographics.trim() || null,
        }),
      });
      if (res.ok) {
        const segment = await res.json();
        onSegmentsChange([...segments, segment]);
        setNewSegment({ name: "", description: "", core_desire: "", core_constraints: "", demographics: "" });
        setShowForm(false);
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
      const res = await fetch(`/api/products/${productId}/segments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: edit.name.trim(),
          description: edit.description.trim() || null,
          core_desire: edit.core_desire.trim() || null,
          core_constraints: edit.core_constraints.trim() || null,
          demographics: edit.demographics.trim() || null,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        onSegmentsChange(segments.map((s) => (s.id === id ? updated : s)));
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
      const res = await fetch(`/api/products/${productId}/segments/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onSegmentsChange(segments.filter((s) => s.id !== id));
      }
    } finally {
      setDeleting(null);
    }
  }

  function startEditing(segment: ProductSegment) {
    setEditing(segment.id);
    setEdits((prev) => ({
      ...prev,
      [segment.id]: {
        name: segment.name,
        description: segment.description ?? "",
        core_desire: segment.core_desire ?? "",
        core_constraints: segment.core_constraints ?? "",
        demographics: segment.demographics ?? "",
      },
    }));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Define audience segments for this product. Segments are used when generating static ads — each segment targets a specific sub-group with tailored hooks, visuals, and emotional triggers.
      </p>

      {/* Existing segments */}
      {segments.length > 0 && (
        <div className="space-y-3">
          {segments.map((seg) => (
            <SegmentCard
              key={seg.id}
              segment={seg}
              editing={editing === seg.id}
              edit={edits[seg.id]}
              saving={saving === seg.id}
              deleting={deleting === seg.id}
              onStartEdit={() => startEditing(seg)}
              onEditChange={(edit) => setEdits((prev) => ({ ...prev, [seg.id]: edit }))}
              onSave={() => handleSave(seg.id)}
              onDelete={() => handleDelete(seg.id)}
              onCancel={() => {
                setEditing(null);
                setEdits((prev) => {
                  const next = { ...prev };
                  delete next[seg.id];
                  return next;
                });
              }}
            />
          ))}
        </div>
      )}

      {segments.length === 0 && !showForm && (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-500 mb-3">No segments defined yet. Add segments to target specific audiences when generating ads.</p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add First Segment
          </button>
        </div>
      )}

      {/* Add new segment form */}
      {(showForm || segments.length > 0) && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-900 w-full"
          >
            <Plus className="w-4 h-4" />
            Add Segment
            {showForm ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
          </button>
          {showForm && (
            <div className="space-y-3 mt-4">
              <SegmentFormFields
                values={newSegment}
                onChange={setNewSegment}
              />
              <div className="flex justify-end">
                <button
                  onClick={handleCreate}
                  disabled={creating || !newSegment.name.trim()}
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
          )}
        </div>
      )}
    </div>
  );
}

function SegmentFormFields({
  values,
  onChange,
}: {
  values: { name: string; description: string; core_desire: string; core_constraints: string; demographics: string };
  onChange: (v: typeof values) => void;
}) {
  return (
    <>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Segment Name *</label>
        <input
          type="text"
          value={values.name}
          onChange={(e) => onChange({ ...values, name: e.target.value })}
          placeholder='e.g. "Side sleepers with chronic neck pain"'
          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
        <textarea
          value={values.description}
          onChange={(e) => onChange({ ...values, description: e.target.value })}
          placeholder="Who is this person? Describe them in a sentence or two..."
          rows={2}
          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 resize-y"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Core Desire</label>
          <input
            type="text"
            value={values.core_desire}
            onChange={(e) => onChange({ ...values, core_desire: e.target.value })}
            placeholder="Wake up pain-free"
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Core Constraints</label>
          <input
            type="text"
            value={values.core_constraints}
            onChange={(e) => onChange({ ...values, core_constraints: e.target.value })}
            placeholder="Tried 3+ pillows, skeptical"
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Demographics</label>
          <input
            type="text"
            value={values.demographics}
            onChange={(e) => onChange({ ...values, demographics: e.target.value })}
            placeholder="35-55, desk workers"
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>
    </>
  );
}

function SegmentCard({
  segment,
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
  segment: ProductSegment;
  editing: boolean;
  edit?: { name: string; description: string; core_desire: string; core_constraints: string; demographics: string };
  saving: boolean;
  deleting: boolean;
  onStartEdit: () => void;
  onEditChange: (edit: { name: string; description: string; core_desire: string; core_constraints: string; demographics: string }) => void;
  onSave: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  if (editing && edit) {
    return (
      <div className="bg-white border border-indigo-200 rounded-xl p-4 shadow-sm">
        <SegmentFormFields values={edit} onChange={onEditChange} />
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-1.5 bg-indigo-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
          <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">
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
          <h4 className="text-sm font-medium text-gray-900">{segment.name}</h4>
          {segment.description && (
            <p className="text-xs text-gray-500 mt-1">{segment.description}</p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {segment.core_desire && (
              <span className="text-xs text-gray-400">
                <span className="font-medium text-gray-500">Desire:</span> {segment.core_desire}
              </span>
            )}
            {segment.core_constraints && (
              <span className="text-xs text-gray-400">
                <span className="font-medium text-gray-500">Constraints:</span> {segment.core_constraints}
              </span>
            )}
            {segment.demographics && (
              <span className="text-xs text-gray-400">
                <span className="font-medium text-gray-500">Demo:</span> {segment.demographics}
              </span>
            )}
          </div>
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
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
