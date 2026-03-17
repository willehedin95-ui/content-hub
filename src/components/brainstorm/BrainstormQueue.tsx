"use client";

import { useState, useEffect } from "react";
import CoverageMatrix from "@/components/pipeline/CoverageMatrix";
import ConceptCard from "@/components/pipeline/ConceptCard";
import AutopilotConceptCard from "@/components/brainstorm/AutopilotConceptCard";
import type { AutoPipelineConcept, AutoCoverageGap } from "@/types";

interface AutopilotData {
  pending: AutopilotConcept[];
  approved: AutopilotConcept[];
  rejected: AutopilotConcept[];
}

interface AutopilotConcept {
  id: string;
  name: string;
  concept_number: number | null;
  product: string;
  status: string;
  ad_copy_primary?: string | null;
  ad_copy_headline?: string | null;
  cash_dna?: { angle?: string; awareness_level?: string; hooks?: string[] } | null;
  landing_page_id?: string | null;
  target_languages?: string[] | null;
  created_at: string;
  archived_at?: string | null;
  source_images?: Array<{ id: string; original_url: string; filename: string }>;
}

export default function BrainstormQueue() {
  const [pendingConcepts, setPendingConcepts] = useState<
    AutoPipelineConcept[]
  >([]);
  const [approvedConcepts, setApprovedConcepts] = useState<
    AutoPipelineConcept[]
  >([]);
  const [rejectedConcepts, setRejectedConcepts] = useState<
    AutoPipelineConcept[]
  >([]);
  const [autopilot, setAutopilot] = useState<AutopilotData>({ pending: [], approved: [], rejected: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchAll() {
    await Promise.all([fetchConcepts(), fetchAutopilot()]);
  }

  async function fetchAutopilot() {
    try {
      const res = await fetch("/api/autopilot/concepts");
      if (res.ok) {
        const data = await res.json();
        setAutopilot(data);
      }
    } catch (error) {
      console.error("Error fetching autopilot concepts:", error);
    }
  }

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
    // TODO: Navigate to brainstorm generate tab with pre-filled product/market/awareness
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
    <div>
      {/* Getting Started */}
      {!loading && !hasAnyConcepts && (
        <div className="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">
            Getting Started with the Queue
          </h3>
          <p className="text-sm text-blue-700 mb-4">
            Your queue is empty. Generate your first batch of AI concepts to get started!
          </p>
          <div className="space-y-2 text-sm text-blue-600">
            <p><strong>Step 1:</strong> Click a coverage gap below to generate concepts for a specific product/market/awareness combination</p>
            <p><strong>Step 2:</strong> Review generated concepts in &ldquo;Pending Review&rdquo;</p>
            <p><strong>Step 3:</strong> Approve concepts to create static ads automatically</p>
          </div>
        </div>
      )}

      {/* Coverage Matrix */}
      <div className="mb-8">
        <CoverageMatrix onGapClick={handleGapClick} />
      </div>

      {/* Autopilot Concepts */}
      {(autopilot.pending.length > 0 || autopilot.approved.length > 0 || autopilot.rejected.length > 0) && (
        <div className="mb-8 space-y-6">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-full bg-purple-100 flex items-center justify-center">
              <svg className="h-3 w-3 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Autopilot Concepts</h2>
          </div>

          {/* Pending autopilot */}
          {autopilot.pending.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Pending Review
                <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">
                  {autopilot.pending.length}
                </span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {autopilot.pending.map((c) => (
                  <AutopilotConceptCard key={c.id} concept={c} status="pending" onAction={fetchAll} />
                ))}
              </div>
            </section>
          )}

          {/* Approved autopilot */}
          {autopilot.approved.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Approved
                <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                  {autopilot.approved.length}
                </span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {autopilot.approved.slice(0, 6).map((c) => (
                  <AutopilotConceptCard key={c.id} concept={c} status="approved" />
                ))}
              </div>
            </section>
          )}

          {/* Rejected autopilot */}
          {autopilot.rejected.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Rejected
                <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                  {autopilot.rejected.length}
                </span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {autopilot.rejected.slice(0, 3).map((c) => (
                  <AutopilotConceptCard key={c.id} concept={c} status="rejected" />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

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
