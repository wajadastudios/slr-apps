import { type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function GlassButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "rounded-2xl border border-white/30 bg-white/30 px-5 py-2.5 font-medium text-slate-900",
        "shadow-[0_4px_16px_rgba(31,38,135,0.15)] backdrop-blur-xl",
        "transition-all duration-300 ease-out hover:bg-white/40 hover:shadow-[0_6px_20px_rgba(31,38,135,0.2)]",
        "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        "dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/20",
        className
      )}
      {...props}
    />
  );
}
