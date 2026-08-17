import { type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function GlassSelect({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-2xl border border-white/30 bg-white/30 px-4 py-2.5 text-slate-900",
        "shadow-[0_2px_8px_rgba(23,38,61,0.08)] backdrop-blur-xl outline-none",
        "transition-all duration-300 ease-out focus:border-white/60 focus:bg-white/50",
        className
      )}
      {...props}
    />
  );
}
