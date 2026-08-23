import { GlassCard } from "@/components/ui/glass-card";
import {
  annotatePersonalBests,
  formatMetricLabel,
  formatMetricValue,
  type PerformanceRecordRow,
} from "@/lib/performance";

export function PerformanceRecordsCard({
  records,
}: {
  records: PerformanceRecordRow[];
}) {
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
    <GlassCard>
      <h2 className="mb-4 font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
        Rekor Performa
      </h2>

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
    </GlassCard>
  );
}
