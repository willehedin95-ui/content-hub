"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Users, Cog, Shuffle } from "lucide-react";
import type { IterationType, ImageJob, CashDna, ProductSegment } from "@/types";

interface Props {
  job: ImageJob;
  segments: ProductSegment[];
  onClose: () => void;
}

const ITERATION_TYPES: Array<{
  id: IterationType;
  label: string;
  description: string;
  icon: typeof Users;
}> = [
  {
    id: "segment_swap",
    label: "Segment Swap",
    description: "Same concept, different target audience",
    icon: Users,
  },
  {
    id: "mechanism_swap",
    label: "Mechanism Swap",
    description: 'Same emotional trigger, different "how it works"',
    icon: Cog,
  },
  {
    id: "cash_swap",
    label: "C.A.S.H. Swap",
    description: "Change one element: hook, style, or angle",
    icon: Shuffle,
  },
];

export default function IterationDialog({ job, segments, onClose }: Props) {
  const router = useRouter();
  const [iterationType, setIterationType] = useState<IterationType>("segment_swap");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Segment swap state
  const [segmentId, setSegmentId] = useState<string>("");

  // Mechanism swap state
  const [newMechanism, setNewMechanism] = useState("");

  // CASH swap state
  const [swapElement, setSwapElement] = useState<"hook" | "style" | "angle">("hook");
  const [newValue, setNewValue] = useState("");

  const cashDna = job.cash_dna as CashDna | null;

  function getCurrentValue(): string | null {
    if (!cashDna) return null;
    if (swapElement === "hook") return cashDna.hooks?.[0] ?? null;
    if (swapElement === "style") return cashDna.style ?? null;
    if (swapElement === "angle") return cashDna.angle ?? null;
    return null;
  }

  function isValid(): boolean {
    switch (iterationType) {
      case "segment_swap":
        return !!segmentId;
      case "mechanism_swap":
        return newMechanism.trim().length > 0;
      case "cash_swap":
        return newValue.trim().length > 0;
    }
  }

  async function handleCreate() {
    if (!isValid() || creating) return;
    setCreating(true);
    setError(null);

    const body: Record<string, unknown> = { iteration_type: iterationType };

    switch (iterationType) {
      case "segment_swap":
        body.segment_id = segmentId;
        break;
      case "mechanism_swap":
        body.new_mechanism = newMechanism.trim();
        break;
      case "cash_swap":
        body.swap_element = swapElement;
        body.new_value = newValue.trim();
        break;
    }

    try {
      const res = await fetch(`/api/image-jobs/${job.id}/iterate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create iteration");
        setCreating(false);
        return;
      }

      // Navigate to the new child job
      router.push(`/images/${data.id}`);
    } catch {
      setError("Network error");
      setCreating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">
            Create Iteration
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Iteration type selector */}
          <div className="space-y-2">
            {ITERATION_TYPES.map((type) => {
              const Icon = type.icon;
              const selected = iterationType === type.id;
              const disabled = type.id === "segment_swap" && segments.length === 0;
              return (
                <button
                  key={type.id}
                  onClick={() => !disabled && setIterationType(type.id)}
                  disabled={disabled}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                    selected
                      ? "bg-indigo-50 border-indigo-300"
                      : disabled
                      ? "bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed"
                      : "bg-white border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 mt-0.5 ${
                      selected ? "text-indigo-600" : "text-gray-400"
                    }`}
                  />
                  <div>
                    <p
                      className={`text-sm font-medium ${
                        selected ? "text-indigo-700" : "text-gray-700"
                      }`}
                    >
                      {type.label}
                      {disabled && (
                        <span className="text-xs text-gray-400 ml-2">
                          (no segments defined)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {type.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Type-specific inputs */}
          {iterationType === "segment_swap" && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Target Segment
              </label>
              <select
                value={segmentId}
                onChange={(e) => setSegmentId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">Select a segment...</option>
                {segments.map((seg) => (
                  <option key={seg.id} value={seg.id}>
                    {seg.name}
                    {seg.demographics ? ` — ${seg.demographics}` : ""}
                  </option>
                ))}
              </select>
              {segmentId && (() => {
                const seg = segments.find((s) => s.id === segmentId);
                if (!seg) return null;
                return (
                  <p className="text-xs text-gray-400 mt-1.5">
                    {seg.core_desire && (
                      <>
                        <span className="text-gray-500 font-medium">Desire:</span>{" "}
                        {seg.core_desire}{" "}
                      </>
                    )}
                    {seg.core_constraints && (
                      <>
                        <span className="text-gray-500 font-medium">Constraints:</span>{" "}
                        {seg.core_constraints}
                      </>
                    )}
                  </p>
                );
              })()}
            </div>
          )}

          {iterationType === "mechanism_swap" && (
            <div>
              {cashDna?.angle && (
                <p className="text-xs text-gray-400 mb-2">
                  <span className="text-gray-500 font-medium">Current angle:</span>{" "}
                  {cashDna.angle}
                </p>
              )}
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                New Mechanism
              </label>
              <textarea
                value={newMechanism}
                onChange={(e) => setNewMechanism(e.target.value)}
                placeholder='e.g. "Cervical spine alignment technology" or "Memory foam cooling gel layer"'
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500 resize-y"
              />
            </div>
          )}

          {iterationType === "cash_swap" && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Element to Swap
                </label>
                <div className="flex gap-2">
                  {(["hook", "style", "angle"] as const).map((el) => (
                    <button
                      key={el}
                      onClick={() => {
                        setSwapElement(el);
                        setNewValue("");
                      }}
                      className={`flex-1 px-3 py-2 text-sm rounded-lg border font-medium transition-colors ${
                        swapElement === el
                          ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                          : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      {el.charAt(0).toUpperCase() + el.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {getCurrentValue() && (
                <p className="text-xs text-gray-400">
                  <span className="text-gray-500 font-medium">Current {swapElement}:</span>{" "}
                  {getCurrentValue()}
                </p>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  New {swapElement.charAt(0).toUpperCase() + swapElement.slice(1)}
                </label>
                {swapElement === "hook" ? (
                  <textarea
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="Write the new scroll-stopping hook..."
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500 resize-y"
                  />
                ) : (
                  <input
                    type="text"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder={
                      swapElement === "style"
                        ? 'e.g. "Scientific authority" or "Casual testimonial"'
                        : 'e.g. "Social proof from real users" or "Fear of missing out"'
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500"
                  />
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!isValid() || creating}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {creating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Iteration"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
