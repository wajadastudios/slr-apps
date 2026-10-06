"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassTextarea } from "@/components/ui/glass-textarea";
import { ToastForm } from "@/components/ui/toast-form";
import { AccordionItem } from "@/components/ui/accordion";
import { ImpactConfirm } from "@/components/admin/impact-confirm";
import { LEVEL_NAMES } from "@/lib/curriculum/types";
import {
  addCurriculumIndicatorAction,
  newTargetVersionAction,
  saveCurriculumIndicatorAction,
  saveSkillRuleAction,
  setCurriculumModeAction,
  setTestActiveAction,
} from "./curriculum-actions";

export type AdminTarget = {
  id: string;
  level: number | null;
  value: number;
  requiresUnassisted: boolean;
  requiresTechnique: boolean;
  version: number;
  active: boolean;
};
export type AdminTest = {
  id: string;
  label: string;
  measure: "distance_m" | "duration_s" | "checklist";
  levelSpecific: boolean;
  active: boolean;
  targets: AdminTarget[];
};
export type AdminRule = { level: number | null; masteryMinScore: number; minEvidenceSessions: number; requiresTest: boolean };
export type AdminIndicator = {
  id: string;
  level: number | null;
  label: string;
  description: string | null;
  rubric: string | null;
  required: boolean;
  active: boolean;
  sortOrder: number;
};
export type AdminSkill = {
  id: string;
  name: string;
  hasLevels: boolean;
  rules: AdminRule[];
  indicators: AdminIndicator[];
  tests: AdminTest[];
};

const HEADING = "font-[family-name:var(--font-quicksand)] text-lg font-bold text-[#17263D]";
const SUB = "text-sm font-semibold text-[#17263D]";
const LABEL = "text-xs font-medium text-slate-600";
const SAVE = "!bg-[#0E7C89] px-4 py-1.5 text-sm !text-white hover:!bg-[#0A6570]";

const levelTitle = (level: number | null) =>
  level === null ? "Tanpa level" : `Level ${level} — ${LEVEL_NAMES[level as 1 | 2 | 3]}`;

function unit(m: AdminTest["measure"]) {
  return m === "distance_m" ? "m" : m === "duration_s" ? "detik" : "";
}

function RuleRow({ programId, skillId, rule, level }: { programId: string; skillId: string; rule: AdminRule | undefined; level: number | null }) {
  return (
    <ToastForm action={saveSkillRuleAction} className="flex flex-wrap items-end gap-3 rounded-xl bg-white/50 px-3 py-2" pendingLabel="Menyimpan...">
      <input type="hidden" name="program_id" value={programId} />
      <input type="hidden" name="group_id" value={skillId} />
      <input type="hidden" name="level" value={level ?? ""} />
      <span className="min-w-[10rem] text-sm font-medium text-slate-800">{levelTitle(level)}</span>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>Skor minimal (0-5)</span>
        <GlassInput name="mastery_min_score" type="number" min={0} max={5} step={0.5} defaultValue={rule?.masteryMinScore ?? 4} className="w-24 text-sm" />
      </label>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>Sesi bukti</span>
        <GlassInput name="min_evidence_sessions" type="number" min={1} max={20} defaultValue={rule?.minEvidenceSessions ?? 2} className="w-24 text-sm" />
      </label>
      <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="requires_test" defaultChecked={rule?.requiresTest ?? false} className="h-4 w-4" />
        Tes wajib
      </label>
      <GlassButton type="submit" className={SAVE}>
        Simpan
      </GlassButton>
    </ToastForm>
  );
}

