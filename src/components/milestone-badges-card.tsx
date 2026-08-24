import { GlassCard } from "@/components/ui/glass-card";
import {
  computeMilestoneStatuses,
  formatMilestoneValue,
  groupStatusesByLevel,
  TIER_ICONS,
  TIER_LABELS,
  type Tier,
} from "@/lib/milestones";
import type { PerformanceRecordRow } from "@/lib/performance";

const TIER_STYLE: Record<Tier, { border: string; bg: string; text: string }> = {
  bronze: {
    border: "border-[#C97D3A]/50",
    bg: "bg-gradient-to-br from-[#F3D9BE] to-[#EAC29A]",
    text: "text-[#7A4A1E]",
  },
  silver: {
    border: "border-[#9AA5B1]/60",
    bg: "bg-gradient-to-br from-[#EDF0F3] to-[#D6DCE3]",
    text: "text-[#4A5560]",
  },
  gold: {
    border: "border-[#E3B23C]/60",
    bg: "bg-gradient-to-br from-[#FCE9BB] to-[#F3D082]",
    text: "text-[#7A5A0E]",
  },
};

export function MilestoneBadgesCard({
  records,
}: {
  records: PerformanceRecordRow[];
}) {
  const statuses = computeMilestoneStatuses(records);
  const grouped = groupStatusesByLevel(statuses);

  return (
    <GlassCard>
      <h2 className="mb-1 font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
        Record Unlock
      </h2>
      <p className="mb-4 text-sm text-slate-600">
        Satu rekor andalan per jenjang latihan &mdash; tercapai atau lebih baik
        membuka lencana perunggu, perak, atau emas.
      </p>

      <div className="flex flex-col gap-4">
        {grouped.map(({ level, statuses: levelStatuses }) => (
          <div key={level}>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              {level}
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {levelStatuses.map(({ milestone, bestValue, tier, achievedAt }) => {
                const style = tier ? TIER_STYLE[tier] : null;
                return (
                  <div
                    key={milestone.id}
                    className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 ${
                      style
                        ? `${style.border} ${style.bg}`
                        : "border-dashed border-slate-300/60 bg-white/30"
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl ${
                        tier ? "bg-white/50" : "bg-slate-200/50 grayscale opacity-60"
                      }`}
                    >
                      {tier ? TIER_ICONS[tier] : "🔒"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-semibold ${
                          style ? style.text : "text-slate-600"
                        }`}
                      >
                        {milestone.label}
                      </p>
                      {tier && bestValue !== null ? (
                        <p className={`text-xs ${style!.text}`}>
                          {TIER_LABELS[tier]} &middot;{" "}
                          {formatMilestoneValue(milestone.metric_type, bestValue)}
                          {achievedAt ? ` · ${achievedAt}` : ""}
                        </p>
                      ) : bestValue !== null ? (
                        <p className="text-xs text-slate-500">
                          Percobaan terbaik:{" "}
                          {formatMilestoneValue(milestone.metric_type, bestValue)} &middot; target
                          perunggu:{" "}
                          {formatMilestoneValue(milestone.metric_type, milestone.tiers.bronze)}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500">
                          Belum ada percobaan &middot; target perunggu:{" "}
                          {formatMilestoneValue(milestone.metric_type, milestone.tiers.bronze)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
