"use client";

import { useState, useEffect, useRef } from "react";
import { Zap, Search } from "lucide-react";

interface Bot {
  id: string;
  name: string;
  description: string;
  recommended?: boolean;
  /** True for the hub's own built-in styles (not Genesis bots). */
  own?: boolean;
  thumbnail?: string;
}

/**
 * Generate static ads for this concept using one of the ~45 trained Genesis image-format bots.
 * Pick one format + a count -> that many image variations of that format, rendered into the concept.
 *
 * The generation runs server-side in the background (202 + after()): this panel polls
 * GET genesis-static for phase progress and refreshes the grid so images appear as they
 * render. A run in flight survives page reloads - the panel resumes its progress display.
 */
type ThumbSize = "sm" | "md" | "lg";
const THUMB_CLS: Record<ThumbSize, string> = { sm: "h-14 w-14", md: "h-24 w-24", lg: "h-44 w-44" };
const LIST_CLS: Record<ThumbSize, string> = { sm: "max-h-64", md: "max-h-96", lg: "max-h-[38rem]" };

interface GenesisProgress {
  phase: "bot_call" | "bot_retry" | "rendering" | "outpainting" | "done" | "error";
  bot?: string;
  count?: number;
  started_at?: string;
  prompts?: number;
  generated?: number;
  failed?: number;
  error?: string;
}

const PHASE_LABELS: Record<string, string> = {
  bot_call: "Botten skriver bildprompt(er)... (det tunga steget, ~1-2 min)",
  bot_retry: "Botten svarade i fel format - kör ett strikt omtag...",
  rendering: "Renderar bilder - de dyker upp i rutnätet nedan...",
  outpainting: "Skapar 9:16-versioner för stories/reels...",
};

/** Runs older than this without reaching done/error are treated as dead (killed function). */
const STALE_RUN_MS = 15 * 60 * 1000;

export default function GenesisStaticPanel({ jobId, onDone }: { jobId: string; onDone: () => void }) {
  const [bots, setBots] = useState<Bot[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [count, setCount] = useState(3);
  const [thumbSize, setThumbSize] = useState<ThumbSize>("lg");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimers = () => {
    if (poll.current) clearInterval(poll.current);
    if (tick.current) clearInterval(tick.current);
    poll.current = null;
    tick.current = null;
  };

  const finishRun = (p: GenesisProgress) => {
    stopTimers();
    setLoading(false);
    if (p.phase === "done") {
      setStatus(`Klart: ${p.generated ?? 0} bild(er) skapade${p.failed ? `, ${p.failed} misslyckades` : ""}.`);
    } else {
      setError(p.error || "Genereringen misslyckades");
      setStatus(null);
    }
    onDone();
  };

  const watchRun = (startedAt?: string) => {
    setLoading(true);
    setError(null);
    const t0 = startedAt ? new Date(startedAt).getTime() : Date.now();
    setElapsed(Math.max(0, Math.round((Date.now() - t0) / 1000)));
    stopTimers();
    tick.current = setInterval(() => setElapsed(Math.max(0, Math.round((Date.now() - t0) / 1000))), 1000);
    poll.current = setInterval(async () => {
      onDone(); // refresh the grid so finished renders appear
      try {
        const res = await fetch(`/api/image-jobs/${jobId}/genesis-static`);
        if (!res.ok) return; // transient - keep polling
        const p: GenesisProgress | null = (await res.json()).progress;
        if (!p) return;
        if (p.phase === "done" || p.phase === "error") return finishRun(p);
        setStatus(PHASE_LABELS[p.phase] ?? "Genererar...");
        if (p.started_at && Date.now() - new Date(p.started_at).getTime() > STALE_RUN_MS) {
          return finishRun({ phase: "error", error: "Körningen verkar ha dött (inget livstecken på 15 min). Testa igen." });
        }
      } catch {
        // network blip - keep polling
      }
    }, 3000);
  };

  useEffect(() => {
    const saved = localStorage.getItem("genesis-thumb-size") as ThumbSize | null;
    if (saved && THUMB_CLS[saved]) setThumbSize(saved);
    fetch("/api/genesis/image-bots")
      .then((r) => r.json())
      .then((d) => setBots(d.bots ?? []))
      .catch(() => setError("Kunde inte hämta Genesis-format"));
    // Resume progress display if a run is already in flight for this concept.
    fetch(`/api/image-jobs/${jobId}/genesis-static`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const p: GenesisProgress | null = d?.progress ?? null;
        if (!p || p.phase === "done" || p.phase === "error") return;
        if (p.started_at && Date.now() - new Date(p.started_at).getTime() > STALE_RUN_MS) return;
        setStatus(PHASE_LABELS[p.phase] ?? "Genererar...");
        watchRun(p.started_at);
      })
      .catch(() => {});
    return stopTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeThumbSize = (s: ThumbSize) => {
    setThumbSize(s);
    localStorage.setItem("genesis-thumb-size", s);
  };

  const filtered = bots.filter(
    (b) => b.name.toLowerCase().includes(query.toLowerCase()) || b.description.toLowerCase().includes(query.toLowerCase()),
  );
  const selectedBot = bots.find((b) => b.id === selected);

  async function generate() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    setElapsed(0);
    setStatus(`Startar ${count} bild(er) med "${selectedBot?.name}"...`);
    try {
      const res = await fetch(`/api/image-jobs/${jobId}/genesis-static`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botSlug: selected, count }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunde inte starta genereringen");
      // 202: the run continues server-side - poll progress + grid until done/error.
      setStatus(PHASE_LABELS.bot_call);
      watchRun(data.started_at);
    } catch (e) {
      stopTimers();
      setError((e as Error).message);
      setStatus(null);
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Zap className="h-4 w-4 text-indigo-600" />
        <span className="text-sm font-semibold text-gray-900">Generera static ads med Genesis-bottar</span>
        <span className="text-xs text-gray-500">{bots.length || 37} tränade format</span>
        <div className="ml-auto flex items-center gap-1" title="Storlek på exempel-bilderna">
          {(["sm", "md", "lg"] as const).map((s) => (
            <button
              key={s}
              onClick={() => changeThumbSize(s)}
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${thumbSize === s ? "bg-indigo-600 text-white" : "bg-white text-gray-500 border border-gray-200 hover:text-gray-900"}`}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
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

      <div className={`mb-3 ${LIST_CLS[thumbSize]} space-y-1 overflow-y-auto rounded-md border border-gray-200 bg-white p-1`}>
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
              <img src={b.thumbnail} alt={b.name} loading="lazy" className={`${THUMB_CLS[thumbSize]} shrink-0 rounded-md border border-black/10 object-cover`} />
            ) : (
              <div className={`flex ${THUMB_CLS[thumbSize]} shrink-0 items-center justify-center rounded-md text-[10px] ${selected === b.id ? "bg-white/10 text-indigo-100" : "bg-gray-100 text-gray-400"}`}>
                Ingen<br />bild
              </div>
            )}
            <div className="min-w-0">
              <div className={`flex items-center gap-2 text-sm font-medium ${selected === b.id ? "text-white" : "text-gray-900"}`}>
                {b.name}
                {b.recommended && (
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${selected === b.id ? "bg-white/20 text-white" : "bg-indigo-100 text-indigo-700"}`}>REK</span>
                )}
                {b.own && (
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${selected === b.id ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"}`}>EGEN</span>
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

      {status && <p className="mt-2 text-xs text-gray-500">{status}</p>}
      {loading && <p className="mt-2 text-xs text-gray-400">Du kan lämna sidan - genereringen fortsätter i bakgrunden och bilderna dyker upp i rutnätet nedan.</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
