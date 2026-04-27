"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

const LS_KEY = "quiz-editor.preview";
const NARROW_BP = 1024;

export function usePreviewToggle() {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const [narrow, setNarrow] = useState(false);
  // Defer the localStorage read until after mount so server-rendered HTML
  // matches the first client render. Without this the toggle button would
  // hydrate-mismatch when localStorage["quiz-editor.preview"]==="1" and the
  // URL has no ?preview=1 (server renders off, client sees on).
  const [mounted, setMounted] = useState(false);

  const urlSays = params.get("preview") === "1";
  const lsSays = mounted && localStorage.getItem(LS_KEY) === "1";
  const showPreview = !narrow && (urlSays || (!params.has("preview") && lsSays));

  useEffect(() => {
    setMounted(true);
    function check() {
      setNarrow(window.innerWidth < NARROW_BP);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const toggle = useCallback(() => {
    if (narrow) return;
    const next = !showPreview;
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_KEY, next ? "1" : "0");
    }
    const sp = new URLSearchParams(params);
    if (next) sp.set("preview", "1");
    else sp.delete("preview");
    router.replace(`${pathname}?${sp.toString()}`);
  }, [narrow, showPreview, params, pathname, router]);

  return { showPreview, toggle, narrow };
}
