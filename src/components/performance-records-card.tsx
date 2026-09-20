"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { AccordionItem } from "@/components/ui/accordion";
import {
  annotatePersonalBests,
  formatMetricLabel,
  formatMetricValue,
  type PerformanceRecordRow,
} from "@/lib/performance";

// Read-only history of every saved record. Collapsed by default: the summary
// (Record Unlock) is the first thing a parent should see, this is the detail.
export function PerformanceRecordsCard({
  records,
}: {
  records: PerformanceRecordRow[];
}) {
  const [open, setOpen] = useState(false);

  if (records.length === 0) return null;

  const annotated = annotatePersonalBests(records);
  const bests = annotated.filter((r) => r.isPersonalBest);
  const bestByGroup = new Map<string, (typeof annotated)[number]>();
  for (const r of bests) {
    bestByGroup.set(
      [r.metric_type, r.stroke ?? "-", r.metric_type === "waktu_tempuh" ? r.distance_m : "-"].join("|"),
      r
    );
  }
  const currentBests = [...bestByGroup.values()].sort(
    (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
  );
  const history = [...annotated].sort(
    (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
  );

  return (
    <GlassCard className="!p-0">
      <AccordionItem
        variant="ortu"
        open={open}
        onToggle={() => setOpen((v) => !v)}
        className="rounded-3xl"
        headerClassName="min-h-16 rounded-3xl px-6 py-3"
        header={
          <span className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
            Riwayat Rekor
            <span className="ml-2 text-sm font-normal text-slate-500">{records.length} catatan</span>
          </span>
        }
      >
        <div className="px-6 pb-6 pt-1">
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            {currentBests.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-[#35C5D0]/30 bg-[#EEF9FB] px-3 py-2.5"
              >
                <p className="text-xs text-slate-600">{formatMetricLabel(r)}</p>
                <p className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
                  {formatMetricValue(r)}{" "}
                  <span className="text-sm font-normal text-[#35C5D0]">🏆 Rekor Terbaik</span>
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            {history.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm"
              >
                <span className="text-slate-700">
                  {formatMetricLabel(r)} &middot; {r.recorded_at}
                </span>
                <span className="font-medium text-[#17263D]">
                  {formatMetricValue(r)}
                  {r.isPersonalBest && <span className="ml-1.5 text-[#35C5D0]">🏆</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </AccordionItem>
    </GlassCard>
  );
}
