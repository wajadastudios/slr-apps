"use client";

import { useState } from "react";
import { AccordionItem } from "@/components/ui/accordion";
import type { LevelGroup } from "@/lib/level-summary";

// Read-only session result for Adaptive Swim (support levels) and Aquanatal
// (observations): descriptive wording only -- no stars, averages, or ranking.
export function ParentLevelSummary({
  groups,
  title = "Catatan indikator",
  emptyText = "Belum diamati",
}: {
  groups: LevelGroup[];
  title?: string | null;
  emptyText?: string;
}) {
  const [openName, setOpenName] = useState<string | null>(null);
  if (groups.length === 0) return null;

  return (
    <div className="mt-4">
      {title && <p className="mb-2 text-sm font-semibold text-[#17263D]">{title}</p>}
      <div className="flex flex-col gap-2">
        {groups.map((group) =>
          group.status === "belum_diamati" ? (
            <div
              key={group.name}
              className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-white/60 bg-white/40 px-3 py-2"
            >
              <span className="text-sm font-medium text-slate-500">{group.name}</span>
              <span className="text-xs text-slate-500">{emptyText}</span>
            </div>
          ) : (
            <AccordionItem
              key={group.name}
              variant="ortu"
              chevronSize="sm"
              open={openName === group.name}
              onToggle={() => setOpenName((cur) => (cur === group.name ? null : group.name))}
              className="rounded-xl border border-[#35C5D0]/25 bg-[#EEF9FB]/60"
              headerClassName="min-h-12 rounded-xl px-3 py-1.5"
              header={
                <span className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-2">
                  <span className="text-sm font-semibold text-[#17263D]">{group.name}</span>
                  <span className="text-xs text-slate-500">{group.items.length} indikator</span>
                </span>
              }
            >
              <ul className="flex flex-col gap-2.5 px-3 pb-3 pt-1">
                {group.items.map((item) => (
                  <li key={item.key} className="flex flex-col gap-0.5">
                    <span className="text-sm text-slate-700">{item.label}</span>
                    <span className="text-xs font-medium text-[#0b5f8a]">{item.levelText}</span>
                  </li>
                ))}
              </ul>
            </AccordionItem>
          )
        )}
      </div>
    </div>
  );
}
