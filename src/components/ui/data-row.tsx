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
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-white/30 bg-white/40 px-4 py-2.5 transition-colors",
        muted && "opacity-60",
        className
      )}
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-[#17263D]">{primary}</p>
        {secondary && (
          <p className="truncate text-sm text-slate-600">{secondary}</p>
        )}
      </div>
      {action && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {action}
        </div>
      )}
    </div>
  );
}
