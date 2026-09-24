"use client";

import { cn } from "@/lib/utils";

const MIN = 0;
const MAX = 5;
const STEP = 0.5;

const clamp = (v: number) => Math.max(MIN, Math.min(MAX, v));

// Value text for screen readers: the raw number alone ("2.5") doesn't say
// what it means, and 0 has a specific label elsewhere in the app ("belum
// mampu") that a bare "0" would not convey.
function valueText(value: number): string {
  return value === 0 ? "Belum mampu" : `${value} dari 5`;
}

export function StarRating({
  value,
  onChange,
  size = 20,
  className,
  label,
}: {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  className?: string;
  // Indicator name, so a screen reader announces which indicator this
  // control scores instead of a generic "Nilai bintang" for every row.
  label?: string;
}) {
  const readOnly = !onChange;

  // role="slider" on a single focusable element, not five separate
  // role="button" spans -- half-star granularity (0.5 steps) doesn't map to
  // a 0-5 radio group, and five untabbable-by-name button stops per
  // indicator was unusable by keyboard/screen reader anyway (no keydown
  // handler existed at all before this fix).
  function handleKeyDown(e: React.KeyboardEvent) {
    if (!onChange) return;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        e.preventDefault();
        onChange(clamp(value + STEP));
        break;
      case "ArrowLeft":
      case "ArrowDown":
        e.preventDefault();
        onChange(clamp(value - STEP));
        break;
      case "Home":
        e.preventDefault();
        onChange(MIN);
        break;
      case "End":
        e.preventDefault();
        onChange(MAX);
        break;
    }
  }

  return (
    <span
      className={cn(
        "inline-flex gap-0.5 rounded",
        !readOnly &&
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35C5D0] focus-visible:ring-offset-1",
        className
      )}
      role={readOnly ? undefined : "slider"}
      tabIndex={readOnly ? undefined : 0}
      aria-valuemin={readOnly ? undefined : MIN}
      aria-valuemax={readOnly ? undefined : MAX}
      aria-valuenow={readOnly ? undefined : value}
      aria-valuetext={readOnly ? undefined : valueText(value)}
      aria-label={
        readOnly
          ? `${label ? `${label}: ` : ""}${value} dari 5 bintang`
          : label
            ? `Nilai ${label}`
            : "Nilai bintang"
      }
      onKeyDown={handleKeyDown}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const pct = Math.max(0, Math.min(1, value - (i - 1))) * 100;
        return (
          <span
            key={i}
            aria-hidden="true"
            onClick={(e) => {
              if (!onChange) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const isHalf = e.clientX - rect.left < rect.width / 2;
              const next = i - (isHalf ? 0.5 : 0);
              // Clicking the same spot again clears it to 0 ("belum
              // mampu") -- otherwise 0.5 would be the lowest reachable
              // value, with no way back down to "not yet able".
              onChange(next === value ? 0 : next);
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
