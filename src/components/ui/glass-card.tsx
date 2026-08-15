import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function GlassCard({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-white/30 bg-white/20 p-6 shadow-[0_8px_32px_rgba(31,38,135,0.15)] backdrop-blur-xl",
        "transition-all duration-300 ease-out",
        "dark:border-white/10 dark:bg-white/5",
        className
      )}
      {...props}
    />
  );
}
