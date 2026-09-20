"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { AccordionItem } from "@/components/ui/accordion";
import { LockIcon } from "@/components/ui/lock-icon";
import {
  formatMilestoneValue,
  groupStatusesByLevel,
  isSupervisedOnly,
  pickNextTarget,
  TIER_ICONS,
  TIER_LABELS,
  type MilestoneStatus,
  type Tier,
} from "@/lib/milestones";

const TIER_STYLE: Record<Tier, string> = {
  bronze: "border-[#C97D3A]/40 bg-gradient-to-br from-[#F8E6D3]/90 to-[#F0CFAA]/80 text-[#7A4A1E]",
  silver: "border-[#9AA5B1]/50 bg-gradient-to-br from-[#F1F3F6]/90 to-[#DDE2E8]/80 text-[#4A5560]",
  gold: "border-[#E3B23C]/50 bg-gradient-to-br from-[#FDF0CD]/90 to-[#F5D98F]/80 text-[#7A5A0E]",
};

const NEXT_TIER: Record<Tier, Tier | null> = { bronze: "silver", silver: "gold", gold: null };

const SUPERVISED_NOTE = "Dinilai langsung oleh pengajar saat sesi, dengan pengawasan.";

function StatusPill({ status }: { status: MilestoneStatus }) {
  if (status.tier) {
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${TIER_STYLE[status.tier]}`}
      >
        <span aria-hidden="true">{TIER_ICONS[status.tier]}</span>
        {TIER_LABELS[status.tier]} tercapai
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#EEF9FB] px-2.5 py-1 text-xs font-medium text-slate-500">
      <LockIcon className="h-3 w-3" />
      {status.bestValue === null ? "Belum dicoba" : "Belum tercapai"}
    </span>
  );
}

function RecordRow({ status, caption }: { status: MilestoneStatus; caption: string }) {
  const { milestone, tier, bestValue } = status;
  const next = tier ? NEXT_TIER[tier] : "bronze";

  return (
    <li className="flex flex-col gap-1.5 rounded-xl border border-white/60 bg-white/55 px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{caption}</p>
          <p className="text-sm font-semibold leading-snug text-[#17263D]">{milestone.label}</p>
        </div>
        <StatusPill status={status} />
      </div>
      <p className="text-xs text-slate-600">
        {next ? (
          <>
            Target berikutnya: {TIER_ICONS[next]} {formatMilestoneValue(milestone.metric_type, Number(milestone[next]))}
          </>
        ) : (
          "Semua lencana sudah terbuka 🎉"
        )}
        {bestValue !== null && (
          <>
            {" "}
            &middot; Terbaik: {formatMilestoneValue(milestone.metric_type, bestValue)}
          </>
        )}
      </p>
      {isSupervisedOnly(milestone.metric_type) && (
        <p className="text-[11px] text-slate-400">{SUPERVISED_NOTE}</p>
      )}
    </li>
  );
}

function LevelGroup({
  level,
  statuses,
}: {
  level: string;
  statuses: MilestoneStatus[];
}) {
  const [open, setOpen] = useState(false);
  const unlocked = statuses.filter((s) => s.tier).length;

  return (
    <AccordionItem
      variant="ortu"
      chevronSize="sm"
      open={open}
      onToggle={() => setOpen((v) => !v)}
      className="rounded-xl border border-[#35C5D0]/25 bg-[#EEF9FB]/60"
      headerClassName="min-h-12 rounded-xl px-3 py-1.5"
      header={
        <span className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-2">
          <span className="text-sm font-semibold text-[#17263D]">{level}</span>
          <span className="text-xs text-slate-500">
            {unlocked} dari {statuses.length} terbuka
          </span>
        </span>
      }
    >
      <ul className="flex flex-col gap-2 px-3 pb-3 pt-1">
        {statuses.map((status, index) => (
          <RecordRow key={status.milestone.id} status={status} caption={`${level} ${index + 1}`} />
        ))}
      </ul>
    </AccordionItem>
  );
}

// Parent-facing summary of the milestones: one next goal, a count, and the
// full list tucked behind accordions (all closed until opened).
export function RecordUnlockCard({ statuses }: { statuses: MilestoneStatus[] }) {
  const [allOpen, setAllOpen] = useState(false);
  const unlocked = statuses.filter((s) => s.tier).length;
  const next = pickNextTarget(statuses);
  const groups = groupStatusesByLevel(statuses);

  return (
    <GlassCard>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
          Record Unlock
        </h2>
        <span className="rounded-full bg-[#EEF9FB] px-2.5 py-0.5 text-xs font-medium text-[#1597A3]">
          {unlocked} dari {statuses.length} rekor terbuka
        </span>
      </div>

      {statuses.length === 0 ? (
        <p className="text-sm text-slate-600">Belum ada target rekor yang aktif.</p>
      ) : (
        <>
          <div className="rounded-2xl border border-[#35C5D0]/30 bg-gradient-to-br from-white/80 to-[#EEF9FB]/80 px-4 py-3.5 shadow-[0_2px_12px_rgba(53,197,208,0.10)]">
            {next ? (
              <>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#1597A3]">
                  Target berikutnya
                </p>
                <p className="mt-1 text-base font-semibold text-[#17263D]">
                  <span aria-hidden="true">{TIER_ICONS[next.tier]}</span>{" "}
                  {next.status.milestone.label} &middot;{" "}
                  {formatMilestoneValue(next.status.milestone.metric_type, next.value)}
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  {next.status.bestValue === null
                    ? "Belum ada percobaan"
                    : `Percobaan terbaik: ${formatMilestoneValue(
                        next.status.milestone.metric_type,
                        next.status.bestValue
                      )}`}
                </p>
                {isSupervisedOnly(next.status.milestone.metric_type) && (
                  <p className="mt-1 text-xs text-slate-400">{SUPERVISED_NOTE}</p>
                )}
              </>
            ) : (
              <p className="text-sm font-medium text-[#17263D]">
                Hebat! Semua lencana sudah emas 🎉
              </p>
            )}
          </div>

          <AccordionItem
            variant="ortu"
            open={allOpen}
            onToggle={() => setAllOpen((v) => !v)}
            className="mt-3 rounded-2xl border border-white/60 bg-white/55"
            headerClassName="min-h-14 rounded-2xl px-4 py-2"
            header={<span className="text-sm font-medium text-[#17263D]">Lihat semua record</span>}
          >
            <div className="flex flex-col gap-2 px-3 pb-3 pt-1">
              {groups.map(({ level, statuses: levelStatuses }) => (
                <LevelGroup key={level} level={level} statuses={levelStatuses} />
              ))}
            </div>
          </AccordionItem>
        </>
      )}
    </GlassCard>
  );
}
