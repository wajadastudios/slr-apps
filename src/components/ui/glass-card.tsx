import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// default: the standard glass card.
// soft:    quieter surface for ordinary content sections, so not every block
//          on a page competes at the same weight.
// strong:  the card that should pull the eye (primary CTA / key summary).
const TONES = {
  default: "",
  soft: "bg-white/45 p-5 shadow-[0_2px_14px_rgba(23,38,61,0.06)]",
  strong:
    "border-white/60 bg-white/70 shadow-[0_16px_48px_rgba(23,38,61,0.18)]",
} as const;

export function GlassCard({
  className,
  tone = "default",
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: keyof typeof TONES }) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-white/30 bg-white/20 p-6 shadow-[0_8px_32px_rgba(23,38,61,0.15)] backdrop-blur-xl",
        "transition-all duration-300 ease-out",
        TONES[tone],
        className
      )}
      {...props}
    />
  );
}
