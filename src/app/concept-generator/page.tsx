"use client";

import { useState, useEffect } from "react";
import CoverageMatrix from "@/components/pipeline/CoverageMatrix";
import ConceptCard from "@/components/pipeline/ConceptCard";
import type { AutoPipelineConcept, AutoCoverageGap } from "@/types";

export default function PipelinePage() {
  const [pendingConcepts, setPendingConcepts] = useState<
    AutoPipelineConcept[]
  >([]);
  const [approvedConcepts, setApprovedConcepts] = useState<
    AutoPipelineConcept[]
  >([]);
  const [rejectedConcepts, setRejectedConcepts] = useState<
    AutoPipelineConcept[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConcepts();
    const interval = setInterval(fetchConcepts, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

  async function fetchConcepts() {
    try {
      const [pendingRes, approvedRes, rejectedRes] = await Promise.all([
        fetch("/api/pipeline/concepts?status=pending_review"),
        fetch("/api/pipeline/concepts?status=approved"),
        fetch("/api/pipeline/concepts?status=rejected"),
      ]);

      if (pendingRes.ok) {
        const data = await pendingRes.json();
        setPendingConcepts(data.concepts);
      }
      if (approvedRes.ok) {
        const data = await approvedRes.json();
        setApprovedConcepts(data.concepts);
      }
      if (rejectedRes.ok) {
        const data = await rejectedRes.json();
        setRejectedConcepts(data.concepts);
      }
    } catch (error) {
      console.error("Error fetching concepts:", error);
    } finally {
      setLoading(false);
    }
  }

  function handleGapClick(gap: AutoCoverageGap) {
    // TODO: Navigate to concept generator with pre-filled product/market/awareness
    console.log("Gap clicked:", gap);
    alert(
      `Generate concepts for ${gap.product} / ${gap.market} / ${gap.awareness_level}`
    );
  }

  const hasAnyConcepts =
    pendingConcepts.length > 0 ||
    approvedConcepts.length > 0 ||
    rejectedConcepts.length > 0;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Automated Pipeline
        </h1>
        <p className="text-sm text-gray-600">
          Review concepts, monitor coverage, and manage automated content
          generation
        </p>
      </div>

      {/* Getting Started - Show when no concepts exist */}
      {!loading && !hasAnyConcepts && (
        <div className="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">
            🚀 Getting Started with Pipeline
          </h3>
          <p className="text-sm text-blue-700 mb-4">
            Your pipeline is empty. Generate your first batch of AI concepts to get started!
          </p>
          <div className="space-y-2 text-sm text-blue-600">
            <p><strong>Step 1:</strong> Click a coverage gap below to generate concepts for a specific product/market/awareness combination</p>
            <p><strong>Step 2:</strong> Review generated concepts in "Pending Review"</p>
            <p><strong>Step 3:</strong> Approve concepts to create static ads automatically</p>
          </div>
        </div>
      )}

      {/* Coverage Matrix */}
      <div className="mb-8">
        <CoverageMatrix onGapClick={handleGapClick} />
      </div>

      {/* Concepts Grid */}
      <div className="space-y-8">
        {/* Pending Review */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Pending Review
              {pendingConcepts.length > 0 && (
                <span className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-700 text-sm rounded">
                  {pendingConcepts.length}
                </span>
              )}
            </h2>
          </div>
          {loading ? (
            <div className="text-sm text-gray-500">Loading concepts...</div>
          ) : pendingConcepts.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
              No pending concepts
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingConcepts.map((concept) => (
                <ConceptCard
                  key={concept.id}
                  concept={concept}
                  onStatusChange={fetchConcepts}
                />
              ))}
            </div>
          )}
        </section>

        {/* Approved */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Approved
              {approvedConcepts.length > 0 && (
                <span className="ml-2 px-2 py-1 bg-green-100 text-green-700 text-sm rounded">
                  {approvedConcepts.length}
                </span>
              )}
            </h2>
          </div>
          {loading ? (
            <div className="text-sm text-gray-500">Loading concepts...</div>
          ) : approvedConcepts.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
              No approved concepts
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {approvedConcepts.slice(0, 6).map((concept) => (
                <ConceptCard key={concept.id} concept={concept} />
              ))}
            </div>
          )}
        </section>

        {/* Rejected */}
        {rejectedConcepts.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Rejected
                <span className="ml-2 px-2 py-1 bg-red-100 text-red-700 text-sm rounded">
                  {rejectedConcepts.length}
                </span>
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rejectedConcepts.slice(0, 3).map((concept) => (
                <ConceptCard key={concept.id} concept={concept} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
