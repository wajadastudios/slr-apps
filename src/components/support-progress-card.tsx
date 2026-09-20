"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { AccordionItem } from "@/components/ui/accordion";
import type { SupportChange } from "@/lib/level-summary";

// Adaptive Swim progress: how each indicator moved from the first observed
// support level to the latest one. Descriptive only -- no stars, percentages
// or comparison with anyone else.
export function SupportProgressCard({ changes }: { changes: SupportChange[] }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const groups = changes.reduce<{ name: string; items: SupportChange[] }[]>((acc, c) => {
    const last = acc[acc.length - 1];
    if (last && last.name === c.group) last.items.push(c);
    else acc.push({ name: c.group, items: [c] });
    return acc;
  }, []);
  const moreIndependent = changes.filter((c) => c.moreIndependent).length;

  return (
    <GlassCard>
      <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
        Perkembangan Kemandirian
      </h2>
      <p className="mb-3 text-sm text-slate-600">
        Perubahan tingkat dukungan dari sesi pertama diamati sampai sesi terakhir, untuk setiap indikator.
      </p>

      {changes.length === 0 ? (
        <p className="text-sm text-slate-600">Belum ada indikator yang diamati.</p>
      ) : (
        <>
          <p className="mb-3 rounded-2xl bg-[#DDF7EE] px-4 py-2.5 text-sm font-medium text-[#0f6b52]">
            {moreIndependent > 0
              ? `${moreIndependent} indikator sudah lebih mandiri dibanding awal.`
              : "Terus berlatih dengan ritme sendiri — pengajar akan mencatat setiap perubahan."}
          </p>
          <div className="flex flex-col gap-2">
            {groups.map((group) => (
              <AccordionItem
                key={group.name}
                variant="ortu"
                chevronSize="sm"
                open={openGroup === group.name}
                onToggle={() => setOpenGroup((cur) => (cur === group.name ? null : group.name))}
                className="rounded-xl border border-[#35C5D0]/25 bg-[#EEF9FB]/60"
                headerClassName="min-h-12 rounded-xl px-3 py-1.5"
                header={
                  <span className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-2">
                    <span className="text-sm font-semibold text-[#17263D]">{group.name}</span>
                    <span className="text-xs text-slate-500">{group.items.length} indikator diamati</span>
                  </span>
                }
              >
                <ul className="flex flex-col gap-3 px-3 pb-3 pt-1">
                  {group.items.map((item) => (
                    <li key={item.key} className="flex flex-col gap-0.5">
                      <span className="text-sm text-slate-700">{item.label}</span>
                      <span className="text-xs text-slate-500">
                        Awal: {item.firstText} &rarr; Terbaru:{" "}
                        <span className="font-medium text-[#0b5f8a]">{item.latestText}</span>
                      </span>
                      {item.moreIndependent && (
                        <span className="w-fit rounded-full bg-[#DDF7EE] px-2 py-0.5 text-[11px] font-medium text-[#0f6b52]">
                          Lebih mandiri dari awal
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </AccordionItem>
            ))}
          </div>
        </>
      )}
    </GlassCard>
  );
}
