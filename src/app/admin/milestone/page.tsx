import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { ToastForm } from "@/components/ui/toast-form";
import { ConfirmSubmitButton } from "@/components/ui/confirm-button";
import { loadMilestones } from "@/lib/milestone-loader";
import { computeAwards, formatMilestoneValue } from "@/lib/milestones";
import { METRIC_LABELS } from "@/lib/performance";
import { SECONDARY_BUTTON } from "@/lib/ui-classes";
import { MoveButtons } from "@/components/move-buttons";
import { MilestoneForm } from "./milestone-form";
import {
  createMilestoneAction,
  updateMilestoneAction,
  toggleMilestoneActiveAction,
  moveMilestoneAction,
  deleteMilestoneAction,
} from "./actions";

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";

export default async function MilestonePage() {
  const supabase = await createClient();

  const { error: tableError } = await supabase.from("milestones").select("id").limit(1);
  const milestones = await loadMilestones(supabase);

  // Frozen awards count as-is; records saved before milestones were editable
  // (awards null) are evaluated against the current targets, same as the badges.
  const { data: recordRows } = await supabase.from("performance_records").select("*");
  const usage = new Map<string, number>();
  for (const row of recordRows ?? []) {
    const awards =
      (row.awards as Record<string, string> | null) ??
      computeAwards(
        {
          metric_type: row.metric_type,
          stroke: row.stroke,
          distance_m: row.distance_m === null ? null : Number(row.distance_m),
          duration_seconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
        },
        milestones
      );
    for (const id of Object.keys(awards)) usage.set(id, (usage.get(id) ?? 0) + 1);
  }

  const levels = [...new Set(milestones.map((m) => m.level))];

  if (tableError) {
    return (
      <GlassCard>
        <h2 className={`mb-2 ${HEADING}`}>Milestone</h2>
        <p className="text-sm text-slate-700">
          Tabel milestone belum ada di database. Jalankan migrasi{" "}
          <code>0031_milestones_and_record_ownership.sql</code> di Supabase SQL Editor terlebih
          dahulu.
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <GlassCard>
        <h2 className={`mb-1 ${HEADING}`}>Milestone Siswa</h2>
        <p className="text-sm text-slate-600">
          Milestone adalah target rekor performa yang membuka lencana perunggu, perak, atau emas.
          Yang tampil di akun orang tua dan pengajar adalah milestone yang aktif.
        </p>
        <div className="mt-3 rounded-xl border border-[#35C5D0]/30 bg-[#EEF9FB] p-3 text-sm text-slate-700">
          <p className="font-semibold text-[#17263D]">Aturan lencana</p>
          <p className="mt-1">
            Lencana ditentukan <strong>saat rekor disimpan</strong>, berdasarkan target yang berlaku
            pada saat itu. Mengubah target hanya berlaku untuk rekor yang disimpan sesudahnya
            &mdash; lencana yang sudah diperoleh siswa tidak akan hilang. Milestone yang sudah
            menghasilkan lencana tidak bisa dihapus (cukup dinonaktifkan) dan metrik/gaya/jaraknya
            terkunci.
          </p>
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className={`mb-3 ${HEADING}`}>Tambah Milestone</h2>
        <MilestoneForm
          action={createMilestoneAction}
          levels={levels}
          submitLabel="Tambah Milestone"
          resetOnSuccess
        />
        <p className="mt-2 text-xs text-slate-500">
          Milestone baru dievaluasi satu kali terhadap rekor yang sudah ada, lalu targetnya tidak
          lagi mengubah lencana lama.
        </p>
      </GlassCard>

      <div className="flex flex-col gap-3">
        {milestones.length === 0 && (
          <GlassCard>
            <p className="text-sm text-slate-600">Belum ada milestone.</p>
          </GlassCard>
        )}
        {milestones.map((m, index) => {
          const used = usage.get(m.id) ?? 0;
          return (
            <GlassCard key={m.id} className={m.active ? "" : "opacity-80"}>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[#17263D]">
                    {m.label}
                    {!m.active && (
                      <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                        Nonaktif
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-600">
                    {m.level} &middot; {METRIC_LABELS[m.metric_type]}
                    {m.stroke ? ` · ${m.stroke}` : ""}
                    {m.distance_m ? ` · ${m.distance_m} m` : ""} &middot;{" "}
                    {formatMilestoneValue(m.metric_type, m.bronze)} /{" "}
                    {formatMilestoneValue(m.metric_type, m.silver)} /{" "}
                    {formatMilestoneValue(m.metric_type, m.gold)}
                    {used > 0 ? ` · ${used} lencana terbuka` : " · belum ada lencana"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <MoveButtons
                    action={moveMilestoneAction}
                    id={m.id}
                    canUp={index > 0}
                    canDown={index < milestones.length - 1}
                  />
                  <ToastForm action={toggleMilestoneActiveAction} pendingLabel="Memproses...">
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="next_active" value={(!m.active).toString()} />
                    <GlassButton type="submit" className={`${SECONDARY_BUTTON} px-3 py-1 text-xs`}>
                      {m.active ? "Nonaktifkan" : "Aktifkan"}
                    </GlassButton>
                  </ToastForm>
                  {used === 0 && (
                    <ToastForm action={deleteMilestoneAction} pendingLabel="Menghapus...">
                      <input type="hidden" name="id" value={m.id} />
                      <ConfirmSubmitButton
                        message={`Hapus milestone "${m.label}"? Tindakan ini tidak bisa dibatalkan.`}
                        className="!border-red-300 !bg-red-500/10 px-3 py-1 text-xs !text-red-700 hover:!bg-red-500/20"
                      >
                        Hapus
                      </ConfirmSubmitButton>
                    </ToastForm>
                  )}
                </div>
              </div>
              <MilestoneForm
                action={updateMilestoneAction}
                milestone={m}
                definitionLocked={used > 0}
                levels={levels}
                submitLabel="Simpan Perubahan"
              />
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
