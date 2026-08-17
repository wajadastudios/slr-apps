import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DataRow({
  primary,
  secondary,
  action,
  muted,
  className,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  action?: ReactNode;
  muted?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 items-center gap-3 rounded-xl border border-white/30 bg-white/40 px-4 py-2.5 transition-colors sm:grid-cols-[minmax(0,1fr)_auto]",
        muted && "opacity-60",
        className
      )}
    >
      <div className="min-w-0">
        <div className="font-medium text-[#17263D] sm:truncate">{primary}</div>
        {secondary && (
          <div className="text-sm text-slate-600">{secondary}</div>
        )}
      </div>
      {action && (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
          {action}
        </div>
      )}
    </div>
  );
}