function TargetBlock({ programId, test, level }: { programId: string; test: AdminTest; level: number | null }) {
  const versions = test.targets.filter((t) => t.level === level).sort((a, b) => b.version - a.version);
  const current = versions.find((t) => t.active);
  const past = versions.filter((t) => !t.active);
  const u = unit(test.measure);

  return (
    <div className="rounded-xl bg-white/50 px-3 py-2">
      <p className="text-sm font-medium text-slate-800">
        {levelTitle(level)}:{" "}
        {current ? (
          <>
            target <strong>{current.value} {u}</strong> <span className="text-xs text-slate-500">(versi {current.version})</span>
          </>
        ) : (
          <span className="text-slate-500">belum ada target</span>
        )}
      </p>
      {past.length > 0 && (
        <p className="text-xs text-slate-500">
          Versi sebelumnya: {past.map((t) => `v${t.version} ${t.value} ${u}`).join(", ")}. Hasil lama tetap dinilai terhadap target saat dicatat.
        </p>
      )}
      <ToastForm action={newTargetVersionAction} className="mt-2 flex flex-wrap items-end gap-3" pendingLabel="Menyimpan...">
        <input type="hidden" name="program_id" value={programId} />
        <input type="hidden" name="test_type_id" value={test.id} />
        <input type="hidden" name="level" value={level ?? ""} />
        <label className="flex flex-col gap-1">
          <span className={LABEL}>{current ? "Target baru" : "Target"} ({u})</span>
          <GlassInput name="target_value" type="number" min={1} step="any" required defaultValue={current?.value ?? ""} className="w-28 text-sm" />
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="requires_unassisted" defaultChecked={current?.requiresUnassisted ?? true} className="h-4 w-4" />
          Tanpa bantuan
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="requires_technique" defaultChecked={current?.requiresTechnique ?? true} className="h-4 w-4" />
          Syarat teknik
        </label>
        <GlassButton type="submit" className={SAVE}>
          {current ? "Simpan sebagai versi baru" : "Simpan target"}
        </GlassButton>
      </ToastForm>
    </div>
  );
}

