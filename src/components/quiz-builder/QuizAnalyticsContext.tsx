"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnalyticsFunnelStep = {
  step_id: string;
  sessions: number;
  dropoff_pct: number;
  median_time_sec: number;
};

export type AnalyticsOptionRow = {
  step_id: string;
  question_el_id: string;
  option_id: string;
  option_count: number;
  option_pct_of_step: number;
};

export type AnalyticsData = {
  funnel: AnalyticsFunnelStep[];
  options: AnalyticsOptionRow[];
  variants: unknown[];
  summary: {
    starts: number;
    completions: number;
    completion_rate: number;
    email_captures: number;
    median_time_to_exit_sec: number;
  } | null;
  range: { since: string; until: string } | null;
};

export type AnalyticsContextValue = {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  data: AnalyticsData | null;
  loading: boolean;
  /** Convenience: get funnel row for a step */
  funnelFor: (stepId: string) => AnalyticsFunnelStep | undefined;
  /** Convenience: get option distribution rows for a step */
  optionsFor: (stepId: string) => AnalyticsOptionRow[];
};

// ─── Context ─────────────────────────────────────────────────────────────────

const SESSION_KEY = "quiz-analytics-enabled";

const Ctx = createContext<AnalyticsContextValue | null>(null);

export function useQuizAnalytics(): AnalyticsContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useQuizAnalytics used outside QuizAnalyticsProvider");
  return v;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function QuizAnalyticsProvider({
  quizId,
  children,
}: {
  quizId: string;
  children: React.ReactNode;
}) {
  const [enabled, setEnabledState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(SESSION_KEY) === "1";
  });

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);

  // Cache: timestamp of last successful fetch
  const lastFetchRef = useRef<number>(0);

  const fetchData = useCallback(() => {
    const now = Date.now();
    // Client-side 60s cache — don't re-fetch if within cache window
    if (now - lastFetchRef.current < 60_000 && data !== null) return;

    setLoading(true);
    fetch(`/api/quiz/${quizId}/analytics?range=last_30d`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: AnalyticsData | null) => {
        if (d) {
          setData(d);
          lastFetchRef.current = Date.now();
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [quizId, data]);

  // Fetch when enabled flips to true
  useEffect(() => {
    if (enabled) {
      fetchData();
    }
  }, [enabled, fetchData]);

  const setEnabled = useCallback((on: boolean) => {
    sessionStorage.setItem(SESSION_KEY, on ? "1" : "0");
    setEnabledState(on);
  }, []);

  const funnelFor = useCallback(
    (stepId: string): AnalyticsFunnelStep | undefined =>
      data?.funnel.find((f) => f.step_id === stepId),
    [data],
  );

  const optionsFor = useCallback(
    (stepId: string): AnalyticsOptionRow[] =>
      data?.options.filter((o) => o.step_id === stepId) ?? [],
    [data],
  );

  return (
    <Ctx.Provider value={{ enabled, setEnabled, data, loading, funnelFor, optionsFor }}>
      {children}
    </Ctx.Provider>
  );
}
