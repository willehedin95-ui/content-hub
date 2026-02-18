"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import {
  ToastContext,
  useToastState,
  type Toast as ToastType,
  type ToastVariant,
} from "@/lib/toast";

/* ── variant styles ─────────────────────────────────────────────── */

const variantStyles: Record<
  ToastVariant,
  { container: string; icon: React.ReactNode }
> = {
  success: {
    container:
      "bg-emerald-50 border-emerald-200 text-emerald-700",
    icon: <CheckCircle2 className="h-4 w-4 shrink-0" />,
  },
  error: {
    container: "bg-red-50 border-red-200 text-red-700",
    icon: <AlertCircle className="h-4 w-4 shrink-0" />,
  },
  info: {
    container:
      "bg-indigo-50 border-indigo-200 text-indigo-700",
    icon: <Info className="h-4 w-4 shrink-0" />,
  },
};

/* ── single toast item ──────────────────────────────────────────── */

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastType;
  onDismiss: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  // Enter animation — mount then flip to visible on next frame
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Auto-exit animation shortly before removal
  useEffect(() => {
    const duration = toast.variant === "error" ? 6000 : 4000;
    // Start exit animation 300ms before the toast is removed from state
    const timer = setTimeout(() => setExiting(true), duration - 300);
    return () => clearTimeout(timer);
  }, [toast.variant]);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 300);
  };

  const style = variantStyles[toast.variant];
  const show = visible && !exiting;

  return (
    <div
      className={`
        flex items-start gap-2 max-w-sm w-full rounded-lg border shadow-lg
        px-4 py-3 text-sm pointer-events-auto
        transition-all duration-300 ease-in-out
        ${show ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"}
        ${style.container}
      `}
      role="alert"
    >
      {style.icon}
      <p className="flex-1 leading-snug">{toast.message}</p>
      <button
        onClick={handleDismiss}
        className="shrink-0 hover:opacity-70 transition-opacity"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ── toast container (renders all toasts) ───────────────────────── */

function ToastContainer({
  toasts,
  removeToast,
}: {
  toasts: ToastType[];
  removeToast: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={removeToast} />
      ))}
    </div>
  );
}

/* ── provider ───────────────────────────────────────────────────── */

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const state = useToastState();

  return (
    <ToastContext.Provider value={state}>
      {children}
      <ToastContainer toasts={state.toasts} removeToast={state.removeToast} />
    </ToastContext.Provider>
  );
}
