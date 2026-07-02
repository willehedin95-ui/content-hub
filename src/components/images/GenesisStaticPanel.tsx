"use client";

import { useState, useEffect, useRef } from "react";
import { Zap, Search } from "lucide-react";

interface Bot {
  id: string;
  name: string;
  description: string;
  recommended?: boolean;
  thumbnail?: string;
}

/**
 * Generate static ads for this concept using one of the ~45 trained Genesis image-format bots.
 * Pick one format + a count -> that many image variations of that format, rendered into the concept.
 * Images appear in the grid as they render (onDone polling).
 */
export default function GenesisStaticPanel({ jobId, onDone }: { jobId: string; onDone: () => void }) {
  const [bots, setBots] = useState<Bot[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [count, setCount] = useState(3);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/genesis/image-bots")
      .then((r) => r.json())
      .then((d) => setBots(d.bots ?? []))
      .catch(() => setError("Kunde inte hämta Genesis-format"));
    return () => {
      if (poll.current) clearInterval(poll.current);
      if (tick.current) clearInterval(tick.current);
    };
  }, []);

  const filtered = bots.filter(
    (b) => b.name.toLowerCase().includes(query.toLowerCase()) || b.description.toLowerCase().includes(query.toLowerCase()),
  );
  const selectedBot = bots.find((b) => b.id === selected);

  async function generate() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    setElapsed(0);
    setStatus(`Genererar ${count} bild(er) med "${selectedBot?.name}"...`);
    // Live-ish feedback: refresh the concept grid every few seconds so images appear as they render.
    tick.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    poll.current = setInterval(() => onDone(), 4000);
    try {
      const res = await fetch(`/api/image-jobs/${jobId}/genesis-static`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botSlug: selected, count }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Genereringen misslyckades");
      setStatus(`Klart: ${data.generated} bild(er) skapade${data.failed ? `, ${data.failed} misslyckades` : ""}.`);
    } catch (e) {
      setError((e as Error).message);
      setStatus(null);
    } finally {
      if (poll.current) clearInterval(poll.current);
      if (tick.current) clearInterval(tick.current);
      setLoading(false);
      onDone();
    }
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Zap className="h-4 w-4 text-indigo-600" />
        <span className="text-sm font-semibold text-gray-900">Generera static ads med Genesis-bottar</span>
        <span className="text-xs text-gray-500">{bots.length || 45} tränade format</span>
      </div>

      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Sök format (t.ex. kvitto, testimonial, reptile, meme...)"
          disabled={loading}
          className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div className="mb-3 max-h-64 space-y-1 overflow-y-auto rounded-md border border-gray-200 bg-white p-1">
        {!bots.length && !error && <div className="p-3 text-sm text-gray-400">Laddar format...</div>}
        {filtered.map((b) => (
          <button
            key={b.id}
            onClick={() => setSelected(b.id)}
            disabled={loading}
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition ${selected === b.id ? "bg-indigo-600 text-white" : "hover:bg-gray-50"}`}
          >
            {b.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.thumbnail} alt={b.name} loading="lazy" className="h-14 w-14 shrink-0 rounded-md border border-black/10 object-cover" />
            ) : (
              <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-[10px] ${selected === b.id ? "bg-white/10 text-indigo-100" : "bg-gray-100 text-gray-400"}`}>
                Ingen<br />bild
              </div>
            )}
            <div className="min-w-0">
              <div className={`flex items-center gap-2 text-sm font-medium ${selected === b.id ? "text-white" : "text-gray-900"}`}>
                {b.name}
                {b.recommended && (
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${selected === b.id ? "bg-white/20 text-white" : "bg-indigo-100 text-indigo-700"}`}>REK</span>
                )}
              </div>
              {b.description && <div className={`truncate text-xs ${selected === b.id ? "text-indigo-100" : "text-gray-400"}`}>{b.description}</div>}
            </div>
          </button>
        ))}
        {bots.length > 0 && !filtered.length && <div className="p-3 text-sm text-gray-400">Inga format matchar &ldquo;{query}&rdquo;.</div>}
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-600">Antal bilder</label>
        <select value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={loading} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button
          onClick={generate}
          disabled={loading || !selected}
          className="flex flex-1 items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
              </svg>
              Genererar {count}... ({elapsed}s)
            </>
          ) : selectedBot ? `Generera ${count} med "${selectedBot.name}"` : "Välj ett format"}
        </button>
      </div>

      {loading && <p className="mt-2 text-xs text-gray-400">Bilderna dyker upp i rutnätet nedan allt eftersom de blir klara.</p>}
      {!loading && status && <p className="mt-2 text-xs text-gray-500">{status}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
