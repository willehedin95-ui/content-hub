"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { QuizData, QuizRow, QuizSettings } from "@/types/quiz";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
export type QuizContextValue = {
  quiz: QuizRow;
  data: QuizData;
  settings: QuizSettings;
  selectedNodeId: string | null;
  saveState: SaveState;
  setData: (next: QuizData | ((prev: QuizData) => QuizData)) => void;
  setSettings: (next: QuizSettings | ((prev: QuizSettings) => QuizSettings)) => void;
  setName: (name: string) => void;
  setSelectedNodeId: (id: string | null) => void;
};

const Ctx = createContext<QuizContextValue | null>(null);
export function useQuiz() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useQuiz used outside QuizProvider");
  return v;
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{ data: QuizData; settings: QuizSettings; name: string }>({
    data: initialQuiz.data,
    settings: initialQuiz.settings,
    name: initialQuiz.name,
  });

  const save = useCallback(async () => {
    setSaveState("saving");
    const res = await fetch(`/api/quiz/${initialQuiz.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(latest.current),
    });
    if (res.ok) {
      const updated = (await res.json()) as QuizRow;
      setQuiz(updated);
      setSaveState("saved");
    } else {
      setSaveState("error");
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
    () => ({ quiz, data, settings, selectedNodeId, saveState, setData, setSettings, setName, setSelectedNodeId }),
    [quiz, data, settings, selectedNodeId, saveState, setData, setSettings, setName],
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
