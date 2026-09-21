"use client";

import { useRef, type ReactNode } from "react";
import { DESTRUCTIVE_BUTTON, ADMIN_CTA, SECONDARY_BUTTON } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

// A real confirmation dialog that says what will happen. It must sit INSIDE the
// <form> it confirms: "Ya, lanjutkan" is that form's submit button, so the
// hidden fields and the action stay exactly as the form defines them.
export function ImpactConfirm({
  label,
  title,
  impacts,
  confirmLabel = "Ya, lanjutkan",
  destructive = false,
  primary = false,
  name,
  value,
  className,
  children,
}: {
  label: ReactNode;
  title: string;
  // what the change affects, one line each
  impacts: string[];
  confirmLabel?: string;
  destructive?: boolean;
  // the screen's main action: the opening button uses the turquoise CTA look
  primary?: boolean;
  name?: string;
  value?: string;
  className?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const base =
    "inline-flex min-h-10 items-center justify-center rounded-2xl border border-white/30 px-4 py-2 text-sm font-semibold shadow-[0_4px_16px_rgba(23,38,61,0.12)] transition-all disabled:opacity-50";

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className={cn(base, destructive ? DESTRUCTIVE_BUTTON : primary ? ADMIN_CTA : SECONDARY_BUTTON, className)}
      >
        {label}
      </button>
      <dialog
        ref={ref}
        className="m-auto w-[min(92vw,28rem)] rounded-3xl border border-white/60 bg-white p-0 text-slate-900 shadow-[0_24px_64px_rgba(23,38,61,0.35)] backdrop:bg-[#17263D]/40 backdrop:backdrop-blur-sm"
      >
        <div className="flex flex-col gap-3 p-5">
          <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">{title}</h2>
          {impacts.length > 0 && (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-slate-700">
              {impacts.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          {children}
          <div className="mt-1 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className={cn(base, SECONDARY_BUTTON)}
            >
              Batal
            </button>
            <button
              type="submit"
              name={name}
              value={value}
              onClick={() => ref.current?.close()}
              className={cn(base, destructive ? DESTRUCTIVE_BUTTON : ADMIN_CTA)}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

// Drop-in for the admin delete buttons: same `message`, but a real dialog that
// says what will happen and the same destructive look everywhere.
export function DeleteConfirm({
  message,
  title = "Hapus data ini?",
  children,
  className,
}: {
  message: string;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <ImpactConfirm
      label={children}
      title={title}
      impacts={[message]}
      destructive
      confirmLabel="Ya, hapus"
      className={className}
    />
  );
}
