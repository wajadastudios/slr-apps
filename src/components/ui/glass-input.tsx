import { type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function GlassInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-2xl border border-white/30 bg-white/30 px-4 py-2.5 text-slate-900 placeholder:text-slate-500",
        "shadow-[0_2px_8px_rgba(31,38,135,0.08)] backdrop-blur-xl outline-none",
        "transition-all duration-300 ease-out focus:border-white/60 focus:bg-white/50",
        "dark:border-white/10 dark:bg-white/10 dark:text-white dark:placeholder:text-slate-400",
        className
      )}
      {...props}
    />
  );
}
