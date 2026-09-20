"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { AccordionItem } from "@/components/ui/accordion";
import { LockIcon } from "@/components/ui/lock-icon";
import { TierMedal, MEDAL_NAME } from "@/components/ui/tier-medal";
import {
  formatMilestoneValue,
  groupStatusesByLevel,
  isSupervisedOnly,
  latestTopMedal,
  pickNextTarget,
  tierReached,
  TIERS,
  TIER_LABELS,
  type MilestoneStatus,
  type Tier,
} from "@/lib/milestones";

const TIER_STYLE: Record<Tier, string> = {
  bronze: "border-[#C97D3A]/50 bg-gradient-to-br from-[#F8E6D3] to-[#F0CFAA] text-[#6B3A12]",
  silver: "border-[#9AA5B1]/60 bg-gradient-to-br from-[#F4F6F9] to-[#DDE2E8] text-[#3F4B57]",
  gold: "border-[#E3B23C]/60 bg-gradient-to-br from-[#FDF0CD] to-[#F5D98F] text-[#6E4A00]",
};

const NEXT_TIER: Record<Tier, Tier | null> = { bronze: "silver", silver: "gold", gold: null };

const SUPERVISED_NOTE = "Dinilai langsung oleh pengajar saat sesi, dengan pengawasan.";

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

// The main status is always the highest medal held, in its own colours; a
// milestone with no medal shows a neutral lock, never a bronze placeholder.
function StatusPill({ status }: { status: MilestoneStatus }) {
  if (status.tier) {
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1.5 pr-3 text-xs font-bold ${TIER_STYLE[status.tier]}`}
      >
        <TierMedal tier={status.tier} size={22} decorative />
        {MEDAL_NAME[status.tier]}
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
      <LockIcon className="h-3 w-3" />
      {status.bestValue === null ? "Belum dicoba" : "Belum tercapai"}
    </span>
  );
}

function RecordRow({ status, caption }: { status: MilestoneStatus; caption: string }) {
  const [open, setOpen] = useState(false);
  const { milestone, tier, bestValue, archived } = status;
  const next = tier ? NEXT_TIER[tier] : "bronze";
  const value = (t: Tier) => formatMilestoneValue(milestone.metric_type, Number(milestone[t]));

  return (
    <li>
      <AccordionItem
        variant="ortu"
        chevronSize="sm"
        open={open}
        onToggle={() => setOpen((v) => !v)}
        className="rounded-xl border border-white/60 bg-white/55"
        headerClassName="min-h-16 rounded-xl px-3 py-2"
        header={
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {caption}
                  {archived && (
                    <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium normal-case text-slate-600">
                      Arsip
                    </span>
                  )}
                </span>
                <span className="block text-sm font-semibold leading-snug text-[#17263D]">
                  {milestone.label}
                </span>
              </span>
              <StatusPill status={status} />
            </span>
            <span className="text-xs text-slate-600">
              {bestValue !== null
                ? `Rekor terbaik: ${formatMilestoneValue(milestone.metric_type, bestValue)}`
                : "Belum ada percobaan"}
              {" · "}
              {next ? (
                <span className="inline-flex items-center gap-1 align-middle">
                  Target berikutnya: <TierMedal tier={next} size={16} decorative /> {value(next)}
                </span>
              ) : (
                <>Target emas: {value("gold")}</>
              )}
            </span>
          </span>
        }
      >
        <div className="flex flex-col gap-2 px-3 pb-3 pt-1">
          <ul className="flex flex-col gap-1.5">
            {TIERS.map((t) => {
              const reached = tierReached(tier, t);
              return (
                <li
                  key={t}
                  className={`flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-sm ${
                    reached ? "bg-white/80" : "bg-white/40"
                  }`}
                >
                  <span className="flex items-center gap-2 text-[#17263D]">
                    <TierMedal tier={t} size={22} decorative />
                    <span className="font-medium">{TIER_LABELS[t]}</span>
                    <span className="text-slate-600">{value(t)}</span>
                  </span>
                  {reached ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0f6b52]">
                      <CheckIcon />
                      Tercapai
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">Belum</span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-slate-500">
            {milestone.metric_type === "waktu_tempuh"
              ? "Untuk waktu, angka lebih kecil berarti lebih baik."
              : "Angka lebih besar berarti lebih baik."}
          </p>
          {isSupervisedOnly(milestone.metric_type) && (
            <p className="text-[11px] text-slate-500">{SUPERVISED_NOTE}</p>
          )}
        </div>
      </AccordionItem>
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

// Summary of the milestones for parents, pengajar and admin: the newest top
// medal, the next goal and a count, with the full list folded behind
// accordions (everything closed until opened).
export function RecordUnlockCard({ statuses }: { statuses: MilestoneStatus[] }) {
  const [allOpen, setAllOpen] = useState(false);
  const unlocked = statuses.filter((s) => s.tier).length;
  const next = pickNextTarget(statuses);
  const top = latestTopMedal(statuses);
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
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#35C5D0]/30 bg-gradient-to-br from-white/80 to-[#EEF9FB]/80 px-4 py-3 shadow-[0_2px_12px_rgba(53,197,208,0.10)]">
              {next ? (
                <>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[#1597A3]">
                    Target berikutnya
                  </p>
                  <p className="mt-1 flex items-start gap-2 text-base font-semibold text-[#17263D]">
                    <TierMedal tier={next.tier} size={26} decorative className="mt-0.5 shrink-0" />
                    <span>
                      {next.status.milestone.label} &middot;{" "}
                      {formatMilestoneValue(next.status.milestone.metric_type, next.value)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {next.status.bestValue === null
                      ? "Belum ada percobaan"
                      : `Rekor terbaik: ${formatMilestoneValue(
                          next.status.milestone.metric_type,
                          next.status.bestValue
                        )}`}
                  </p>
                  {isSupervisedOnly(next.status.milestone.metric_type) && (
                    <p className="mt-1 text-xs text-slate-500">{SUPERVISED_NOTE}</p>
                  )}
                </>
              ) : (
                <p className="text-sm font-medium text-[#17263D]">Semua medali sudah emas 🎉</p>
              )}
            </div>

            {top && top.tier && (
              <div className={`rounded-2xl border px-4 py-3 ${TIER_STYLE[top.tier]}`}>
                <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">
                  Medali tertinggi
                </p>
                <p className="mt-1 flex items-start gap-2 text-base font-semibold">
                  <TierMedal tier={top.tier} size={26} decorative className="mt-0.5 shrink-0" />
                  <span>{top.milestone.label}</span>
                </p>
                <p className="mt-0.5 text-sm">
                  {MEDAL_NAME[top.tier]}
                  {top.bestValue !== null
                    ? ` · ${formatMilestoneValue(top.milestone.metric_type, top.bestValue)}`
                    : ""}
                </p>
              </div>
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
