"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  RefreshCw,
  Pause,
  Play,
  AlertCircle,
  CheckCircle,
  ExternalLink,
} from "lucide-react";

interface Source {
  id: string;
  name: string;
  domain: string;
  platform: string;
  is_own_brand: boolean;
  language: string | null;
  last_scanned_at: string | null;
  last_review_date: string | null;
  total_reviews_fetched: number;
  status: string;
  error_message: string | null;
}

export default function ResearchSources() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch("/api/research/sources");
      const data = await res.json();
      setSources(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to fetch sources:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const addSource = async () => {
    if (!newDomain.trim() || !newName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/research/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: newDomain.trim(), name: newName.trim() }),
      });
      if (res.ok) {
        setNewDomain("");
        setNewName("");
        setShowAdd(false);
        await fetchSources();
      }
    } catch (e) {
      console.error("Failed to add source:", e);
    } finally {
      setAdding(false);
    }
  };

  const toggleSource = async (source: Source) => {
    const newStatus = source.status === "active" ? "paused" : "active";
    try {
      await fetch("/api/research/sources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: source.id, status: newStatus }),
      });
      await fetchSources();
    } catch (e) {
      console.error("Failed to toggle source:", e);
    }
  };

  if (loading) {
    return <div className="text-center text-gray-400 py-12">Loading...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {sources.length} source{sources.length !== 1 ? "s" : ""} configured
        </p>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" />
          Add Source
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">
            Add Trustpilot Source
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Display name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Oslo Skin Lab SE"
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Trustpilot domain
              </label>
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="e.g. osloskinlab.se"
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={addSource}
              disabled={adding || !newDomain.trim() || !newName.trim()}
              className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {adding ? "Adding..." : "Add"}
            </button>
          </div>
        </div>
      )}

      {/* Sources table */}
      {sources.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          No sources configured. Add a Trustpilot domain to start scanning.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">
                  Source
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">
                  Domain
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">
                  Reviews
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">
                  Last Scan
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sources.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {s.name}
                      </span>
                      {s.is_own_brand && (
                        <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">
                          Own
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`https://www.trustpilot.com/review/${s.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-600 hover:text-indigo-600 flex items-center gap-1"
                    >
                      {s.domain}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">
                    {s.total_reviews_fetched}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {s.last_scanned_at
                      ? new Date(s.last_scanned_at).toLocaleDateString()
                      : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    {s.status === "active" && (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700">
                        <CheckCircle className="w-3 h-3" /> Active
                      </span>
                    )}
                    {s.status === "paused" && (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                        <Pause className="w-3 h-3" /> Paused
                      </span>
                    )}
                    {s.status === "error" && (
                      <span
                        className="inline-flex items-center gap-1 text-xs text-red-600"
                        title={s.error_message ?? ""}
                      >
                        <AlertCircle className="w-3 h-3" /> Error
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleSource(s)}
                      className="p-1 text-gray-400 hover:text-gray-700"
                      title={
                        s.status === "active" ? "Pause scanning" : "Resume scanning"
                      }
                    >
                      {s.status === "active" ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
