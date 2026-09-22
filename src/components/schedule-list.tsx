"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { AccordionItem } from "@/components/ui/accordion";

export type ScheduleItem = {
  id: string;
  title: string;
  subtitle: string;
  full: boolean;
  remaining: number;
};

function ScheduleCard({ item: s }: { item: ScheduleItem }) {
  return (
    <GlassCard tone="soft" className="flex items-center justify-between gap-3 p-4">
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
  );
}

// Shows only the first few slots so a long timetable doesn't dominate the
// page; the rest expand in place using the shared accordion pattern.
export function ScheduleList({
  items,
  initialCount = 6,
}: {
  items: ScheduleItem[];
  initialCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const visible = items.slice(0, initialCount);
  const rest = items.slice(initialCount);
  const hasMore = rest.length > 0;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((s) => (
          <ScheduleCard key={s.id} item={s} />
        ))}
      </div>
      {hasMore && (
        <AccordionItem
          open={open}
          onToggle={() => setOpen((v) => !v)}
          className="overflow-hidden rounded-2xl border border-white/40 bg-white/40 shadow-[0_2px_14px_rgba(23,38,61,0.06)] backdrop-blur-md"
          headerClassName="min-h-0 justify-center px-5 py-3"
          chevronSize="sm"
          header={
            <span className="text-sm font-semibold text-[#17263D]">
              {open ? "Tampilkan lebih sedikit" : `Lihat semua jadwal (${items.length})`}
            </span>
          }
        >
          <div className="grid gap-3 px-1 pb-1 pt-3 sm:grid-cols-2">
            {rest.map((s) => (
              <ScheduleCard key={s.id} item={s} />
            ))}
          </div>
        </AccordionItem>
      )}
    </>
  );
}
