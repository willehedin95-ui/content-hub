"use client";

import { useState } from "react";
import {
  Save,
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";
import { Language, AspectRatio } from "@/types";

/* ─── Settings type ─────────────────────────────────── */

export interface Settings {
  pages_quality_enabled: boolean;
  pages_quality_threshold: number;
  static_ads_quality_enabled: boolean;
  static_ads_quality_threshold: number;
  static_ads_economy_mode: boolean;
  static_ads_default_languages: Language[];
  static_ads_default_ratios: AspectRatio[];
  static_ads_max_retries: number;
  static_ads_auto_export: boolean;
  static_ads_notification_email: string;
  static_ads_email_enabled: boolean;
  meta_default_daily_budget: number;
  meta_default_objective: string;
  meta_default_schedule_time: string;
  ga4_measurement_ids: Record<string, string>;
  ga4_property_ids: Record<string, string>;
  clarity_project_id: string;
  clarity_api_token: string;
  shopify_domains: string;
  meta_pixel_id: string;
  excluded_ips: string[];
}

/* ─── Common props interface ────────────────────────── */

export interface SettingsProps {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  saved: boolean;
  handleSave: () => void;
}

/* ─── Sub-components ────────────────────────────────── */

export function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
      {children}
    </div>
  );
}

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-6 mb-2">
      {children}
    </h3>
  );
}

export function Row({
  label,
  description,
  descriptionColor,
  action,
}: {
  label: string;
  description: string;
  descriptionColor?: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="min-w-0 mr-4">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className={`text-xs mt-0.5 ${descriptionColor ?? "text-gray-400"}`}>{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

export function RowDivider() {
  return <div className="border-t border-gray-100" />;
}

export function ActionButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-sm text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3.5 py-1.5 transition-colors disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function SaveButton({ saved, onSave }: { saved: boolean; onSave: () => void }) {
  return (
    <div className="mt-4">
      <button
        onClick={onSave}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 transition-colors font-medium"
      >
        {saved ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Save className="w-3.5 h-3.5" />}
        {saved ? "Saved!" : "Save"}
      </button>
    </div>
  );
}

export function GA4TestButton({ propertyId }: { propertyId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function test() {
    setState("loading");
    try {
      const res = await fetch("/api/ga4/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });
      const data = await res.json();
      if (data.ok) {
        setState("ok");
      } else {
        setErrorMsg(data.error || "Test failed");
        setState("error");
      }
    } catch {
      setErrorMsg("Request failed");
      setState("error");
    }
  }

  return (
    <button
      onClick={test}
      disabled={state === "loading"}
      title={state === "error" ? errorMsg : undefined}
      className={`text-xs px-2 py-1.5 rounded-lg border transition-colors ${
        state === "ok"
          ? "border-emerald-200 text-emerald-600 bg-emerald-50"
          : state === "error"
          ? "border-red-200 text-red-500 bg-red-50"
          : "border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50"
      }`}
    >
      {state === "loading" ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : state === "ok" ? (
        <CheckCircle2 className="w-3 h-3" />
      ) : (
        "Test"
      )}
    </button>
  );
}

export function ClarityTokenRow({
  token,
  onChange,
}: {
  token: string;
  onChange: (v: string) => void;
}) {
  const [testState, setTestState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function test() {
    setTestState("loading");
    try {
      const res = await fetch("/api/clarity/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiToken: token }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestState("ok");
      } else {
        setErrorMsg(data.error || "Test failed");
        setTestState("error");
      }
    } catch {
      setErrorMsg("Request failed");
      setTestState("error");
    }
  }

  return (
    <Row
      label="Clarity API Token"
      description={
        testState === "error"
          ? errorMsg
          : token
          ? "Data Export API token"
          : "Clarity Settings → Data Export → Generate token"
      }
      descriptionColor={
        testState === "ok" ? "text-emerald-600" :
        testState === "error" ? "text-red-500" :
        token ? "text-emerald-600" : undefined
      }
      action={
        <div className="flex items-center gap-1.5">
          <input
            type="password"
            value={token}
            onChange={(e) => onChange(e.target.value)}
            placeholder="API token"
            className="w-32 bg-white border border-gray-200 text-gray-800 placeholder-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
          />
          {token && (
            <button
              onClick={test}
              disabled={testState === "loading"}
              className={`text-xs px-2 py-1.5 rounded-lg border transition-colors ${
                testState === "ok"
                  ? "border-emerald-200 text-emerald-600 bg-emerald-50"
                  : testState === "error"
                  ? "border-red-200 text-red-500 bg-red-50"
                  : "border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              {testState === "loading" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : testState === "ok" ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                "Test"
              )}
            </button>
          )}
        </div>
      }
    />
  );
}

export function ExcludeIPRow({
  excludedIps,
  onChange,
}: {
  excludedIps: string[];
  onChange: (ips: string[]) => void;
}) {
  const [detecting, setDetecting] = useState(false);
  const [myIp, setMyIp] = useState<string | null>(null);

  const detectAndBlock = async () => {
    setDetecting(true);
    try {
      const res = await fetch("/api/my-ip");
      const data = await res.json();
      const ip = data.ip;
      setMyIp(ip);
      if (ip && ip !== "unknown" && !excludedIps.includes(ip)) {
        onChange([...excludedIps, ip]);
      }
    } catch {
      // Ignore
    } finally {
      setDetecting(false);
    }
  };

  const removeIp = (ip: string) => {
    onChange(excludedIps.filter((i) => i !== ip));
  };

  return (
    <div className="py-2">
      <div className="flex items-center justify-between">
        <div className="min-w-0 mr-4">
          <p className="text-sm font-medium text-gray-800">Exclude from tracking</p>
          <p className="text-xs mt-0.5 text-gray-400">
            Block your IP so your visits don&apos;t appear in GA4, Clarity, or Meta Pixel
          </p>
        </div>
        <button
          onClick={detectAndBlock}
          disabled={detecting}
          className="text-sm text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3.5 py-1.5 transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {detecting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            "Block my IP"
          )}
        </button>
      </div>
      {myIp && !excludedIps.includes(myIp) && (
        <p className="text-xs text-amber-500 mt-1">Detected: {myIp} (already blocked or unknown)</p>
      )}
      {excludedIps.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {excludedIps.map((ip) => (
            <span
              key={ip}
              className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-md"
            >
              {ip}
              <button
                onClick={() => removeIp(ip)}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-indigo-600" : "bg-gray-200"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}
