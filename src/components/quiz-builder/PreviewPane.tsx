"use client";
import { useState, useCallback } from "react";
import { ExternalLink, RotateCw } from "lucide-react";
import { useQuiz, useSaveStateChange } from "./QuizContext";

const FRAME_W = 380;
const FRAME_H = 780;
const IFRAME_W = 366;
const IFRAME_H = 720;

export function PreviewPane() {
  const { quiz } = useQuiz();
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  // Auto-reload after every successful save
  useSaveStateChange(reload);

  const src = `/quizzes/${quiz.id}/preview?ts=${version}`;

  return (
    <div className="flex flex-col items-center gap-2 p-4 bg-gray-100 border-l border-gray-200 overflow-y-auto"
      style={{ width: FRAME_W + 32 }}>
      <div className="flex gap-2 self-stretch justify-end">
        <button
          type="button"
          onClick={reload}
          aria-label="Refresh preview"
          className="p-1.5 rounded border border-gray-200 bg-white text-gray-600 hover:border-indigo-300"
        >
          <RotateCw size={13} />
        </button>
        <a
          href={`/quizzes/${quiz.id}/preview`}
          target="_blank"
          rel="noreferrer"
          aria-label="Open preview in new tab"
          className="p-1.5 rounded border border-gray-200 bg-white text-gray-600 hover:border-indigo-300"
        >
          <ExternalLink size={13} />
        </a>
      </div>
      <div
        className="rounded-[36px] bg-black p-2 shadow-xl"
        style={{ width: FRAME_W, height: FRAME_H }}
      >
        <iframe
          key={version}
          src={src}
          className="rounded-[28px] bg-white"
          style={{ width: IFRAME_W, height: IFRAME_H, border: "none", display: "block" }}
          title="Quiz preview"
        />
      </div>
    </div>
  );
}
