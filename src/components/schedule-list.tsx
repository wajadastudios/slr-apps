"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";

export type ScheduleItem = {
  id: string;
  title: string;
  subtitle: string;
  full: boolean;
  remaining: number;
};

// Shows only the first few slots so a long timetable doesn't dominate the
// page; the rest are one tap away.
export function ScheduleList({
  items,
  initialCount = 6,
}: {
  items: ScheduleItem[];
  initialCount?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, initialCount);
  const hasMore = items.length > initialCount;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((s) => (
          <GlassCard
            key={s.id}
            tone="soft"
            className="flex items-center justify-between gap-3 p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-[#17263D]">{s.title}</p>
              <p className="text-sm text-slate-600">{s.subtitle}</p>
            </div>
            <span
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-center text-xs font-medium ${
                s.full
                  ? "bg-red-500/20 text-red-700"
                  : "bg-[#55D6A6]/20 text-[#1a8f6f]"
              }`}
            >
              {s.full ? "Penuh" : `Sisa ${s.remaining}`}
            </span>
          </GlassCard>
        ))}
      </div>
      {hasMore && (
        <div className="flex justify-center">
          <GlassButton
            type="button"
            aria-expanded={showAll}
            onClick={() => setShowAll((v) => !v)}
            className="px-6 py-2 text-sm"
          >
            {showAll ? "Tampilkan lebih sedikit" : `Lihat semua jadwal (${items.length})`}
          </GlassButton>
        </div>
      )}
    </>
  );
}
