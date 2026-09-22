"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// "landing" keeps the original timing used by the public site; "ortu" is the
// parent-area motion: softer ease-out and a slightly larger lift.
type Variant = "landing" | "ortu";

const EASE: Record<Variant, string> = {
  landing: "ease-[cubic-bezier(0.22,1,0.36,1)]",
  ortu: "ease-[cubic-bezier(0.22,1,0.36,1)]",
};

const LIFT_CLOSED: Record<Variant, string> = {
  landing: "-translate-y-[6px]",
  ortu: "-translate-y-2",
};

export function AccordionChevron({
  open,
  size = "md",
  variant = "landing",
}: {
  open: boolean;
  size?: "sm" | "md";
  variant?: Variant;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-white/70 bg-white/60 text-[#35C5D0] shadow-[0_2px_8px_rgba(23,38,61,0.10)] backdrop-blur-md",
        size === "sm" ? "h-8 w-8" : "h-9 w-9",
        "transition-[transform,box-shadow,background-color] duration-300 motion-reduce:transition-none",
        EASE[variant],
        open &&
          "rotate-180 bg-white/85 shadow-[0_0_0_4px_rgba(53,197,208,0.14),0_0_16px_rgba(53,197,208,0.45)]"
      )}
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="h-4 w-4"
      >
        <path d="M5.5 8L10 12.5" />
        <path d="M14.5 8L10 12.5" />
      </svg>
    </span>
  );
}

// The whole header is the button (not just the chevron). The panel stays
// mounted so height/opacity/translate can animate together; `inert` keeps
// its contents out of the tab order and the accessibility tree while closed.
export function AccordionItem({
  open,
  onToggle,
  header,
  children,
  className,
  headerClassName,
  variant = "landing",
  chevronSize = "md",
}: {
  open: boolean;
  onToggle: () => void;
  header: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  variant?: Variant;
  chevronSize?: "sm" | "md";
}) {
  const id = useId();
  const buttonId = `${id}-button`;
  const panelId = `${id}-panel`;

  return (
    <div className={className}>
      <button
        type="button"
        id={buttonId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={cn(
          "flex min-h-14 w-full items-center justify-between gap-3 text-left transition-colors",
          variant === "ortu"
            ? "duration-200 hover:bg-[#35C5D0]/10 active:bg-[#35C5D0]/20"
            : "hover:bg-white/30 active:bg-white/40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#35C5D0]/70",
          headerClassName
        )}
      >
        {header}
        <AccordionChevron open={open} size={chevronSize} variant={variant} />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows,opacity,transform] duration-300 motion-reduce:transition-none",
          EASE[variant],
          open
            ? "translate-y-0 grid-rows-[1fr] opacity-100"
            : `${LIFT_CLOSED[variant]} grid-rows-[0fr] opacity-0`
        )}
      >
        <div className="min-h-0 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
