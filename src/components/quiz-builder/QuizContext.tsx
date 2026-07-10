"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { QuizData, QuizRow, QuizSettings } from "@/types/quiz";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
export type QuizContextValue = {
  quiz: QuizRow;
  data: QuizData;
  settings: QuizSettings;
  selectedNodeId: string | null;
  /** The element (subEl) being edited in the middle panel, if any. */
  selectedElId: string | null;
  saveState: SaveState;
  setData: (next: QuizData | ((prev: QuizData) => QuizData)) => void;
  setSettings: (next: QuizSettings | ((prev: QuizSettings) => QuizSettings)) => void;
  setName: (name: string) => void;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedElId: (id: string | null) => void;
};

const Ctx = createContext<QuizContextValue | null>(null);
export function useQuiz() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useQuiz used outside QuizProvider");
  return v;
}

/**
 * Deterministic JSON serialization with sorted object keys. Used for content
 * comparison against server rows: Postgres jsonb does NOT preserve key
 * order, so plain JSON.stringify of a round-tripped row differs from the
 * client's stringify even when the content is identical - which would make
 * every 409-recovery fail after a publish. Keys with undefined values are
 * skipped (matching JSON.stringify semantics for object properties).
 */
function stableStringify(value: unknown): string {
  if (value === undefined) return "null"; // array-slot semantics; roots are never undefined here
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function QuizProvider({
  initialQuiz,
  children,
}: {
  initialQuiz: QuizRow;
  children: React.ReactNode;
}) {
  const [quiz, setQuiz] = useState<QuizRow>(initialQuiz);
  const [data, setDataState] = useState<QuizData>(initialQuiz.data);
  const [settings, setSettingsState] = useState<QuizSettings>(initialQuiz.settings);
  const [selectedNodeId, setSelectedNodeIdState] = useState<string | null>(null);
  const [selectedElId, setSelectedElId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Selecting a step clears the element selection. Call sites that want a
  // specific element (the Funnel Steps accordion) set it right after, in the
  // same batched event, so the final state is node + element together.
  const setSelectedNodeId = useCallback((id: string | null) => {
    setSelectedNodeIdState(id);
    setSelectedElId(null);
  }, []);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{ data: QuizData; settings: QuizSettings; name: string }>({
    data: initialQuiz.data,
    settings: initialQuiz.settings,
    name: initialQuiz.name,
  });
  // In-flight guard: never run two PATCHes concurrently. If edits arrive
  // while a save is in flight, we queue ONE follow-up save which always
  // sends latest.current - i.e. never an older snapshot than the last sent.
  const inFlight = useRef(false);
  const queued = useRef(false);
  // Optimistic lock baseline: the updated_at we last saw from the server.
  const lastKnownUpdatedAt = useRef<string | null>(initialQuiz.updated_at ?? null);
  // Snapshot of the content we last successfully persisted - used to tell
  // "someone else changed metadata only (publish)" from a real edit conflict.
  const lastSaved = useRef<{ data: string; settings: string; name: string }>({
    data: stableStringify(initialQuiz.data),
    settings: stableStringify(initialQuiz.settings),
    name: initialQuiz.name,
  });

  const save = useCallback(async (): Promise<void> => {
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    inFlight.current = true;
    setSaveState("saving");
    try {
      const payload = { ...latest.current };
      const res = await fetch(`/api/quiz/${initialQuiz.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          ...(lastKnownUpdatedAt.current
            ? { expected_updated_at: lastKnownUpdatedAt.current }
            : {}),
        }),
      });
      if (res.ok) {
        const updated = (await res.json()) as QuizRow;
        lastKnownUpdatedAt.current = updated.updated_at ?? null;
        lastSaved.current = {
          data: stableStringify(payload.data),
          settings: stableStringify(payload.settings),
          name: payload.name,
        };
        setQuiz(updated);
        setSaveState("saved");
      } else if (res.status === 409) {
        // Someone else bumped updated_at. If the server's CONTENT still
        // matches what we last saved (publish/status flips only touch
        // metadata), adopt the new baseline and retry. If content differs,
        // a second editor/adaptation changed it - refuse to clobber.
        const fresh = (await fetch(`/api/quiz/${initialQuiz.id}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)) as QuizRow | null;
        if (
          fresh &&
          stableStringify(fresh.data) === lastSaved.current.data &&
          stableStringify(fresh.settings) === lastSaved.current.settings &&
          fresh.name === lastSaved.current.name
        ) {
          lastKnownUpdatedAt.current = fresh.updated_at ?? null;
          queued.current = true; // retry with the fresh baseline
        } else {
          console.error(
            "[quiz-autosave] Conflict: quiz content was modified in another session - not overwriting. Reload the editor to continue.",
          );
          setSaveState("error");
        }
      } else {
        setSaveState("error");
      }
    } catch {
      setSaveState("error");
    } finally {
      inFlight.current = false;
      if (queued.current) {
        queued.current = false;
        void save();
      }
    }
  }, [initialQuiz.id]);

  const scheduleSave = useCallback(() => {
    setSaveState("dirty");
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = setTimeout(() => void save(), 800);
  }, [save]);

  const setData = useCallback(
    (next: QuizData | ((prev: QuizData) => QuizData)) => {
      setDataState((prev) => {
        const updated = typeof next === "function" ? (next as (p: QuizData) => QuizData)(prev) : next;
        latest.current = { ...latest.current, data: updated };
        scheduleSave();
        return updated;
      });
    },
    [scheduleSave],
  );

  const setSettings = useCallback(
    (next: QuizSettings | ((prev: QuizSettings) => QuizSettings)) => {
      setSettingsState((prev) => {
        const updated = typeof next === "function" ? (next as (p: QuizSettings) => QuizSettings)(prev) : next;
        latest.current = { ...latest.current, settings: updated };
        scheduleSave();
        return updated;
      });
    },
    [scheduleSave],
  );

  const setName = useCallback(
    (name: string) => {
      setQuiz((prev) => ({ ...prev, name }));
      latest.current = { ...latest.current, name };
      scheduleSave();
    },
    [scheduleSave],
  );

  useEffect(() => () => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
  }, []);

  const value = useMemo<QuizContextValue>(
    () => ({ quiz, data, settings, selectedNodeId, selectedElId, saveState, setData, setSettings, setName, setSelectedNodeId, setSelectedElId }),
    [quiz, data, settings, selectedNodeId, selectedElId, saveState, setData, setSettings, setName],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Fires the callback whenever saveState transitions INTO "saved" from a
 * different value. Used by the split-view preview iframe to know when it's
 * safe to reload (i.e. the latest edit has been persisted).
 */
export function useSaveStateChange(onSaved: () => void) {
  const { saveState } = useQuiz();
  const prev = useRef<SaveState | null>(null);
  useEffect(() => {
    if (prev.current !== "saved" && saveState === "saved") {
      onSaved();
    }
    prev.current = saveState;
  }, [saveState, onSaved]);
}
