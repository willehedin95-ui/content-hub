"use client";

import { createContext, useContext, useMemo } from "react";
import { LANGUAGES } from "@/types";

type LanguageInfo = (typeof LANGUAGES)[number];

interface WorkspaceContextValue {
  languages: LanguageInfo[];
  slug: string;
  product: string;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  languages: LANGUAGES,
  slug: "happysleep",
  product: "happysleep",
});

export function WorkspaceProvider({
  activeLanguages,
  slug,
  product,
  children,
}: {
  activeLanguages: string[];
  slug: string;
  product: string;
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
    <WorkspaceContext.Provider value={{ languages, slug, product }}>
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

/** Returns the current workspace's default product slug (for product-aware selectors). */
export function useWorkspaceProduct(): string {
  return useContext(WorkspaceContext).product;
}
