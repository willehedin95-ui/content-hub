"use client";

import { createContext, useContext, useState, useCallback } from "react";

export type ToastVariant = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

export interface ToastContextValue {
  toasts: Toast[];
  addToast: (message: string, variant: ToastVariant) => void;
  removeToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

let toastCounter = 0;

export function useToastState() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, variant: ToastVariant) => {
      const id = `toast-${++toastCounter}`;
      setToasts((prev) => [...prev, { id, message, variant }]);

      const duration = variant === "error" ? 6000 : 4000;
      setTimeout(() => removeToast(id), duration);
    },
    [removeToast]
  );

  return { toasts, addToast, removeToast };
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  return {
    success: (message: string) => ctx.addToast(message, "success"),
    error: (message: string) => ctx.addToast(message, "error"),
    info: (message: string) => ctx.addToast(message, "info"),
  };
}
