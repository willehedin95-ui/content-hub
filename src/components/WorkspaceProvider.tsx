"use client";

import { createContext, useContext, useMemo } from "react";
import { LANGUAGES } from "@/types";

type LanguageInfo = (typeof LANGUAGES)[number];

interface WorkspaceContextValue {
  languages: LanguageInfo[];
  slug: string;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  languages: LANGUAGES,
  slug: "happysleep",
});

export function WorkspaceProvider({
  activeLanguages,
  slug,
  children,
}: {
  activeLanguages: string[];
  slug: string;
  children: React.ReactNode;
}) {
  const languages = useMemo(
    () =>
      activeLanguages.length > 0
        ? LANGUAGES.filter((l) => activeLanguages.includes(l.value))
        : LANGUAGES,
    [activeLanguages],
  );

  return (
    <WorkspaceContext.Provider value={{ languages, slug }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

/** Returns the LANGUAGES array filtered to the current workspace's enabled languages. */
export function useWorkspaceLanguages(): LanguageInfo[] {
  return useContext(WorkspaceContext).languages;
}

export function useWorkspaceSlug(): string {
  return useContext(WorkspaceContext).slug;
}
