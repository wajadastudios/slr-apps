"use client";

import { useState } from "react";
import { AccordionItem } from "@/components/ui/accordion";
import { StarRating } from "@/components/ui/star-rating";
import { formatScore, scoreLabel, type GroupSummary } from "@/lib/report-summary";

const STATUS_TEXT = {
  belum_dinilai: "Belum dinilai",
  belum_dimulai: "Belum dimulai",
} as const;

// Read-only result of one report, grouped like the pengajar's form: every
// group starts closed and shows its average; nothing here can be edited.
export function ParentIndicatorSummary({
  groups,
  title = "Penilaian indikator",
}: {
  groups: GroupSummary[];
  title?: string | null;
}) {
  const [openName, setOpenName] = useState<string | null>(null);

  if (groups.length === 0) return null;

  return (
    <div className="mt-4">
      {title && <p className="mb-2 text-sm font-semibold text-[#17263D]">{title}</p>}
      <div className="flex flex-col gap-2">
        {groups.map((group) => {
          if (group.status !== "dinilai") {
            return (
              <div
                key={group.name}
                className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-white/60 bg-white/40 px-3 py-2"
              >
                <span className="text-sm font-medium text-slate-500">{group.name}</span>
                <span className="text-xs text-slate-400">{STATUS_TEXT[group.status]}</span>
              </div>
            );
          }

          return (
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
                  <span className="text-xs text-slate-500">
                    {group.items.length} indikator &middot; rata-rata{" "}
                    {formatScore(group.average ?? 0)}
                  </span>
                </span>
              }
            >
              <div className="flex flex-col gap-3 px-3 pb-3 pt-1">
                {group.items.map((item) => (
                  <div key={item.key} className="flex flex-col gap-0.5">
                    <span className="text-sm text-slate-700">{item.label}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                      <StarRating value={item.score} size={15} />
                      <span>
                        {formatScore(item.score)} / 5 &middot; {scoreLabel(item.score)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </AccordionItem>
          );
        })}
      </div>
    </div>
  );
}