function IndicatorEditor({ programId, indicator, live }: { programId: string; indicator: AdminIndicator; live: boolean }) {
  return (
    <details className="rounded-xl border border-white/60 bg-white/50">
      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-[#17263D]">
        <span>
          {indicator.label}
          {!indicator.required && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">tidak wajib</span>}
        </span>
        {live && !indicator.active && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">nonaktif</span>}
      </summary>
      <ToastForm action={saveCurriculumIndicatorAction} className="flex flex-col gap-2 px-3 pb-3" pendingLabel="Menyimpan...">
        <input type="hidden" name="program_id" value={programId} />
        <input type="hidden" name="id" value={indicator.id} />
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Nama indikator</span>
          <GlassInput name="label" defaultValue={indicator.label} required className="text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Deskripsi (apa yang diamati)</span>
          <GlassTextarea name="description" rows={2} defaultValue={indicator.description ?? ""} className="text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Rubrik / contoh kriteria bintang</span>
          <GlassTextarea name="rubric" rows={3} defaultValue={indicator.rubric ?? ""} className="text-sm" />
        </label>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Urutan</span>
            <GlassInput name="sort_order" type="number" defaultValue={indicator.sortOrder} className="w-24 text-sm" />
          </label>
          <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="required" defaultChecked={indicator.required} className="h-4 w-4" />
            Wajib (dihitung dalam ringkasan dan kelulusan)
          </label>
          {live && (
            <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="active" defaultChecked={indicator.active} className="h-4 w-4" />
              Aktif
            </label>
          )}
          <GlassButton type="submit" className={SAVE}>
            Simpan
          </GlassButton>
        </div>
      </ToastForm>
    </details>
  );
}

function AddIndicator({ programId, skill }: { programId: string; skill: AdminSkill }) {
  return (
    <details className="rounded-xl border border-dashed border-[#0E7C89]/40 bg-white/40">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-[#0B6470]">+ Tambah indikator</summary>
      <ToastForm action={addCurriculumIndicatorAction} resetOnSuccess className="flex flex-col gap-2 px-3 pb-3" pendingLabel="Menyimpan...">
        <input type="hidden" name="program_id" value={programId} />
        <input type="hidden" name="group_id" value={skill.id} />
        {skill.hasLevels && (
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Level</span>
            <select name="level" required defaultValue="" className="min-h-10 rounded-xl border border-white/60 bg-white/70 px-3 text-sm">
              <option value="" disabled>
                Pilih level
              </option>
              {[1, 2, 3].map((l) => (
                <option key={l} value={l}>
                  {levelTitle(l)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Nama indikator</span>
          <GlassInput name="label" required className="text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Deskripsi</span>
          <GlassTextarea name="description" rows={2} className="text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Rubrik / contoh kriteria bintang</span>
          <GlassTextarea name="rubric" rows={3} className="text-sm" />
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="required" defaultChecked className="h-4 w-4" />
          Wajib
        </label>
        <GlassButton type="submit" className={`${SAVE} w-fit`}>
          Tambah
        </GlassButton>
      </ToastForm>
    </details>
  );
}

function SkillPanel({ programId, skill, live }: { programId: string; skill: AdminSkill; live: boolean }) {
  const levels: (number | null)[] = skill.hasLevels ? [1, 2, 3] : [null];
  const ruleOf = (level: number | null) => skill.rules.find((r) => r.level === level);

  return (
    <div className="flex flex-col gap-4 px-4 pb-4 pt-1">
      <section className="flex flex-col gap-2">
        <h3 className={SUB}>Aturan kelulusan / dikuasai</h3>
        <p className="text-xs text-slate-600">
          Kelulusan tidak ditentukan rata-rata: semua indikator wajib harus mencapai skor minimal pada jumlah sesi bukti ini
          {skill.hasLevels ? ", dan tes wajib harus tercapai" : ""}. Setelah itu pengajar yang mengonfirmasi.
        </p>
        {levels.map((l) => (
          <RuleRow key={String(l)} programId={programId} skillId={skill.id} rule={ruleOf(l)} level={l} />
        ))}
      </section>

      {skill.tests.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className={SUB}>Tes dan target</h3>
          {skill.tests.map((t) => (
            <div key={t.id} className="flex flex-col gap-2 rounded-2xl border border-white/60 bg-white/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[#17263D]">
                  {t.label}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    ({t.measure === "distance_m" ? "jarak (m)" : t.measure === "duration_s" ? "durasi (detik)" : "rangkaian, lulus/belum"})
                  </span>
                </p>
                <ToastForm action={setTestActiveAction} pendingLabel="Menyimpan...">
                  <input type="hidden" name="program_id" value={programId} />
                  <input type="hidden" name="test_type_id" value={t.id} />
                  <GlassButton type="submit" name="active" value={t.active ? "0" : "1"} className="px-3 py-1 text-xs">
                    {t.active ? "Nonaktifkan tes" : "Aktifkan tes"}
                  </GlassButton>
                </ToastForm>
              </div>
              {t.measure === "checklist" ? (
                <p className="text-xs text-slate-600">Tes ini lulus bila seluruh langkah terpenuhi; tidak memakai target angka.</p>
              ) : (
                (t.levelSpecific ? [1, 2, 3] : [null]).map((l) => <TargetBlock key={String(l)} programId={programId} test={t} level={l} />)
              )}
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className={SUB}>Indikator dan rubrik</h3>
        {levels.map((l) => {
          const list = skill.indicators.filter((i) => i.level === l).sort((a, b) => a.sortOrder - b.sortOrder);
          return (
            <div key={String(l)} className="flex flex-col gap-1.5">
              {skill.hasLevels && <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{levelTitle(l)}</p>}
              {list.length === 0 && <p className="text-xs text-slate-500">Belum ada indikator.</p>}
              {list.map((i) => (
                <IndicatorEditor key={i.id} programId={programId} indicator={i} live={live} />
              ))}
            </div>
          );
        })}
        <AddIndicator programId={programId} skill={skill} />
      </section>
    </div>
  );
}

export function CurriculumAdmin({
  programId,
  programName,
  mode,
  skills,
}: {
  programId: string;
  programName: string;
  mode: "legacy" | "levels_v1";
  skills: AdminSkill[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const live = mode === "levels_v1";
  const indicatorCount = skills.reduce((n, s) => n + s.indicators.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={HEADING}>Kurikulum Level &mdash; {programName}</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${live ? "bg-[#DDF7EC] text-[#0E5A43]" : "bg-[#FFF1CC] text-[#7A5400]"}`}
          >
            {live ? "Aktif" : "Belum diaktifkan (memakai penilaian lama)"}
          </span>
        </div>
        <p className="text-sm text-slate-700">
          Enam skill: Dasar, Water Safety, dan empat gaya dengan Level 1-3. {skills.length} skill, {indicatorCount} indikator. Anda dapat
          mengubah rubrik, indikator wajib, target jarak, dan aturan kelulusan di bawah ini kapan saja; setiap perubahan menaikkan versi
          kurikulum dan tidak menulis ulang makna penilaian lama.
        </p>
        <p className="rounded-xl bg-[#FFF8E1] px-3 py-2 text-xs text-[#6b5200]">
          Isi awal (teks rubrik, target 10/25/50 m dan 5/10/25 m untuk Kupu-kupu, serta batas lulus skor 4 pada 2 sesi) adalah usulan awal
          SLR yang perlu divalidasi tim pengajar. Ini target internal SLR, bukan standar internasional.
        </p>
        <ToastForm action={setCurriculumModeAction} className="flex flex-wrap items-center gap-3" pendingLabel="Menyimpan...">
          <input type="hidden" name="program_id" value={programId} />
          {live ? (
            <ImpactConfirm
              label="Kembali ke penilaian lama"
              title="Kembali ke penilaian lama?"
              impacts={[
                "Form laporan dan tampilan orang tua kembali ke model penilaian lama.",
                "Indikator lama aktif seperti sebelum kurikulum level diaktifkan.",
                "Laporan yang sudah dibuat dengan kurikulum level tidak dihapus.",
              ]}
              name="mode"
              value="legacy"
              destructive
              confirmLabel="Ya, kembali"
            />
          ) : (
            <ImpactConfirm
              label="Aktifkan kurikulum level"
              title={`Aktifkan kurikulum level untuk ${programName}?`}
              impacts={[
                "Pengajar memakai form baru: skill, level per gaya, status dinilai/tidak dinilai, dan tes kemampuan.",
                "Orang tua melihat profil enam skill, grafik teknik, dan pencapaian; skor keseluruhan tidak ditampilkan lagi.",
                "Indikator lama disembunyikan (tidak dihapus). Riwayat lama tampil sebagai “Penilaian sebelum kurikulum level” tanpa dipetakan ke level.",
                "Anda dapat kembali ke penilaian lama kapan saja.",
              ]}
              name="mode"
              value="levels_v1"
              primary
              confirmLabel="Ya, aktifkan"
            />
          )}
        </ToastForm>
      </GlassCard>

      {skills.map((s) => (
        <GlassCard key={s.id} className="!p-0">
          <AccordionItem
            variant="ortu"
            chevronSize="sm"
            open={open === s.id}
            onToggle={() => setOpen(open === s.id ? null : s.id)}
            className="rounded-3xl"
            headerClassName="min-h-16 rounded-3xl px-4 py-2.5"
            header={
              <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
                <span className="text-base font-bold text-[#17263D]">{s.name}</span>
                <span className="text-xs text-slate-500">
                  {s.indicators.length} indikator{s.hasLevels ? " · Level 1-3" : ""}
                  {s.tests.length > 0 ? ` · ${s.tests.length} tes` : ""}
                </span>
              </span>
            }
          >
            <SkillPanel programId={programId} skill={s} live={live} />
          </AccordionItem>
        </GlassCard>
      ))}
    </div>
  );
}
