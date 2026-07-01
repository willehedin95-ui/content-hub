"use client";

import { useState, useEffect } from "react";
import { Zap, Search, ChevronDown, ChevronRight } from "lucide-react";

interface Bot {
  id: string;
  name: string;
  description: string;
}

/**
 * Generate static ads for this concept using one of the ~45 trained Genesis image-format bots.
 * Pick one format -> 3 image variations of that format, rendered into the concept.
 */
export default function GenesisStaticPanel({ jobId, onDone }: { jobId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [bots, setBots] = useState<Bot[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!open || bots.length) return;
    fetch("/api/genesis/image-bots")
      .then((r) => r.json())
      .then((d) => setBots(d.bots ?? []))
      .catch(() => setError("Kunde inte hämta Genesis-bottar"));
  }, [open, bots.length]);

  const filtered = bots.filter(
    (b) => b.name.toLowerCase().includes(query.toLowerCase()) || b.description.toLowerCase().includes(query.toLowerCase()),
  );
  const selectedBot = bots.find((b) => b.id === selected);

  async function generate() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    setStatus(`Genererar 3 static ads med "${selectedBot?.name}"... (kan ta 1-2 min)`);
    try {
      const res = await fetch(`/api/image-jobs/${jobId}/genesis-static`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botSlug: selected, count: 3 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Genereringen misslyckades");
      setStatus(`Klart: ${data.generated} bild(er) skapade${data.failed ? `, ${data.failed} misslyckades` : ""}.`);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <Zap className="h-4 w-4 text-indigo-600" />
        <span className="text-sm font-semibold text-gray-900">Generera static ads med Genesis-bottar</span>
        <span className="text-xs text-gray-500">45 tränade format · 3 bilder per format</span>
        <span className="ml-auto text-gray-400">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-indigo-100 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sök format (t.ex. kvitto, testimonial, reptile, meme...)"
              className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-gray-200 bg-white p-1">
            {!bots.length && !error && <div className="p-3 text-sm text-gray-400">Laddar format...</div>}
            {filtered.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelected(b.id)}
                className={`block w-full rounded-md px-3 py-2 text-left transition ${selected === b.id ? "bg-indigo-600 text-white" : "hover:bg-gray-50"}`}
              >
                <div className={`text-sm font-medium ${selected === b.id ? "text-white" : "text-gray-900"}`}>{b.name}</div>
                {b.description && (
                  <div className={`text-xs ${selected === b.id ? "text-indigo-100" : "text-gray-400"}`}>{b.description}</div>
                )}
              </button>
            ))}
            {bots.length > 0 && !filtered.length && <div className="p-3 text-sm text-gray-400">Inga format matchar &ldquo;{query}&rdquo;.</div>}
          </div>

          <button
            onClick={generate}
            disabled={loading || !selected}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
                </svg>
                Genererar...
              </>
            ) : selectedBot ? `Generera 3 static ads med "${selectedBot.name}"` : "Välj ett format"}
          </button>

          {status && <p className="text-xs text-gray-500">{status}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
