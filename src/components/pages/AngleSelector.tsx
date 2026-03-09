"use client";

import { useState } from "react";
import type { PageAngle } from "@/types";

const ANGLES: { value: PageAngle; label: string }[] = [
  { value: "snoring", label: "Snoring" },
  { value: "neck_pain", label: "Neck Pain" },
  { value: "neutral", label: "Neutral" },
];

export default function AngleSelector({
  pageId,
  initialAngle,
}: {
  pageId: string;
  initialAngle: PageAngle;
}) {
  const [angle, setAngle] = useState(initialAngle);
  const [saving, setSaving] = useState(false);

  const handleChange = async (newAngle: PageAngle) => {
    setAngle(newAngle);
    setSaving(true);
    try {
      await fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ angle: newAngle }),
      });
    } catch {
      setAngle(angle); // revert on error
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      {ANGLES.map((a) => (
        <button
          key={a.value}
          onClick={() => handleChange(a.value)}
          disabled={saving}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            angle === a.value
              ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium"
              : "border-gray-200 text-gray-500 hover:border-gray-300"
          } ${saving ? "opacity-50" : ""}`}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
