"use client";

import { useState } from "react";
import { AccordionItem } from "@/components/ui/accordion";
import type { FormGroup } from "@/lib/indicators";
import type { Level } from "@/lib/programs";

// Report-form field for programs that are not scored with stars: each
// indicator gets one choice from a fixed scale (support level, or session
// observation). Values post as [{ name: indicator key, score: level value }].
export function LevelScoresField({
  groups,
  levels,
  legend,
  initialScores,
  initiallyOpen = [],
  fieldName = "scores_json",
}: {
  groups: FormGroup[];
  levels: Level[];
  legend: string;
  initialScores?: Record<string, number>;
  initiallyOpen?: string[];
  fieldName?: string;
}) {
  const [values, setValues] = useState<Record<string, number>>(() => {
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
    g.indicators.map((i) => ({ name: i.key, score: values[i.key] ?? 0 }))
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate-800">{legend}</p>

      {groups.length === 0 && (
        <p className="text-sm text-slate-500">
          Program ini belum punya indikator. Minta admin mengaturnya di Admin &rarr; Penilaian Program.
        </p>
      )}

      {groups.map((group) => {
        const filled = group.indicators.filter((i) => (values[i.key] ?? 0) > 0).length;
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
                  <span className="rounded-full bg-[#DDF7EE] px-2 py-0.5 text-xs text-[#0f6b52]">
                    {filled} diisi
                  </span>
                )}
              </span>
            }
          >
            <div className="flex flex-col gap-2 px-3 pb-3 pt-1">
              {group.indicators.map((indicator) => (
                <div
                  key={indicator.key}
                  className="rounded-xl border border-white/30 bg-white/50 px-3 py-2.5"
                >
                  <p className="mb-2 text-sm font-medium text-[#17263D]">
                    {indicator.label}
                    {indicator.inactive && (
                      <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        Nonaktif
                      </span>
                    )}
                  </p>
                  <div role="radiogroup" aria-label={indicator.label} className="flex flex-wrap gap-1.5">
                    {levels.map((level) => {
                      const selected = (values[indicator.key] ?? 0) === level.value;
                      return (
                        <button
                          key={level.value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setValues((prev) => ({ ...prev, [indicator.key]: level.value }))}
                          className={`min-h-10 rounded-xl border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35C5D0] ${
                            selected
                              ? "border-[#35C5D0] bg-[#35C5D0] text-white shadow-[0_2px_8px_rgba(53,197,208,0.35)]"
                              : "border-white/60 bg-white/70 text-slate-700 hover:bg-[#35C5D0]/15"
                          }`}
                        >
                          {level.label}
                        </button>
                      );
                    })}
                  </div>
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
