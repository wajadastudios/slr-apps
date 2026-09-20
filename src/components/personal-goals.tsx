"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { AccordionItem } from "@/components/ui/accordion";
import { ToastForm } from "@/components/ui/toast-form";
import { ConfirmSubmitButton } from "@/components/ui/confirm-button";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/lib/ui-classes";
import type { ActionState } from "@/lib/action-result";
import {
  GOAL_UNITS,
  formatGoalValue,
  goalProgress,
  type GoalEntry,
  type GoalStanding,
  type PersonalGoal,
} from "@/lib/personal-goals";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const STANDING_TONE: Record<GoalStanding, string> = {
  no_data: "bg-slate-100 text-slate-600",
  in_progress: "bg-[#DFF3FF] text-[#0b5f8a]",
  above_baseline: "bg-[#DDF7EE] text-[#0f6b52]",
  personal_best: "bg-[#FFF3C4] text-[#7a5c00]",
  target_reached: "bg-[#DDF7EE] text-[#0f6b52]",
};

function GoalHeader({ goal, entries }: { goal: PersonalGoal; entries: GoalEntry[] }) {
  const progress = goalProgress(goal, entries);
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#17263D]">{goal.label}</p>
        <p className="text-xs text-slate-600">
          {goal.baseline !== null && <>Baseline {formatGoalValue(goal.baseline, goal.unit)} &middot; </>}
          Target pribadi {formatGoalValue(goal.target, goal.unit)}
        </p>
        {progress.best !== null && (
          <p className="text-xs text-slate-600">
            Terbaik {formatGoalValue(progress.best, goal.unit)}
            {progress.latest !== progress.best && progress.latest !== null && (
              <> &middot; terakhir {formatGoalValue(progress.latest, goal.unit)}</>
            )}
          </p>
        )}
      </div>
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STANDING_TONE[progress.standing]}`}>
        {progress.label}
      </span>
    </div>
  );
}

// Read-only view for the participant / parent: individual progress only.
export function PersonalGoalsView({
  goals,
  entries,
}: {
  goals: PersonalGoal[];
  entries: GoalEntry[];
}) {
  const active = goals.filter((g) => g.status === "active");

  return (
    <GlassCard>
      <h2 className="mb-1 font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
        Target Pribadi
      </h2>
      <p className="mb-4 text-sm text-slate-600">
        Target disusun bersama pengajar sesuai kebutuhan dan ritme masing-masing. Yang dilihat hanyalah
        perkembangan dari titik awal sendiri.
      </p>
      {active.length === 0 ? (
        <p className="text-sm text-slate-600">Belum ada target pribadi. Pengajar akan menyusunnya bersama Anda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {active.map((goal) => {
            const own = entries.filter((e) => e.goal_id === goal.id);
            const recent = [...own].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at)).slice(0, 3);
            return (
              <li key={goal.id} className="rounded-2xl border border-white/60 bg-white/55 px-4 py-3">
                <GoalHeader goal={goal} entries={own} />
                {recent.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-0.5 text-xs text-slate-500">
                    {recent.map((e) => (
                      <li key={e.id}>
                        {e.recorded_at} &middot; {formatGoalValue(e.value, goal.unit)}
                        {e.note ? ` · ${e.note}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}

