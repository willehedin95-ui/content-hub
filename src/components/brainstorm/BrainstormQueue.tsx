"use client";

import { useState, useEffect } from "react";
import AutopilotConceptCard from "@/components/brainstorm/AutopilotConceptCard";
import { Bot } from "lucide-react";

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
  const [autopilot, setAutopilot] = useState<AutopilotData>({ pending: [], approved: [], rejected: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAutopilot();
    const interval = setInterval(fetchAutopilot, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchAutopilot() {
    try {
      const res = await fetch("/api/autopilot/concepts");
      if (res.ok) {
        const data = await res.json();
        setAutopilot(data);
      }
    } catch (error) {
      console.error("Error fetching autopilot concepts:", error);
    } finally {
      setLoading(false);
    }
  }

  const totalCount = autopilot.pending.length + autopilot.approved.length + autopilot.rejected.length;

  if (loading) {
    return (
      <div className="text-sm text-gray-500 py-8 text-center">
        Loading autopilot concepts...
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-purple-50 flex items-center justify-center mb-4">
          <Bot className="h-6 w-6 text-purple-400" />
        </div>
        <h3 className="text-sm font-medium text-gray-900 mb-1">No autopilot concepts yet</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          The autopilot generates concepts daily based on what your account needs.
          When new concepts are ready, they&apos;ll appear here for you to approve or reject.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Pending Review */}
      {autopilot.pending.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            Pending Review
            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">
              {autopilot.pending.length}
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {autopilot.pending.map((c) => (
              <AutopilotConceptCard key={c.id} concept={c} status="pending" onAction={fetchAutopilot} />
            ))}
          </div>
        </section>
      )}

      {/* Approved */}
      {autopilot.approved.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            Approved
            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
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

      {/* Rejected */}
      {autopilot.rejected.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            Rejected
            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">
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
  );
}
