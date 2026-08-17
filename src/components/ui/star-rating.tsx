"use client";

import { cn } from "@/lib/utils";

export function StarRating({
  value,
  onChange,
  size = 20,
  className,
}: {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  className?: string;
}) {
  const readOnly = !onChange;

  return (
    <span
      className={cn("inline-flex gap-0.5", className)}
      role={readOnly ? undefined : "slider"}
      aria-valuemin={readOnly ? undefined : 0.5}
      aria-valuemax={readOnly ? undefined : 5}
      aria-valuenow={readOnly ? undefined : value}
      aria-label={readOnly ? `${value} dari 5 bintang` : "Nilai bintang"}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const pct = Math.max(0, Math.min(1, value - (i - 1))) * 100;
        return (
          <span
            key={i}
            role={readOnly ? undefined : "button"}
            tabIndex={readOnly ? undefined : 0}
            onClick={(e) => {
              if (!onChange) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const isHalf = e.clientX - rect.left < rect.width / 2;
              onChange(i - (isHalf ? 0.5 : 0));
            }}
            className={cn(
              "relative inline-block select-none text-slate-300",
              !readOnly && "cursor-pointer"
            )}
            style={{ fontSize: size, lineHeight: 1 }}
          >
            <span aria-hidden="true">★</span>
            <span
              aria-hidden="true"
              className="absolute inset-0 overflow-hidden text-[#FFC800]"
              style={{ width: `${pct}%` }}
            >
              ★
            </span>
          </span>
        );
      })}
    </span>
  );
}
