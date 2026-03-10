"use client";

import { useState, useEffect, useCallback } from "react";
import { useBuilder } from "../../BuilderContext";

const POSITION_OPTIONS = ["static", "relative", "absolute", "fixed", "sticky"];
const OVERFLOW_OPTIONS = ["visible", "hidden", "auto", "scroll"];

export default function PositionControl() {
  const {
    selectedElRef,
    iframeRef,
    markDirty,
    pushUndoSnapshot,
    hasSelectedEl,
    layersRefreshKey,
  } = useBuilder();

  const [position, setPosition] = useState("static");
  const [top, setTop] = useState("");
  const [right, setRight] = useState("");
  const [bottom, setBottom] = useState("");
  const [left, setLeft] = useState("");
  const [zIndex, setZIndex] = useState("");
  const [overflow, setOverflow] = useState("visible");

  const getComputedValue = useCallback(
    (prop: string): string => {
      const el = selectedElRef.current;
      if (!el) return "";
      const doc = iframeRef.current?.contentDocument;
      if (!doc?.defaultView) return "";
      return doc.defaultView.getComputedStyle(el).getPropertyValue(prop);
    },
    [selectedElRef, iframeRef]
  );

  useEffect(() => {
    if (!hasSelectedEl) return;

    setPosition(getComputedValue("position") || "static");

    // For offsets, prefer inline style so we show what the user set
    const el = selectedElRef.current;
    const readOffset = (prop: string): string => {
      const inline = el?.style.getPropertyValue(prop);
      if (inline) return String(parseInt(inline) || 0);
      const computed = getComputedValue(prop);
      if (computed === "auto" || !computed) return "";
      return "";
    };

    setTop(readOffset("top"));
    setRight(readOffset("right"));
    setBottom(readOffset("bottom"));
    setLeft(readOffset("left"));

    const inlineZ = el?.style.getPropertyValue("z-index");
    const computedZ = getComputedValue("z-index");
    setZIndex(inlineZ || (computedZ === "auto" ? "" : computedZ));

    setOverflow(getComputedValue("overflow") || "visible");
  }, [hasSelectedEl, layersRefreshKey, getComputedValue, selectedElRef]);

  function applyStyle(prop: string, value: string) {
    const el = selectedElRef.current;
    if (!el) return;
    pushUndoSnapshot();
    el.style.setProperty(prop, value);
    markDirty();
  }

  function removeStyle(prop: string) {
    const el = selectedElRef.current;
    if (!el) return;
    pushUndoSnapshot();
    el.style.removeProperty(prop);
    markDirty();
  }

  function handlePositionChange(newPos: string) {
    setPosition(newPos);
    applyStyle("position", newPos);
    if (newPos === "static") {
      const el = selectedElRef.current;
      if (!el) return;
      el.style.removeProperty("top");
      el.style.removeProperty("right");
      el.style.removeProperty("bottom");
      el.style.removeProperty("left");
      el.style.removeProperty("z-index");
      setTop("");
      setRight("");
      setBottom("");
      setLeft("");
      setZIndex("");
    }
  }

  function handleOffsetChange(
    prop: string,
    value: string,
    setter: (v: string) => void
  ) {
    setter(value);
    if (value === "" || value === "-") {
      removeStyle(prop);
    } else {
      applyStyle(prop, `${value}px`);
    }
  }

  const isPositioned = position !== "static";

  const labelClass = "text-[10px] font-medium text-gray-500 mb-0.5 block";
  const selectClass =
    "w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-600 focus:outline-none focus:border-indigo-400";
  const inputClass =
    "w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-indigo-400";

  return (
    <div className="space-y-2.5">
      {/* Position */}
      <div>
        <label className={labelClass}>Position</label>
        <select
          value={position}
          onChange={(e) => handlePositionChange(e.target.value)}
          className={selectClass}
        >
          {POSITION_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {/* Offsets — only when positioned */}
      {isPositioned && (
        <>
          <div>
            <label className="text-[10px] font-medium text-gray-500 mb-1 block">
              Offsets
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { label: "Top", prop: "top", val: top, set: setTop },
                  { label: "Right", prop: "right", val: right, set: setRight },
                  {
                    label: "Bottom",
                    prop: "bottom",
                    val: bottom,
                    set: setBottom,
                  },
                  { label: "Left", prop: "left", val: left, set: setLeft },
                ] as const
              ).map(({ label, prop, val, set }) => (
                <div key={prop}>
                  <label className="text-[9px] text-gray-400 block">
                    {label}
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={val}
                      onChange={(e) =>
                        handleOffsetChange(prop, e.target.value, set)
                      }
                      placeholder="auto"
                      className={inputClass}
                    />
                    <span className="text-[10px] text-gray-400 shrink-0">
                      px
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Z-index */}
          <div>
            <label className={labelClass}>Z-Index</label>
            <input
              type="number"
              value={zIndex}
              onChange={(e) => {
                setZIndex(e.target.value);
                if (e.target.value === "") {
                  removeStyle("z-index");
                } else {
                  applyStyle("z-index", e.target.value);
                }
              }}
              placeholder="auto"
              className={inputClass}
            />
          </div>
        </>
      )}

      {/* Overflow */}
      <div>
        <label className={labelClass}>Overflow</label>
        <select
          value={overflow}
          onChange={(e) => {
            setOverflow(e.target.value);
            applyStyle("overflow", e.target.value);
          }}
          className={selectClass}
        >
          {OVERFLOW_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      {/* Sticky hint */}
      {position === "sticky" && (
        <p className="text-[10px] text-amber-600 bg-amber-50 rounded px-2 py-1.5">
          Sticky requires a <strong>top</strong> offset value (e.g., 0) to work.
          The element will stick when scrolled past that offset.
        </p>
      )}
    </div>
  );
}
