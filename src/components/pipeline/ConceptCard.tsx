"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import type { AutoPipelineConcept } from "@/types";

interface ConceptCardProps {
  concept: AutoPipelineConcept;
  onStatusChange?: () => void;
}

export default function ConceptCard({
  concept,
  onStatusChange,
}: ConceptCardProps) {
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/pipeline/concepts/${concept.id}/approve`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to approve concept");
      onStatusChange?.();
    } catch (error) {
      console.error("Error approving concept:", error);
      alert("Failed to approve concept");
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    if (loading) return;
    const reason = prompt("Rejection reason (optional):");
    if (reason === null) return; // Cancelled

    setLoading(true);
    try {
      const res = await fetch(`/api/pipeline/concepts/${concept.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: false, reason }),
      });
      if (!res.ok) throw new Error("Failed to reject concept");
      onStatusChange?.();
    } catch (error) {
      console.error("Error rejecting concept:", error);
      alert("Failed to reject concept");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-medium text-gray-900">{concept.name}</h3>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
            <span className="capitalize">{concept.product}</span>
            <span>•</span>
            <span className="text-gray-400">#{concept.concept_number}</span>
            {concept.target_markets && concept.target_markets.length > 0 && (
              <>
                <span>•</span>
                <span className="uppercase">
                  {concept.target_markets.join(", ")}
                </span>
              </>
            )}
          </div>
        </div>
        <div
          className={`
          px-2 py-1 rounded text-xs font-medium
          ${
            concept.status === "pending_review"
              ? "bg-yellow-100 text-yellow-700"
              : concept.status === "approved"
                ? "bg-green-100 text-green-700"
                : concept.status === "rejected"
                  ? "bg-red-100 text-red-700"
                  : concept.status === "live"
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-gray-100 text-gray-700"
          }
        `}
        >
          {concept.status.replace("_", " ")}
        </div>
      </div>

      {/* Headline and Copy */}
      {concept.headline && (
        <div className="mb-3 p-3 bg-gray-50 rounded border border-gray-200">
          <div className="text-sm font-medium text-gray-900 mb-1">
            {concept.headline}
          </div>
          {concept.primary_copy && concept.primary_copy.length > 0 && (
            <div className="text-xs text-gray-600">
              {concept.primary_copy[0]}
            </div>
          )}
        </div>
      )}

      {/* Metadata */}
      <div className="space-y-1 text-xs text-gray-600 mb-3">
        {concept.cash_dna && concept.cash_dna.awareness_level && (
          <div>
            <span className="font-medium">Awareness:</span>{" "}
            {concept.cash_dna.awareness_level.replace("_", " ")}
          </div>
        )}
        {concept.cash_dna && concept.cash_dna.angle && (
          <div>
            <span className="font-medium">Angle:</span> {concept.cash_dna.angle}
          </div>
        )}
        {concept.generation_mode && (
          <div>
            <span className="font-medium">Mode:</span> {concept.generation_mode}
          </div>
        )}
        <div>
          <span className="font-medium">Created:</span>{" "}
          {new Date(concept.created_at).toLocaleDateString()}
        </div>
      </div>

      {/* Actions */}
      {concept.status === "pending_review" && (
        <div className="flex gap-2">
          <button
            onClick={handleApprove}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            Approve
          </button>
          <button
            onClick={handleReject}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" />
            Reject
          </button>
        </div>
      )}

      {/* Rejection Reason */}
      {concept.status === "rejected" && concept.rejected_reason && (
        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          <span className="font-medium">Rejected:</span>{" "}
          {concept.rejected_reason}
        </div>
      )}
    </div>
  );
}
