"use client";

import { useState, useEffect } from "react";

let cachedTags: string[] | null = null;

export function useAllTags() {
  const [tags, setTags] = useState<string[]>(cachedTags ?? []);
  const [loading, setLoading] = useState(!cachedTags);

  useEffect(() => {
    if (cachedTags) return;
    fetch("/api/tags")
      .then((res) => res.json())
      .then((data) => {
        cachedTags = data.tags ?? [];
        setTags(cachedTags!);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function invalidate() {
    cachedTags = null;
    fetch("/api/tags")
      .then((res) => res.json())
      .then((data) => {
        cachedTags = data.tags ?? [];
        setTags(cachedTags!);
      })
      .catch(() => {});
  }

  return { tags, loading, invalidate };
}
