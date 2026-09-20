"use client";

import { type ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";
import { useFormPending } from "@/components/ui/form-pending";

export function GlassButton({
  className,
  children,
  type,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  // Submit buttons show "Menyimpan..." and lock while their form is saving,
  // whether it is a <ToastForm> (context) or a plain action form (useFormStatus).
  const ctx = useFormPending();
  const status = useFormStatus();
  const isSubmit = type === "submit" || type === undefined;
  const busy = isSubmit && (ctx.pending || status.pending);

  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        "rounded-2xl border border-white/30 bg-white/30 px-5 py-2.5 font-medium text-slate-900",
        "shadow-[0_4px_16px_rgba(23,38,61,0.15)] backdrop-blur-xl",
        "transition-all duration-300 ease-out hover:bg-white/40 hover:shadow-[0_6px_20px_rgba(23,38,61,0.2)]",
        "active:scale-[0.98] active:brightness-90 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {busy ? ctx.label : children}
    </button>
  );
}
