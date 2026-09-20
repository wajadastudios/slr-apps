import { GlassCard } from "@/components/ui/glass-card";
import { LockIcon } from "@/components/ui/lock-icon";
import {
  computeMilestoneStatuses,
  formatMilestoneValue,
  groupStatusesByLevel,
  TIER_ICONS,
  TIER_LABELS,
  type Milestone,
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
  milestones,
}: {
  records: PerformanceRecordRow[];
  milestones: Milestone[];
}) {
  const statuses = computeMilestoneStatuses(records, milestones);
  const grouped = groupStatusesByLevel(statuses);
  const unlocked = statuses.filter((s) => s.tier).length;

  return (
    <GlassCard>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
          Record Unlock
        </h2>
        <span className="rounded-full bg-[#EEF9FB] px-2.5 py-0.5 text-xs font-medium text-[#1597A3]">
          {unlocked} dari {statuses.length} terbuka
        </span>
      </div>
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
              {levelStatuses.map(({ milestone, bestValue, tier, achievedAt, archived }) => {
                const style = tier ? TIER_STYLE[tier] : null;
                const target = formatMilestoneValue(
                  milestone.metric_type,
                  milestone.bronze
                );
                return (
                  <div
                    key={milestone.id}
                    className={`flex min-h-[76px] items-center gap-3 rounded-2xl border p-3.5 shadow-[0_2px_10px_rgba(23,38,61,0.05)] ${
                      style
                        ? `${style.border} ${style.bg}`
                        : "border-[#35C5D0]/25 bg-white/60"
                    }`}
                  >
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                        tier
                          ? "bg-white/70 text-2xl shadow-[0_0_14px_rgba(255,255,255,0.9)]"
                          : "bg-[#EEF9FB] text-[#35C5D0]"
                      }`}
                    >
                      {tier ? TIER_ICONS[tier] : <LockIcon className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-semibold leading-snug ${
                          style ? style.text : "text-[#17263D]"
                        }`}
                      >
                        {milestone.label}
                        {archived && (
                          <span className="ml-1.5 rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            Arsip
                          </span>
                        )}
                      </p>
                      {tier && bestValue !== null ? (
                        <p className={`text-xs ${style!.text}`}>
                          {TIER_LABELS[tier]} &middot;{" "}
                          {formatMilestoneValue(milestone.metric_type, bestValue)}
                          {achievedAt ? ` · ${achievedAt}` : ""}
                        </p>
                      ) : bestValue !== null ? (
                        <p className="text-xs text-slate-600">
                          Percobaan terbaik:{" "}
                          {formatMilestoneValue(milestone.metric_type, bestValue)}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500">Belum ada percobaan</p>
                      )}
                      {!tier && (
                        <p className="text-[11px] text-slate-500">
                          Target perunggu: {target}
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