// For the assigned pengajar and admin: set goals, log progress.
export function PersonalGoalsManager({
  goals,
  entries,
  hidden,
  today,
  createAction,
  entryAction,
  deleteEntryAction,
  archiveAction,
}: {
  goals: PersonalGoal[];
  entries: GoalEntry[];
  // hidden fields every form must carry (enrollment id, page to return to, ...)
  hidden: Record<string, string>;
  today: string;
  createAction: Action;
  entryAction: Action;
  deleteEntryAction: Action;
  archiveAction: Action;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const active = goals.filter((g) => g.status === "active");

  const hiddenFields = Object.entries(hidden).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));

  return (
    <GlassCard>
      <h2 className="mb-1 font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]">
        Target Pribadi
      </h2>
      <p className="mb-4 text-sm text-slate-600">
        Target bersifat individual: dinilai dari baseline dan target peserta sendiri, tanpa medali dan tanpa
        perbandingan antarpeserta.
      </p>

      <div className="flex flex-col gap-2">
        {active.length === 0 && <p className="text-sm text-slate-500">Belum ada target pribadi.</p>}
        {active.map((goal) => {
          const own = entries
            .filter((e) => e.goal_id === goal.id)
            .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
          return (
            <AccordionItem
              key={goal.id}
              variant="ortu"
              chevronSize="sm"
              open={openId === goal.id}
              onToggle={() => setOpenId((cur) => (cur === goal.id ? null : goal.id))}
              className="rounded-2xl border border-white/60 bg-white/55"
              headerClassName="min-h-14 rounded-2xl px-4 py-2"
              header={
                <span className="min-w-0 flex-1">
                  <GoalHeader goal={goal} entries={own} />
                </span>
              }
            >
              <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
                <ToastForm action={entryAction} resetOnSuccess className="flex flex-wrap items-end gap-2">
                  {hiddenFields}
                  <input type="hidden" name="goal_id" value={goal.id} />
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-600">Pencapaian ({goal.unit})</label>
                    <GlassInput name="value" type="number" min={0} step="any" required className="w-28 text-sm" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-600">Tanggal</label>
                    <GlassInput name="recorded_at" type="date" required defaultValue={today} className="text-sm" />
                  </div>
                  <div className="flex min-w-[140px] flex-1 flex-col gap-1">
                    <label className="text-xs text-slate-600">Catatan (opsional)</label>
                    <GlassInput name="note" maxLength={200} className="text-sm" />
                  </div>
                  <GlassButton type="submit" className={`${PRIMARY_BUTTON} px-4 py-2 text-xs`}>
                    Catat
                  </GlassButton>
                </ToastForm>

                {own.length > 0 && (
                  <ul className="flex flex-col gap-1">
                    {own.slice(0, 8).map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                        <span>
                          {e.recorded_at} &middot; {formatGoalValue(e.value, goal.unit)}
                          {e.note ? <span className="text-slate-500"> · {e.note}</span> : null}
                        </span>
                        <ToastForm action={deleteEntryAction} pendingLabel="">
                          {hiddenFields}
                          <input type="hidden" name="entry_id" value={e.id} />
                          <ConfirmSubmitButton
                            message="Hapus catatan pencapaian ini?"
                            className="!border-red-300 !bg-red-500/10 px-2.5 py-1 text-xs !text-red-700 hover:!bg-red-500/20"
                          >
                            Hapus
                          </ConfirmSubmitButton>
                        </ToastForm>
                      </li>
                    ))}
                  </ul>
                )}

                <ToastForm action={archiveAction} pendingLabel="Memproses...">
                  {hiddenFields}
                  <input type="hidden" name="goal_id" value={goal.id} />
                  <ConfirmSubmitButton
                    message={`Arsipkan target "${goal.label}"? Catatan pencapaiannya tetap tersimpan.`}
                    className="px-3 py-1.5 text-xs"
                  >
                    Arsipkan target
                  </ConfirmSubmitButton>
                </ToastForm>
              </div>
            </AccordionItem>
          );
        })}
      </div>

      <AccordionItem
        variant="ortu"
        chevronSize="sm"
        open={addOpen}
        onToggle={() => setAddOpen((v) => !v)}
        className="mt-3 rounded-2xl border border-dashed border-[#35C5D0]/40"
        headerClassName="min-h-12 rounded-2xl px-4 py-2"
        header={<span className="text-sm font-medium text-[#17263D]">+ Tambah target pribadi</span>}
      >
        <ToastForm action={createAction} resetOnSuccess className="grid gap-3 px-4 pb-4 pt-1 sm:grid-cols-2">
          {hiddenFields}
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-xs text-slate-600">Target (contoh: Mengapung tanpa bantuan)</label>
            <GlassInput name="label" required maxLength={120} className="text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-600">Satuan</label>
            <GlassSelect name="unit" defaultValue="detik" glassChevron>
              {GOAL_UNITS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </GlassSelect>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-600">Baseline</label>
              <GlassInput name="baseline" type="number" min={0} step="any" className="text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-600">Target</label>
              <GlassInput name="target" type="number" min={0.1} step="any" required className="text-sm" />
            </div>
          </div>
          <GlassButton type="submit" className={`${SECONDARY_BUTTON} w-fit px-4 py-2 text-sm sm:col-span-2`}>
            Simpan Target
          </GlassButton>
        </ToastForm>
      </AccordionItem>
    </GlassCard>
  );
}
