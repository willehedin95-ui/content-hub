"use client";

import { useState, useEffect, useCallback } from "react";
import { useBuilder } from "../../BuilderContext";
import { ChevronDown, ChevronRight } from "lucide-react";

type Unit = "px" | "%" | "auto" | "fit-content";

const UNITS: Unit[] = ["px", "%", "auto", "fit-content"];

function parseValue(raw: string): { num: string; unit: Unit } {
  if (!raw || raw === "auto" || raw === "none") return { num: "", unit: "auto" };
  if (raw.endsWith("%")) return { num: String(parseFloat(raw)), unit: "%" };
  if (raw.includes("fit-content")) return { num: "", unit: "fit-content" };
  const n = parseFloat(raw);
  return { num: isNaN(n) ? "" : String(Math.round(n)), unit: "px" };
}

interface SizeField {
  label: string;
  prop: string;
  value: string;
  unit: Unit;
  setVal: (v: string) => void;
  setUnit: (u: Unit) => void;
}

export default function SizeControl() {
  const { selectedElRef, iframeRef, markDirty, pushUndoSnapshot, hasSelectedEl, layersRefreshKey } = useBuilder();

  const [widthVal, setWidthVal] = useState("");
  const [widthUnit, setWidthUnit] = useState<Unit>("px");
  const [heightVal, setHeightVal] = useState("");
  const [heightUnit, setHeightUnit] = useState<Unit>("px");
  const [minWVal, setMinWVal] = useState("");
  const [minWUnit, setMinWUnit] = useState<Unit>("px");
  const [minHVal, setMinHVal] = useState("");
  const [minHUnit, setMinHUnit] = useState<Unit>("px");
  const [maxWVal, setMaxWVal] = useState("");
  const [maxWUnit, setMaxWUnit] = useState<Unit>("px");
  const [maxHVal, setMaxHVal] = useState("");
  const [maxHUnit, setMaxHUnit] = useState<Unit>("px");

  const [showAdvanced, setShowAdvanced] = useState(false);

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

  const getInlineValue = useCallback(
    (prop: string): string => {
      const el = selectedElRef.current;
      if (!el) return "";
      return el.style.getPropertyValue(prop);
    },
    [selectedElRef]
  );

  useEffect(() => {
    if (!hasSelectedEl) return;

    // For width/height, prefer inline style, fall back to computed
    function readProp(prop: string): { num: string; unit: Unit } {
      const inline = getInlineValue(prop);
      if (inline) return parseValue(inline);
      return parseValue(getComputedValue(prop));
    }

    const w = readProp("width");
    setWidthVal(w.num);
    setWidthUnit(w.unit);
    const h = readProp("height");
    setHeightVal(h.num);
    setHeightUnit(h.unit);

    const minW = readProp("min-width");
    setMinWVal(minW.num);
    setMinWUnit(minW.unit);
    const minH = readProp("min-height");
    setMinHVal(minH.num);
    setMinHUnit(minH.unit);

    const maxW = readProp("max-width");
    setMaxWVal(maxW.num);
    setMaxWUnit(maxW.unit);
    const maxH = readProp("max-height");
    setMaxHVal(maxH.num);
    setMaxHUnit(maxH.unit);
  }, [hasSelectedEl, layersRefreshKey, getComputedValue, getInlineValue]);

  function applyStyle(prop: string, value: string) {
    const el = selectedElRef.current;
    if (!el) return;
    pushUndoSnapshot();
    el.style.setProperty(prop, value);
    markDirty();
  }

  function handleChange(field: SizeField, newVal: string, newUnit: Unit) {
    field.setVal(newVal);
    field.setUnit(newUnit);

    if (newUnit === "auto") {
      applyStyle(field.prop, "auto");
    } else if (newUnit === "fit-content") {
      applyStyle(field.prop, "fit-content");
    } else if (newVal) {
      applyStyle(field.prop, `${newVal}${newUnit}`);
    }
  }

  const widthField: SizeField = {
    label: "Width",
    prop: "width",
    value: widthVal,
    unit: widthUnit,
    setVal: setWidthVal,
    setUnit: setWidthUnit,
  };

  const heightField: SizeField = {
    label: "Height",
    prop: "height",
    value: heightVal,
    unit: heightUnit,
    setVal: setHeightVal,
    setUnit: setHeightUnit,
  };

  const advancedFields: SizeField[] = [
    { label: "Min-W", prop: "min-width", value: minWVal, unit: minWUnit, setVal: setMinWVal, setUnit: setMinWUnit },
    { label: "Min-H", prop: "min-height", value: minHVal, unit: minHUnit, setVal: setMinHVal, setUnit: setMinHUnit },
    { label: "Max-W", prop: "max-width", value: maxWVal, unit: maxWUnit, setVal: setMaxWVal, setUnit: setMaxWUnit },
    { label: "Max-H", prop: "max-height", value: maxHVal, unit: maxHUnit, setVal: setMaxHVal, setUnit: setMaxHUnit },
  ];

  const isDisabled = (unit: Unit) => unit === "auto" || unit === "fit-content";

  function getComputedPx(prop: string): string {
    const computed = getComputedValue(prop);
    const n = parseFloat(computed);
    return isNaN(n) ? "0" : String(Math.round(n));
  }

  // --- Width preset detection ---
  const widthPreset: "fill" | "wrap" | "fixed" | null =
    widthUnit === "%" && widthVal === "100"
      ? "fill"
      : widthUnit === "fit-content"
        ? "wrap"
        : widthUnit === "px"
          ? "fixed"
          : null;

  // --- Height preset detection ---
  const heightPreset: "hug" | "fill" | "fixed" | null =
    heightUnit === "auto"
      ? "hug"
      : heightUnit === "%" && heightVal === "100"
        ? "fill"
        : heightUnit === "px"
          ? "fixed"
          : null;

  const presetBtnClass = (active: boolean) =>
    `flex-1 py-1 rounded text-[10px] font-medium transition-colors ${
      active
        ? "bg-white text-indigo-600 shadow-sm"
        : "text-gray-500 hover:text-gray-700"
    }`;

  const labelClass = "text-[10px] font-medium text-gray-500 mb-0.5 block";

  function renderInputRow(field: SizeField) {
    return (
      <div className="flex gap-1">
        <input
          type="number"
          value={field.value}
          onChange={(e) => handleChange(field, e.target.value, field.unit)}
          disabled={isDisabled(field.unit)}
          className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-indigo-400 disabled:bg-gray-50 disabled:text-gray-300"
        />
        <select
          value={field.unit}
          onChange={(e) => handleChange(field, field.value, e.target.value as Unit)}
          className="text-[10px] border border-gray-200 rounded px-1 py-1 bg-white text-gray-600 focus:outline-none focus:border-indigo-400"
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Width */}
      <div>
        <label className={labelClass}>Width</label>
        <div className="flex gap-0.5 bg-gray-100 rounded p-0.5 mb-1.5">
          <button
            className={presetBtnClass(widthPreset === "fill")}
            onClick={() => handleChange(widthField, "100", "%")}
          >
            Fill
          </button>
          <button
            className={presetBtnClass(widthPreset === "wrap")}
            onClick={() => handleChange(widthField, "", "fit-content")}
          >
            Wrap
          </button>
          <button
            className={presetBtnClass(widthPreset === "fixed")}
            onClick={() => {
              const px = getComputedPx("width");
              handleChange(widthField, px, "px");
            }}
          >
            Fixed
          </button>
        </div>
        {renderInputRow(widthField)}
      </div>

      {/* Height */}
      <div>
        <label className={labelClass}>Height</label>
        <div className="flex gap-0.5 bg-gray-100 rounded p-0.5 mb-1.5">
          <button
            className={presetBtnClass(heightPreset === "hug")}
            onClick={() => handleChange(heightField, "", "auto")}
          >
            Hug
          </button>
          <button
            className={presetBtnClass(heightPreset === "fill")}
            onClick={() => handleChange(heightField, "100", "%")}
          >
            Fill
          </button>
          <button
            className={presetBtnClass(heightPreset === "fixed")}
            onClick={() => {
              const px = getComputedPx("height");
              handleChange(heightField, px, "px");
            }}
          >
            Fixed
          </button>
        </div>
        {renderInputRow(heightField)}
      </div>

      {/* Advanced toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
      >
        {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Min / Max
      </button>

      {/* Advanced fields */}
      {showAdvanced && (
        <div className="grid grid-cols-2 gap-2">
          {advancedFields.map((f) => (
            <div key={f.prop}>
              <label className={labelClass}>{f.label}</label>
              <div className="flex gap-1">
                <input
                  type="number"
                  value={f.value}
                  onChange={(e) => handleChange(f, e.target.value, f.unit)}
                  disabled={isDisabled(f.unit)}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-indigo-400 disabled:bg-gray-50 disabled:text-gray-300"
                />
                <select
                  value={f.unit}
                  onChange={(e) => handleChange(f, f.value, e.target.value as Unit)}
                  className="text-[10px] border border-gray-200 rounded px-1 py-1 bg-white text-gray-600 focus:outline-none focus:border-indigo-400"
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
