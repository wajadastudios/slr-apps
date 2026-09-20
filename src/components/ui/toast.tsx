"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error";

type ToastItem = {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
};

type ToastApi = {
  success: (title: string, message?: string, id?: string) => void;
  error: (title: string, message?: string, id?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const SUCCESS_MS = 4000;
const ERROR_MS = 7000;
const MAX_VISIBLE = 3;

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8 12.4l2.6 2.6L16.2 9.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
      <path
        d="M12 3.6l9 15.6H3L12 3.6z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 10v4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="16.9" r="1" fill="currentColor" />
    </svg>
  );
}

function ToastCard({
  toast,
  onClose,
}: {
  toast: ToastItem;
  onClose: (id: string) => void;
}) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.kind === "error" ? ERROR_MS : SUCCESS_MS);
  const startedAt = useRef(0);

  useEffect(() => {
    if (paused) return;
    startedAt.current = Date.now();
    const timer = setTimeout(() => onClose(toast.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(800, remaining.current - (Date.now() - startedAt.current));
    };
  }, [paused, toast.id, onClose]);

  const isError = toast.kind === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-2xl border p-3.5 shadow-[0_12px_32px_rgba(23,38,61,0.16)] backdrop-blur-xl",
        "[animation:toast-in_0.32s_cubic-bezier(0.22,1,0.36,1)] motion-reduce:[animation:none]",
        isError
          ? "border-[#F2A7B8]/70 bg-[#FFF0F3]/92 text-[#7A1B36]"
          : "border-[#55D6A6]/60 bg-[#E9FBF3]/92 text-[#0E5A43]"
      )}
    >
      <span className={cn("mt-0.5 shrink-0", isError ? "text-[#D6456B]" : "text-[#1FB37F]")}>
        {isError ? <WarningIcon /> : <CheckCircleIcon />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug">{toast.title}</p>
        {toast.message && (
          <p className="mt-0.5 text-sm leading-snug opacity-90">{toast.message}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onClose(toast.id)}
        aria-label="Tutup notifikasi"
        className={cn(
          "-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-200",
          "focus-visible:outline-none focus-visible:ring-2",
          isError
            ? "hover:bg-[#D6456B]/15 focus-visible:ring-[#D6456B]"
            : "hover:bg-[#1FB37F]/15 focus-visible:ring-[#1FB37F]"
        )}
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
          <path
            d="M5.5 5.5l9 9M14.5 5.5l-9 9"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seen = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, title: string, message?: string, id?: string) => {
    const toastId = id ?? `${kind}:${title}:${message ?? ""}`;
    const now = Date.now();
    // Same result twice (StrictMode re-run, double click) -> one toast.
    const last = seen.current.get(toastId);
    if (last !== undefined && now - last < 1500) return;
    seen.current.set(toastId, now);

    setToasts((prev) => {
      const withoutSame = prev.filter((t) => t.id !== toastId);
      return [...withoutSame, { id: toastId, kind, title, message }].slice(-MAX_VISIBLE);
    });
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, message, id) => push("success", title, message, id),
      error: (title, message, id) => push("error", title, message, id),
    }),
    [push]
  );

  // Keyboard: Escape dismisses everything without moving focus anywhere.
  useEffect(() => {
    if (toasts.length === 0) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setToasts([]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toasts.length]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-3 top-3 z-[300] flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-[24rem]"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
