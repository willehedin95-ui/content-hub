"use client";

import { useState, useRef } from "react";
import TagInput, { TagBadge } from "@/components/ui/tag-input";
import { useAllTags } from "@/lib/hooks/use-all-tags";

interface Props {
  entityId: string;
  entityType: "page" | "image-job";
  initialTags: string[];
}

export default function EditableTags({ entityId, entityType, initialTags }: Props) {
  const [tags, setTags] = useState(initialTags);
  const [editing, setEditing] = useState(false);
  const { tags: allTags, invalidate } = useAllTags();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  function handleChange(newTags: string[]) {
    setTags(newTags);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const endpoint =
        entityType === "page"
          ? `/api/pages/${entityId}`
          : `/api/image-jobs/${entityId}`;
      await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: newTags }),
      });
      invalidate();
    }, 500);
  }

  if (!editing) {
    return (
      <div
        className="flex flex-wrap items-center gap-1.5 cursor-pointer group"
        onClick={() => setEditing(true)}
      >
        {tags.length > 0 ? (
          tags.map((tag) => <TagBadge key={tag} tag={tag} />)
        ) : (
          <span className="text-xs text-gray-400 group-hover:text-indigo-600 transition-colors">
            + Add tags
          </span>
        )}
      </div>
    );
  }

  return (
    <TagInput
      value={tags}
      onChange={handleChange}
      suggestions={allTags}
      placeholder="Add tags..."
      autoFocus
      onBlur={() => setEditing(false)}
    />
  );
}
