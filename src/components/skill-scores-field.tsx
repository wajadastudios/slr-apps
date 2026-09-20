"use client";

import { useState } from "react";
import { StarRating } from "@/components/ui/star-rating";
import { AccordionItem } from "@/components/ui/accordion";
import type { FormGroup } from "@/lib/indicators";

// The structure (groups + indicators) is defined by admin under Admin >
// Program. Pengajar can only score what is listed here -- names, grouping and
// order are not editable from the report form. Scores are submitted keyed by
// the indicator's stable key, so admin renames never orphan a score.
export function SkillScoresField({
  groups,
  initialScores,
  initiallyOpen = [],
  fieldName = "scores_json",
}: {
  groups: FormGroup[];
  initialScores?: Record<string, number>;
  initiallyOpen?: string[];
  fieldName?: string;
}) {
  const [scores, setScores] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const g of groups) {
      for (const i of g.indicators) initial[i.key] = initialScores?.[i.key] ?? 0;
    }
    return initial;
  });
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.id, initiallyOpen.includes(g.id)]))
  );

  const payload = groups.flatMap((g) =>
    g.indicators.map((i) => ({ name: i.key, score: scores[i.key] ?? 0 }))
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate-800">
        Skor Indikator (0 = belum mampu, 1&ndash;5, boleh setengah)
      </p>

      {groups.length === 0 && (
        <p className="text-sm text-slate-500">
          Program ini belum punya indikator penilaian. Minta admin mengaturnya di Admin &rarr;
          Program.
        </p>
      )}

      {groups.map((group) => {
        const filled = group.indicators.filter((i) => (scores[i.key] ?? 0) > 0).length;
        return (
          <AccordionItem
            key={group.id}
            variant="ortu"
            chevronSize="sm"
            open={open[group.id] ?? false}
            onToggle={() => setOpen((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}
            className="rounded-2xl border border-white/60 bg-white/50"
            headerClassName="min-h-12 rounded-2xl px-3 py-1.5"
            header={
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[#17263D]">{group.name}</span>
                <span className="rounded-full bg-[#EEF9FB] px-2 py-0.5 text-xs text-slate-600">
                  {group.indicators.length} indikator
                </span>
                {filled > 0 && (
                  <span className="rounded-full bg-[#55D6A6]/20 px-2 py-0.5 text-xs text-[#1a8f6f]">
                    {filled} terisi
                  </span>
                )}
              </span>
            }
          >
            <div className="flex flex-col gap-2 px-3 pb-3 pt-1">
              {group.indicators.map((indicator) => (
                <div
                  key={indicator.key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/30 bg-white/50 px-3 py-2"
                >
                  <span className="min-w-[160px] flex-1 text-sm font-medium text-[#17263D]">
                    {indicator.label}
                    {indicator.inactive && (
                      <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        Nonaktif
                      </span>
                    )}
                  </span>
                  <StarRating
                    value={scores[indicator.key] ?? 0}
                    onChange={(v) => setScores((prev) => ({ ...prev, [indicator.key]: v }))}
                  />
                </div>
              ))}
            </div>
          </AccordionItem>
        );
      })}

      <input type="hidden" name={fieldName} value={JSON.stringify(payload)} />
    </div>
  );
}
